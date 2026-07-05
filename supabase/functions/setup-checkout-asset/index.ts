/**
 * setup-checkout-asset
 *
 * One-shot setup function: uploads the Razorpay checkout HTML to
 * Supabase Storage so it can be opened by Chrome Custom Tabs as a real
 * CDN URL (which correctly renders HTML, unlike Edge Function URLs).
 *
 * Call once after deploy. Idempotent — re-uploading is safe.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const BUCKET  = 'advocal-public';
const FILE    = 'checkout.html';

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>AdvoCal — Secure Payment</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,sans-serif;background:#f0f4ff}
    .loading{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;padding:24px;text-align:center}
    .spinner{width:40px;height:40px;border:3px solid #e0e8ff;border-top-color:#1a56db;border-radius:50%;animation:spin 0.8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .msg{font-size:16px;color:#1a56db;font-weight:600}
    .sub{font-size:13px;color:#6b7280;margin-top:4px}
    .test-banner{background:#fef3c7;color:#b45309;font-size:13px;font-weight:700;text-align:center;padding:10px 16px;border-bottom:2px solid #f59e0b}
    .test-hint{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin:16px;font-size:12px;color:#78350f;line-height:1.6}
  </style>
</head>
<body>
  <div id="testBanner" style="display:none" class="test-banner">
    🧪 TEST MODE — Use test card. No real money charged.
  </div>
  <div class="loading">
    <div class="spinner"></div>
    <div class="msg">Opening Secure Payment</div>
    <div class="sub">Please wait…</div>
  </div>
  <div id="testHint" style="display:none" class="test-hint">
    <strong>Test Card:</strong> 4111 1111 1111 1111 &nbsp;·&nbsp; Any future expiry &nbsp;·&nbsp; Any CVV<br>
    <strong>Test UPI:</strong> success@razorpay
  </div>

  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    var params  = new URLSearchParams(window.location.search);
    var orderId = params.get('order_id')    || '';
    var keyId   = params.get('key_id')      || '';
    var amount  = params.get('amount')      || '0';
    var desc    = params.get('description') || 'AdvoCal Subscription';
    var name    = params.get('name')        || '';
    var contact = params.get('contact')     || '';
    var isTest  = keyId.indexOf('rzp_test_') === 0;

    if (isTest) {
      document.getElementById('testBanner').style.display = 'block';
      document.getElementById('testHint').style.display   = 'block';
    }

    var options = {
      key:         keyId,
      amount:      amount,
      currency:    'INR',
      name:        'AdvoCal',
      description: desc,
      order_id:    orderId,
      prefill:     { name: name, contact: contact },
      theme:       { color: '#1A56DB' },
      handler: function(r) {
        window.location.href = 'advocal://payment-success'
          + '?payment_id=' + encodeURIComponent(r.razorpay_payment_id)
          + '&order_id='   + encodeURIComponent(r.razorpay_order_id)
          + '&signature='  + encodeURIComponent(r.razorpay_signature);
      },
      modal: {
        ondismiss: function() {
          window.location.href = 'advocal://payment-cancelled';
        }
      }
    };

    var rzp = new Razorpay(options);
    rzp.on('payment.failed', function(r) {
      window.location.href = 'advocal://payment-failed'
        + '?code=' + encodeURIComponent(r.error.code || '')
        + '&desc=' + encodeURIComponent(r.error.description || 'Payment failed');
    });

    setTimeout(function() { rzp.open(); }, 400);
  </script>
</body>
</html>`;

serve(async () => {
  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
                      ?? Deno.env.get('SERVICE_ROLE_KEY')
                      ?? '';

  if (!serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Service role key not available' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Upload checkout.html via Storage REST API
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${FILE}`;
  const res = await fetch(uploadUrl, {
    method:  'POST',
    headers: {
      'Authorization':  `Bearer ${serviceRoleKey}`,
      'Content-Type':   'text/html; charset=utf-8',
      'x-upsert':       'true',
    },
    body: html,
  });

  const resText = await res.text();
  if (!res.ok) {
    // Log env var names for debugging (not values)
    const envKeys = [...Deno.env.toObject()].map(([k]) => k).join(',');
    return new Response(JSON.stringify({ error: resText, status: res.status, env_keys: envKeys }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${FILE}`;
  return new Response(
    JSON.stringify({ success: true, public_url: publicUrl }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
