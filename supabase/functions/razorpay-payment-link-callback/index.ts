/**
 * razorpay-payment-link-callback
 *
 * Razorpay calls this via a browser GET redirect after the user completes
 * (or cancels) a Payment Link checkout on rzp.io.
 *
 * Query params from Razorpay:
 *   razorpay_payment_link_id          – plink_XXXX
 *   razorpay_payment_link_reference_id – our reference_id (userId|planType)
 *   razorpay_payment_link_status       – "paid" | "cancelled" | "expired"
 *   razorpay_payment_id               – pay_XXXX  (only when status=paid)
 *   razorpay_signature                – HMAC-SHA256 of above fields
 *
 * On success: activates premium → 302-redirects browser to advocal://payment-success
 * On cancel:  302-redirects browser to advocal://payment-cancelled
 * On failure: 302-redirects browser to advocal://payment-failed
 *
 * openAuthSessionAsync() in the app intercepts the advocal:// redirect and
 * returns immediately — the user never sees this page rendered.
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

// Firebase-hosted success/fail pages — proper HTML served by a real web host.
// Using 302 redirect from Edge Function avoids Supabase CDN content-type issues.
const BASE_URL = 'https://advocalweb.web.app';

function redirectTo(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: { 'Location': url, 'Cache-Control': 'no-store' },
  });
}

serve(async (req) => {
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
  const supabase  = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const p   = url.searchParams;

  const linkId      = p.get('razorpay_payment_link_id')           ?? '';
  const referenceId = p.get('razorpay_payment_link_reference_id') ?? '';
  const status      = p.get('razorpay_payment_link_status')       ?? '';
  const paymentId   = p.get('razorpay_payment_id')                ?? '';
  const signature   = p.get('razorpay_signature')                 ?? '';

  // Handle cancellation / expiry before signature check (no payment_id present)
  if (status === 'cancelled' || status === 'expired') {
    return redirectTo(`${BASE_URL}/payment-failed?desc=${encodeURIComponent('Payment was cancelled.')}`);
  }

  // Verify Razorpay signature for Payment Links
  // Payload: payment_link_id|reference_id|status|payment_id
  if (keySecret && signature) {
    const payload  = `${linkId}|${referenceId}|${status}|${paymentId}`;
    const expected = await hmacSha256Hex(keySecret, payload);
    if (expected !== signature) {
      return redirectTo(`${BASE_URL}/payment-failed?desc=${encodeURIComponent('Invalid payment signature.')}`);
    }
  }

  if (status !== 'paid' || !paymentId) {
    return redirectTo(`${BASE_URL}/payment-failed?desc=${encodeURIComponent('Payment not completed.')}`);
  }

  // Parse planType from reference_id
  // New format: "{28-char-userId-no-hyphens}|{planChar}{6-char-random}"
  // planChar: 'm' = monthly, 'y' = yearly
  const parts    = referenceId.split('|');
  const planChar = parts[1]?.[0] ?? 'm';
  const planType = planChar === 'y' ? 'yearly' : 'monthly';
  if (!parts[1]) {
    return redirectTo(`${BASE_URL}/payment-failed?desc=${encodeURIComponent('Invalid payment reference.')}`);
  }

  try {
    const { data: paymentRow } = await supabase
      .from('payments')
      .select('user_id')
      .eq('razorpay_order_id', linkId)
      .single();

    const userId = paymentRow?.user_id;
    if (!userId) {
      return redirectTo(`${BASE_URL}/payment-failed?desc=${encodeURIComponent('Payment record not found. Please contact support.')}`);
    }

    // Carry over remaining days from current active plan
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('subscription_end_date')
      .eq('id', userId)
      .single();

    const now        = new Date();
    const currentEnd = currentProfile?.subscription_end_date ? new Date(currentProfile.subscription_end_date) : null;
    const startBase  = (currentEnd && currentEnd > now) ? currentEnd : now;
    const days       = PLAN_DAYS[planType] ?? 30;
    const start      = now;
    const expiry     = new Date(startBase.getTime() + days * 24 * 60 * 60 * 1000);

    // Update payment record
    await supabase.from('payments').update({
      razorpay_payment_id: paymentId,
      payment_status:      'captured',
      webhook_verified:    true,
      subscription_start:  start.toISOString(),
      subscription_expiry: expiry.toISOString(),
    }).eq('razorpay_order_id', linkId);

    // Activate premium on user profile
    await supabase.from('profiles').update({
      subscription_status:     'premium',
      subscription_plan:       planType,
      subscription_start_date: start.toISOString(),
      subscription_end_date:   expiry.toISOString(),
      updated_at:              start.toISOString(),
    }).eq('id', userId);

    // 302 redirect to Firebase-hosted success page — no HTML from Edge Function
    return redirectTo(
      `${BASE_URL}/payment-success?payment_id=${encodeURIComponent(paymentId)}&activated=true`,
    );
  } catch (e: any) {
    return redirectTo(
      `${BASE_URL}/payment-failed?desc=${encodeURIComponent(e?.message ?? 'Activation failed. Please contact support.')}`,
    );
  }
});
