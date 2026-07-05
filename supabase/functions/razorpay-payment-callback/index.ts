/**
 * razorpay-payment-callback
 *
 * Razorpay POSTs to this URL after the user completes payment (callback_url).
 * Verifies HMAC signature, activates premium, then 302 → advocal://
 * so openAuthSessionAsync can intercept the deep link.
 */
import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc       = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PLAN_DAYS: Record<string, number> = { monthly: 30, yearly: 365 };

function deepLink(path: string, params?: Record<string, string>): Response {
  const qs  = params
    ? '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    : '';
  return new Response(null, {
    status: 302,
    headers: { 'Location': `advocal://${path}${qs}`, 'Cache-Control': 'no-store' },
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
  const supabase  = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let paymentId = '';
  let orderId   = '';
  let signature = '';

  try {
    const ct = req.headers.get('content-type') ?? '';
    if (ct.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(await req.text());
      paymentId = params.get('razorpay_payment_id') ?? '';
      orderId   = params.get('razorpay_order_id')   ?? '';
      signature = params.get('razorpay_signature')  ?? '';
    } else {
      const json = await req.json() as Record<string, string>;
      paymentId = json['razorpay_payment_id'] ?? '';
      orderId   = json['razorpay_order_id']   ?? '';
      signature = json['razorpay_signature']  ?? '';
    }
  } catch {
    return deepLink('payment-failed', { desc: 'Invalid callback data' });
  }

  if (!paymentId || !orderId || !signature) {
    return deepLink('payment-failed', { desc: 'Missing payment parameters' });
  }

  // Verify: Razorpay signs order_id + "|" + payment_id
  const expected = await hmacSha256Hex(keySecret, `${orderId}|${paymentId}`);
  if (expected !== signature) {
    return deepLink('payment-failed', { desc: 'Signature verification failed' });
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('user_id, plan_type')
    .eq('razorpay_order_id', orderId)
    .single();

  if (!payment) {
    return deepLink('payment-failed', { desc: 'Payment record not found' });
  }

  const { user_id: userId, plan_type: planType } = payment as { user_id: string; plan_type: string };

  try {
    // Carry over remaining days from current active plan
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('subscription_end_date')
      .eq('id', userId)
      .single();

    const now         = new Date();
    const currentEnd  = currentProfile?.subscription_end_date ? new Date(currentProfile.subscription_end_date) : null;
    const startBase   = (currentEnd && currentEnd > now) ? currentEnd : now;
    const days        = PLAN_DAYS[planType] ?? 30;
    const start       = now;
    const expiry      = new Date(startBase.getTime() + days * 24 * 60 * 60 * 1000);

    await supabase.from('payments').update({
      razorpay_payment_id: paymentId,
      payment_status:      'captured',
      webhook_verified:    true,
      subscription_start:  start.toISOString(),
      subscription_expiry: expiry.toISOString(),
    }).eq('razorpay_order_id', orderId);

    await supabase.from('profiles').update({
      subscription_status:     'premium',
      subscription_plan:       planType,
      subscription_start_date: start.toISOString(),
      subscription_end_date:   expiry.toISOString(),
      updated_at:              start.toISOString(),
    }).eq('id', userId);

    return deepLink('payment-success', { payment_id: paymentId, activated: 'true' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Activation failed';
    return deepLink('payment-failed', { desc: msg });
  }
});
