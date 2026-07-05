/**
 * send-push-notification Edge Function
 *
 * Sends FCM push notifications to targeted users.
 * Supports TWO modes automatically:
 *   1. FCM v1 (preferred) — requires FIREBASE_SERVICE_ACCOUNT_JSON secret
 *   2. FCM Legacy API (fallback) — requires FCM_SERVER_KEY secret
 *
 * Body params:
 *   notification_id  - uuid of the admin_notifications row (already inserted)
 *   title            - notification title
 *   message          - notification body
 *   image_url        - optional image URL
 *   target_audience  - 'all' | 'trial' | 'premium' | 'selected'
 *   target_user_ids  - string[] (only for 'selected' audience)
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FCM_LEGACY_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl    = (Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!;
    const serviceRoleKey = (Deno.env.get('APP_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();

    // dry_run: just check if secrets are configured
    if (body.dry_run) {
      const hasV1  = !!Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
      const hasLeg = !!Deno.env.get('FCM_SERVER_KEY');
      return new Response(
        JSON.stringify({ ok: true, fcm_v1: hasV1, fcm_legacy: hasLeg }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const { notification_id, title, message, image_url, target_audience, target_user_ids } = body;

    if (!title || !message || !notification_id) {
      return new Response(
        JSON.stringify({ error: 'title, message, and notification_id are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ── Validate FCM credentials are available ────────────────────────────────
    const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
    const fcmServerKey       = Deno.env.get('FCM_SERVER_KEY');
    const useLegacy          = !serviceAccountJson && !!fcmServerKey;

    // Build FCM v1 endpoint dynamically from service account project_id
    const fcmProjectId = serviceAccountJson ? JSON.parse(serviceAccountJson).project_id : null;
    const FCM_V1_ENDPOINT = fcmProjectId
      ? `https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`
      : null;

    if (!serviceAccountJson && !fcmServerKey) {
      console.error('[send-push] No FCM credentials configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FCM_SERVER_KEY secret.');
      await supabase.from('admin_notifications').update({
        status: 'failed', sent_count: 0, sent_at: new Date().toISOString(),
      }).eq('id', notification_id);
      return new Response(
        JSON.stringify({
          error: 'FCM not configured. Please add FIREBASE_SERVICE_ACCOUNT_JSON or FCM_SERVER_KEY in Supabase → Settings → Edge Functions → Secrets.',
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ── 1. Fetch target push tokens ──────────────────────────────────────────
    let tokenQuery = supabase.from('push_tokens').select('user_id, token, platform');

    if (target_audience === 'selected' && target_user_ids?.length) {
      tokenQuery = tokenQuery.in('user_id', target_user_ids);
    } else if (target_audience === 'trial' || target_audience === 'premium') {
      const { data: profiles } = await supabase
        .from('profiles').select('id').eq('subscription_status', target_audience);
      const ids = (profiles ?? []).map((p: any) => p.id);
      if (ids.length === 0) {
        return new Response(
          JSON.stringify({ success: true, sent: 0, failed: 0, message: 'No users in this segment' }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      }
      tokenQuery = tokenQuery.in('user_id', ids);
    }

    const { data: tokens, error: tokenErr } = await tokenQuery;
    if (tokenErr) throw tokenErr;

    if (!tokens || tokens.length === 0) {
      await supabase.from('admin_notifications').update({
        status: 'sent', sent_count: 0, sent_at: new Date().toISOString(),
      }).eq('id', notification_id);
      return new Response(
        JSON.stringify({ success: true, sent: 0, failed: 0, message: 'No registered devices found' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[send-push] Sending to ${tokens.length} device(s) via ${useLegacy ? 'Legacy FCM' : 'FCM v1'}`);

    // ── 2. Get auth header ───────────────────────────────────────────────────
    const authHeader = useLegacy
      ? `key=${fcmServerKey}`
      : `Bearer ${await getFcmV1AccessToken(serviceAccountJson!)}`;

    // ── 3. Send to each token ────────────────────────────────────────────────
    let sent = 0, failed = 0;
    const logs: any[] = [];

    // First pass — send all, collect results
    type SendResult = {
      user_id: string; token: string;
      ok: boolean; isStaleToken: boolean;
      errStatus: string | undefined; errMessage: string;
    };
    const results: SendResult[] = [];

    for (const { user_id, token, platform: _platform } of tokens) {
      try {
        const fcmBody = useLegacy
          ? buildLegacyPayload(token, title, message, notification_id, image_url)
          : buildV1Payload(token, title, message, notification_id, image_url);

        const fcmRes = await fetch(useLegacy ? FCM_LEGACY_ENDPOINT : FCM_V1_ENDPOINT!, {
          method: 'POST',
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(fcmBody),
        });

        const resBody = await fcmRes.json();
        console.log(`[send-push] token ${token.slice(-10)}: HTTP ${fcmRes.status}`, JSON.stringify(resBody));

        if (fcmRes.ok && !resBody.failure) {
          results.push({ user_id, token, ok: true, isStaleToken: false, errStatus: undefined, errMessage: '' });
        } else {
          const errStatus = resBody?.error?.status ?? resBody?.results?.[0]?.error;
          const isStaleToken = errStatus === 'NOT_FOUND'
            || errStatus === 'NotRegistered'
            || errStatus === 'InvalidRegistration';
          const errMessage = resBody?.error?.message ?? errStatus ?? JSON.stringify(resBody);
          results.push({ user_id, token, ok: false, isStaleToken, errStatus, errMessage });
        }
      } catch (sendErr: any) {
        results.push({ user_id, token, ok: false, isStaleToken: false, errStatus: undefined, errMessage: sendErr.message });
      }
    }

    // ── Circuit breaker: if ≥80% of tokens returned NOT_FOUND, it's almost certainly
    //    a Firebase project mismatch (wrong FIREBASE_SERVICE_ACCOUNT_JSON for this app).
    //    In that case do NOT mass-delete valid tokens — just log as failed and warn.
    const staleCount  = results.filter(r => r.isStaleToken).length;
    const totalCount  = results.length;
    const staleFrac   = totalCount > 0 ? staleCount / totalCount : 0;
    const massFailure = staleFrac >= 0.8 && totalCount >= 2;

    if (massFailure) {
      console.warn(
        `[send-push] CIRCUIT BREAKER: ${staleCount}/${totalCount} tokens returned NOT_FOUND. ` +
        'Possible Firebase project mismatch — NOT deleting tokens to avoid data loss. ' +
        'Verify FIREBASE_SERVICE_ACCOUNT_JSON project_id matches the app\'s google-services.json sender ID.',
      );
    }

    // Second pass — build logs, optionally delete stale tokens
    for (const r of results) {
      if (r.ok) {
        sent++;
        logs.push({ notification_id, user_id: r.user_id, token: r.token, status: 'sent' });
      } else {
        failed++;
        // Only delete individual stale tokens when it is NOT a mass-failure event.
        // INVALID_ARGUMENT means bad payload — NOT a bad token, never delete.
        const shouldDelete = r.isStaleToken && !massFailure;
        logs.push({
          notification_id, user_id: r.user_id, token: r.token,
          status: r.isStaleToken ? 'invalid_token' : 'failed',
          error_message: r.errMessage + (massFailure && r.isStaleToken ? ' [circuit-breaker: token preserved]' : ''),
        });
        if (shouldDelete) {
          await supabase.from('push_tokens').delete().eq('user_id', r.user_id).eq('token', r.token);
        }
      }
    }

    if (logs.length > 0) await supabase.from('push_notification_logs').insert(logs);
    await supabase.from('admin_notifications').update({
      status: failed > 0 && sent === 0 ? 'failed' : 'sent',
      sent_count: sent,
      sent_at: new Date().toISOString(),
    }).eq('id', notification_id);

    return new Response(
      JSON.stringify({
        success: true, sent, failed, total: tokens.length,
        ...(massFailure ? {
          warning: `${staleCount}/${totalCount} tokens returned NOT_FOUND. This usually means a Firebase project mismatch. Tokens were preserved. Verify your FIREBASE_SERVICE_ACCOUNT_JSON matches the app's google-services.json sender ID.`,
        } : {}),
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );

  } catch (err: any) {
    console.error('[send-push-notification] error:', err);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Internal error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});

// ── FCM v1 payload ────────────────────────────────────────────────────────────
function buildV1Payload(token: string, title: string, body: string, notifId: string, imageUrl?: string) {
  return {
    message: {
      token,
      notification: { title, body, ...(imageUrl ? { image: imageUrl } : {}) },
      android: {
        priority: 'high',
        // FCM v1 android.notification uses "image" not "image_url" — wrong field name
        // caused INVALID_ARGUMENT which was incorrectly deleting valid tokens from DB
        notification: { channel_id: 'task-reminders', ...(imageUrl ? { image: imageUrl } : {}) },
      },
      apns: {
        payload: { aps: { alert: { title, body }, sound: 'default' } },
        ...(imageUrl ? { fcm_options: { image: imageUrl } } : {}),
      },
      data: { notification_id: notifId, title, body, ...(imageUrl ? { image_url: imageUrl } : {}) },
    },
  };
}

// ── Legacy FCM payload ────────────────────────────────────────────────────────
function buildLegacyPayload(token: string, title: string, body: string, notifId: string, imageUrl?: string) {
  return {
    to: token,
    priority: 'high',
    notification: { title, body, sound: 'default', ...(imageUrl ? { image: imageUrl } : {}) },
    data: { notification_id: notifId, title, body, ...(imageUrl ? { image_url: imageUrl } : {}) },
    android: { notification: { channel_id: 'task-reminders' } },
  };
}

// ── OAuth2 access token for FCM v1 ───────────────────────────────────────────
async function getFcmV1AccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  // Build JWT header + claim
  const header  = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signingInput = `${header}.${payload}`;

  // Import RSA private key
  const pemContents = sa.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const keyBuffer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Sign
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signingInput}.${signature}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get FCM access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}