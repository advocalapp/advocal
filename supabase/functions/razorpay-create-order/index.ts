/**
 * razorpay-create-order
 *
 * Creates a Razorpay Payment Link and returns the hosted rzp.io URL.
 * The app opens this URL directly — Razorpay hosts the full payment page
 * with all methods (UPI, Cards, Netbanking, Wallets).
 *
 * After payment, Razorpay GET-redirects the browser to our
 * razorpay-payment-link-callback Edge Function, which verifies the
 * HMAC signature and activates premium, then redirects to advocal://.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLANS: Record<string, { amount: number; label: string; days: number }> = {
  monthly: { amount: 4900,  label: 'AdvoCal Monthly Plan', days: 30  },
  yearly:  { amount: 49900, label: 'AdvoCal Yearly Plan',  days: 365 },
};

const CALLBACK_URL = 'https://wbwibjurhobukhkrjfqz.supabase.co/functions/v1/razorpay-payment-link-callback';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  console.log('[razorpay-create-order] Invoked:', req.method, new URL(req.url).pathname);

  try {
    const keyId     = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) throw new Error('Razorpay credentials not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { plan_type, probe_only } = await req.json();

    // probe_only: client uses this to detect live vs test mode
    if (probe_only) {
      return new Response(
        JSON.stringify({ key_id: keyId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const plan = PLANS[plan_type];
    if (!plan) return new Response(JSON.stringify({ error: 'Invalid plan' }), { status: 400, headers: corsHeaders });

    // Fetch user profile for prefill
    const { data: profile } = await supabase
      .from('profiles')
      .select('phone, full_name')
      .eq('id', user.id)
      .single();

    const credentials = btoa(`${keyId}:${keySecret}`);

    // Create Razorpay Payment Link — returns a hosted rzp.io URL, no custom HTML needed
    const linkBody = {
      amount:          plan.amount,
      currency:        'INR',
      description:     plan.label,
      reference_id:    `${user.id.replace(/-/g, '').slice(0, 28)}|${plan_type === 'yearly' ? 'y' : 'm'}${Math.random().toString(36).slice(2, 8)}`,
      customer: {
        name:    profile?.full_name ?? '',
        contact: profile?.phone    ?? '',
      },
      callback_url:    CALLBACK_URL,
      callback_method: 'get',
      options: {
        checkout: {
          name:  'AdvoCal',
          theme: { hide_topbar: false },
        },
      },
    };

    console.log('[razorpay-create-order] Creating payment link:', JSON.stringify({ amount: linkBody.amount, plan_type }));

    const rzpRes = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(linkBody),
    });

    const rzpBody = await rzpRes.json().catch(() => ({}));
    console.log('[razorpay-create-order] Razorpay response status:', rzpRes.status, JSON.stringify(rzpBody));

    if (!rzpRes.ok) {
      const desc = rzpBody?.error?.description ?? rzpBody?.error?.reason ?? JSON.stringify(rzpBody);
      throw new Error(`Razorpay (${rzpRes.status}): ${desc}`);
    }

    const link = rzpBody;

    // Store pending payment record keyed on the payment link id
    await supabase.from('payments').insert({
      user_id:           user.id,
      mobile_number:     profile?.phone ?? null,
      plan_type,
      amount:            plan.amount,
      currency:          'INR',
      razorpay_order_id: link.id,   // re-use order_id column to store link id
      payment_status:    'created',
    });

    return new Response(
      JSON.stringify({
        payment_link_url: link.short_url,   // e.g. https://rzp.io/l/xxxxxx
        link_id:          link.id,
        amount:           plan.amount,
        key_id:           keyId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('[razorpay-create-order] Error:', e?.message, e?.stack);
    return new Response(
      JSON.stringify({ error: e.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
