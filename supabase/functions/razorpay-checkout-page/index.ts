/**
 * razorpay-checkout-page
 *
 * Serves the Razorpay Standard Checkout HTML for Chrome Custom Tabs.
 *
 * Key design:
 *  - redirect: false  → Razorpay renders a MODAL OVERLAY on our page (not a full-page redirect).
 *                        The modal works inside Chrome Custom Tabs on Android.
 *  - handler function → On payment success, JS sets window.location.href = "advocal://payment-success?..."
 *                        openAuthSessionAsync on Android intercepts JS-initiated custom-scheme
 *                        navigations and returns { type: 'success', url: 'advocal://...' }.
 *  - modal.ondismiss  → User closed checkout; navigate to advocal://payment-cancelled.
 *  - payment.failed   → Navigate to advocal://payment-failed?desc=...
 *
 * No callback_url / server-side POST needed. Verification happens client-side after
 * openAuthSessionAsync returns with payment_id + order_id + signature in query params.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const url         = new URL(req.url);
  const p           = url.searchParams;
  const orderId     = p.get('order_id')    ?? '';
  const keyId       = p.get('key_id')      ?? '';
  const amount      = p.get('amount')      ?? '0';
  const description = p.get('description') ?? 'AdvoCal Subscription';
  const contact     = p.get('contact')     ?? '';
  const name        = p.get('name')        ?? '';
  const isTest      = keyId.startsWith('rzp_test_');

  if (!orderId || !keyId) {
    return new Response('Missing order_id or key_id', { status: 400 });
  }

  // Safe-escape for embedding in JS string literals
  const esc = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/</g, '\\u003c');

  const testBanner = isTest
    ? `<div style="background:#fef3c7;color:#b45309;font-size:13px;font-weight:700;
        text-align:center;padding:10px 16px;border-bottom:2px solid #f59e0b">
        &#x1F9EA; TEST MODE — Use card 4111 1111 1111 1111 · CVV any · OTP 1234
       </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>AdvoCal Payment</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,sans-serif;background:#f0f4ff}
    .wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;
          min-height:100vh;gap:16px;padding:24px;text-align:center}
    .spinner{width:44px;height:44px;border:3px solid #dbeafe;
             border-top-color:#1d4ed8;border-radius:50%;animation:spin .8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .msg{font-size:17px;color:#1d4ed8;font-weight:700}
    .sub{font-size:13px;color:#6b7280}
  </style>
</head>
<body>
${testBanner}
<div class="wrap">
  <div class="spinner"></div>
  <p class="msg">Opening Secure Checkout</p>
  <p class="sub" id="sub">Please wait...</p>
</div>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
(function () {
  function deepLink(path, params) {
    var qs = params
      ? '?' + Object.keys(params).map(function(k){ return k + '=' + encodeURIComponent(params[k]); }).join('&')
      : '';
    window.location.href = 'advocal://' + path + qs;
  }

  function open() {
    if (typeof Razorpay === 'undefined') {
      document.getElementById('sub').textContent = 'Loading SDK...';
      setTimeout(open, 400);
      return;
    }

    var rzp = new Razorpay({
      key:         "${esc(keyId)}",
      amount:      "${esc(amount)}",
      currency:    "INR",
      name:        "AdvoCal",
      description: "${esc(description)}",
      order_id:    "${esc(orderId)}",
      prefill:     { name: "${esc(name)}", contact: "${esc(contact)}" },
      theme:       { color: "#1D4ED8" },
      redirect:    false,

      handler: function (response) {
        // Payment succeeded — pass ids back to app for server-side verification
        deepLink('payment-success', {
          payment_id: response.razorpay_payment_id,
          order_id:   response.razorpay_order_id,
          signature:  response.razorpay_signature
        });
      },

      modal: {
        ondismiss: function () {
          deepLink('payment-cancelled');
        }
      }
    });

    rzp.on('payment.failed', function (r) {
      deepLink('payment-failed', {
        desc: (r.error && r.error.description) ? r.error.description : 'Payment failed'
      });
    });

    rzp.open();
  }

  // Small delay lets the spinner render before JS blocks the thread
  setTimeout(open, 400);
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
