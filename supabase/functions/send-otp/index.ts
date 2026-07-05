import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function hashOtp(otp: string): Promise<string> {
  const data = new TextEncoder().encode(otp);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendOtp(phone: string, otp: string): Promise<void> {
  const apiKey = Deno.env.get('TWOFACTOR_API_KEY');
  if (!apiKey) throw new Error('OTP service not configured. Please contact support.');

  const res = await fetch(
    `https://2factor.in/API/V1/${apiKey}/SMS/+91${phone}/${otp}`,
    { signal: AbortSignal.timeout(12_000) },
  );
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || body.Status !== 'Success') {
    const detail = (body.Details as string) ?? (body.Message as string) ?? 'Unknown error';
    console.error('[send-otp] 2factor error:', detail);
    throw new Error('Failed to send OTP. Please verify your mobile number and try again.');
  }
}

// ── Test backdoor — hardcoded credentials, no SMS ever sent ──────────────────
const TEST_PHONE = '8888888888';
const TEST_OTP   = '777777';

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  // Warmup ping — return immediately so the function stays warm
  if (req.method === 'GET') return json({ ok: true });

  try {
    const { phone, flow } = await req.json();

    if (!phone) return json({ error: 'Phone number is required.' }, 400);
    const digits     = String(phone).replace(/\D/g, '');
    const normalised = digits.length === 12 && digits.startsWith('91')
      ? digits.slice(2) : digits.length === 10 ? digits : null;
    if (!normalised || !/^\d{10}$/.test(normalised)) {
      return json({ error: 'Enter a valid 10-digit Indian mobile number.' }, 400);
    }

    // Use APP_* secrets (explicitly set to this project) so we always hit the
    // correct Supabase project regardless of Deno's auto-injected fallbacks.
    const SUPABASE_URL = Deno.env.get('APP_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || '';
    const SERVICE_KEY  = Deno.env.get('APP_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error('[send-otp] Missing required env vars', { SUPABASE_URL: !!SUPABASE_URL, SERVICE_KEY: !!SERVICE_KEY });
      return json({ error: 'Server configuration error.' }, 500);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── TEST BACKDOOR: skip SMS, rate-limit, and existence checks ─────────
    if (normalised === TEST_PHONE) {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1-hour window
      const otpHash   = await hashOtp(TEST_OTP);
      const { data: session, error: sessionErr } = await adminClient
        .from('otp_sessions')
        .insert({ phone: normalised, otp_hash: otpHash, flow: 'login', expires_at: expiresAt })
        .select('id')
        .single();
      if (sessionErr) {
        console.error('[send-otp] test session insert error:', sessionErr.message);
        return json({ error: 'Failed to create test session.' }, 500);
      }
      return json({ sessionId: session.id, phone: normalised });
    }

    const authFlow = flow === 'signup' ? 'signup' : 'login';

    // ── Run existence check + rate-limit check in PARALLEL ────────────────
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const [profileResult, rateResult] = await Promise.all([
      adminClient.from('profiles').select('id, address, date_of_birth').eq('phone_number', normalised).maybeSingle(),
      adminClient.from('otp_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('phone', normalised)
        .gte('created_at', tenMinutesAgo),
    ]);

    const userExists      = !!profileResult.data;
    const profileComplete = userExists && !!profileResult.data?.address && !!profileResult.data?.date_of_birth;

    // LOGIN: block before OTP if no account or incomplete setup
    if (authFlow === 'login') {
      if (!userExists) {
        return json({ error: 'User not found. Please Sign Up first.', noAccount: true });
      }
      if (!profileComplete) {
        // Profile exists but incomplete — send them to finish signup
        return json({ error: 'Account setup was incomplete. Please Sign Up again to create your account.', incomplete: true });
      }
    }

    // SIGNUP: only block if profile is fully complete (a real account already exists)
    // If profile is incomplete, allow them through to finish setting up
    if (authFlow === 'signup' && profileComplete) {
      return json({ error: 'An account already exists. Please Sign In.', alreadyExists: true });
    }

    if ((rateResult.count ?? 0) >= 5) {
      return json({ error: 'Too many OTP requests. Please wait 10 minutes before trying again.' });
    }

    // ── Generate OTP + hash ───────────────────────────────────────────────
    const otp       = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const otpHash   = await hashOtp(otp);

    // ── Send SMS + store session in PARALLEL ──────────────────────────────
    const [, sessionResult] = await Promise.all([
      sendOtp(normalised, otp),
      adminClient.from('otp_sessions')
        .insert({ phone: normalised, otp_hash: otpHash, flow: authFlow, expires_at: expiresAt })
        .select('id')
        .single(),
    ]);

    if (sessionResult.error) {
      console.error('[send-otp] insert error:', sessionResult.error.message);
      throw new Error('Failed to create OTP session. Please try again.');
    }

    return json({ sessionId: sessionResult.data.id, phone: normalised });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[send-otp] error:', msg);
    return json({ error: msg }, 500);
  }
});
