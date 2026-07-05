/**
 * razorpay-verify-payment
 *
 * Called in TWO ways:
 *  1. POST from app after payment dialog closes  → body: { order_id, payment_id, signature }
 *  2. POST from Razorpay webhook server          → body: Razorpay webhook event (X-Razorpay-Signature header)
 *
 * Both paths verify the HMAC-SHA256 signature before activating premium.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

/** HMAC-SHA256 using Web Crypto (built into Deno — no external imports needed) */
async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

const PLAN_DAYS: Record<string, number> = { monthly: 30, yearly: 365 };

async function activatePremium(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  paymentId: string,
  signature: string,
) {
  // Fetch payment row
  const { data: payment, error: fetchErr } = await supabase
    .from('payments')
    .select('*')
    .eq('razorpay_order_id', orderId)
    .single();

  if (fetchErr || !payment) throw new Error('Payment record not found for order: ' + orderId);
  if (payment.payment_status === 'captured') return { already_captured: true };

  const days   = PLAN_DAYS[payment.plan_type] ?? 30;
  const start  = new Date();
  const expiry = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

  // Update payment record
  await supabase.from('payments').update({
    razorpay_payment_id:  paymentId,
    razorpay_signature:   signature,
    payment_status:       'captured',
    webhook_verified:     true,
    subscription_start:   start.toISOString(),
    subscription_expiry:  expiry.toISOString(),
  }).eq('razorpay_order_id', orderId);

  // Activate premium on user profile
  await supabase.from('profiles').update({
    subscription_status:     'premium',
    subscription_plan:       payment.plan_type,
    subscription_start_date: start.toISOString(),
    subscription_end_date:   expiry.toISOString(),
    updated_at:              start.toISOString(),
  }).eq('id', payment.user_id);

  return {
    success: true,
    user_id:             payment.user_id,
    plan_type:           payment.plan_type,
    subscription_expiry: expiry.toISOString(),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const keySecret     = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
  // RAZORPAY_WEBHOOK_SECRET is optional — webhook verification is skipped when not set.
  // App-side payment verification (PATH 2) works with just the KEY_SECRET.
  const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const rawBody = await req.text();

  // ── PATH 1: Razorpay Webhook (server-to-server) ──────────────────────────────
  // Only active when RAZORPAY_WEBHOOK_SECRET is configured in Supabase secrets.
  // Skip silently if the secret is not yet set — app-side verification still works.
  const webhookSig = req.headers.get('x-razorpay-signature');
  if (webhookSig && webhookSecret) {
    const expected = await hmacSha256Hex(webhookSecret, rawBody);
    if (expected !== webhookSig) {
      return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(rawBody);
    if (event.event === 'payment.captured') {
      const p = event.payload.payment.entity;
      try {
        await activatePremium(supabase, p.order_id, p.id, webhookSig);
      } catch (e: any) {
        console.error('Webhook activation failed:', e.message);
      }
    }

    // Always 200 to Razorpay so it doesn't retry
    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── PATH 2: App-side verification (after checkout dialog) ────────────────────
  // Requires user auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: corsHeaders,
    });
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: corsHeaders,
    });
  }

  let body: any;
  try { body = JSON.parse(rawBody); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
  }

  const { order_id, payment_id, signature } = body;
  if (!order_id || !payment_id || !signature) {
    return new Response(JSON.stringify({ error: 'Missing order_id, payment_id, or signature' }), {
      status: 400, headers: corsHeaders,
    });
  }

  // Verify HMAC-SHA256: key = keySecret, message = order_id|payment_id
  const expectedSig = await hmacSha256Hex(keySecret, `${order_id}|${payment_id}`);
  if (expectedSig !== signature) {
    // Mark payment as failed
    await supabase.from('payments').update({
      payment_status: 'failed',
      error_description: 'Signature mismatch',
    }).eq('razorpay_order_id', order_id);

    return new Response(JSON.stringify({ error: 'Invalid payment signature' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await activatePremium(supabase, order_id, payment_id, signature);
    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
