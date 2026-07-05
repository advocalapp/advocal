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

// Deterministic password — same value at createUser and login.
async function derivePassword(phone: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(phone));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Sign in via Supabase auth REST — returns real session token accepted by RLS.
async function restSignIn(supabaseUrl: string, anonKey: string, email: string, password: string) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok || !data.access_token) return { session: null, error: data };
  return {
    session: {
      access_token:  data.access_token  as string,
      refresh_token: data.refresh_token as string,
      user:          data.user          as Record<string, unknown>,
    },
    error: null,
  };
}

// Upsert auth user using admin API (no RPC needed — works on any Supabase project).
async function upsertAuthUser(adminClient: ReturnType<typeof createClient>, email: string, password: string): Promise<string | null> {
  // Try create first
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (created?.user?.id) return created.user.id;

  // If user already exists, look them up via admin list API
  if (createErr?.message?.includes('already registered') || createErr?.code === 'email_exists') {
    const { data: list } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => u.email === email);
    return existing?.id ?? null;
  }

  console.error('[verify-otp] createUser failed:', createErr);
  return null;
}

// Update auth user password using admin API (no RPC needed).
async function updateUserPassword(adminClient: ReturnType<typeof createClient>, userId: string, password: string): Promise<void> {
  const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
  if (error) console.error('[verify-otp] updateUserById failed (non-fatal):', error.message);
}

const TEST_PHONE = '8888888888';

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ ok: true });

  try {
    const body = await req.json();
    const { sessionId, otp, phone, flow, profileData } = body;
    if (!sessionId || !otp || !phone) return json({ error: 'sessionId, otp and phone are required.' });

    const digits     = String(phone).replace(/\D/g, '');
    const normalised = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;

    // Use APP_* secrets (explicitly set to this project) so we always hit the
    // correct Supabase project regardless of Deno's auto-injected fallbacks.
    const SUPABASE_URL = Deno.env.get('APP_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || '';
    const SERVICE_KEY  = Deno.env.get('APP_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const ANON_KEY     = Deno.env.get('APP_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';

    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      console.error('[verify-otp] Missing required env vars', { SUPABASE_URL: !!SUPABASE_URL, SERVICE_KEY: !!SERVICE_KEY, ANON_KEY: !!ANON_KEY });
      return json({ error: 'Server configuration error. Please contact support.' }, 500);
    }
    const PWD_SECRET   = Deno.env.get('OTP_SIGN_SECRET') ?? 'advocal-otp-fallback';

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const phoneEmail = `${normalised}@advocal.app`;
    const authFlow   = flow === 'signup' ? 'signup' : 'login';

    // 1. Load OTP session
    const { data: otpSession, error: fetchErr } = await adminClient
      .from('otp_sessions').select('*')
      .eq('id', sessionId).eq('phone', normalised).maybeSingle();

    if (fetchErr || !otpSession) return json({ error: 'Invalid or expired OTP session. Please request a new OTP.' });
    if (otpSession.used)         return json({ error: 'This OTP has already been used. Please request a new one.' });
    if (new Date(otpSession.expires_at) < new Date()) return json({ error: 'OTP has expired. Please request a new one.' });

    // 2. Check attempts
    const newAttempts = (otpSession.attempts ?? 0) + 1;
    if (newAttempts > 5) {
      await adminClient.from('otp_sessions').update({ attempts: newAttempts }).eq('id', sessionId);
      return json({ error: 'Too many incorrect attempts. Please request a new OTP.' });
    }

    // 3. Verify OTP hash
    const inputHash = await hashOtp(String(otp));
    if (inputHash !== otpSession.otp_hash) {
      adminClient.from('otp_sessions').update({ attempts: newAttempts }).eq('id', sessionId);
      return json({ error: `Incorrect OTP. ${5 - newAttempts} attempt(s) remaining.` });
    }

    // 4. Mark used + derive password in parallel
    const [, password] = await Promise.all([
      adminClient.from('otp_sessions').update({ used: true, attempts: newAttempts }).eq('id', sessionId),
      derivePassword(normalised, PWD_SECRET),
    ]);

    // 5a. LOGIN
    if (authFlow === 'login') {
      let { data: profile } = await adminClient
        .from('profiles').select('id, address, date_of_birth').eq('phone_number', normalised).maybeSingle();

      // Auto-provision test account on first login if missing
      if (!profile && normalised === TEST_PHONE) {
        const userId = await upsertAuthUser(adminClient, phoneEmail, password);
        if (userId) {
          await adminClient.from('profiles').upsert({
            id: userId, phone_number: normalised,
            full_name: 'Test Advocate', updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
          profile = { id: userId, address: 'Test', date_of_birth: '2000-01-01' };
        }
      }

      if (!profile) return json({ error: 'User not found. Please Sign Up first.' });

      // Check auth user actually exists (may have been deleted from Auth dashboard)
      const { data: authUserData } = await adminClient.auth.admin.getUserById(profile.id);
      if (!authUserData?.user) {
        // Auth user was deleted — clean up dangling profile and tell client to re-signup
        await adminClient.from('profiles').delete().eq('id', profile.id);
        return json({ error: 'User not found. Please Sign Up first.' });
      }

      // Block login if profile is incomplete (signup was not fully completed)
      // Do NOT delete — just tell the user to sign up again
      if (!profile.address || !profile.date_of_birth) {
        return json({ error: 'Account setup was incomplete. Please Sign Up again to create your account.' });
      }

      // Sync latest derived password so sign-in always succeeds
      await updateUserPassword(adminClient, profile.id, password);

      const { session, error: signInErr } = await restSignIn(SUPABASE_URL, ANON_KEY, phoneEmail, password);
      if (!session) {
        console.error('[verify-otp] login restSignIn failed:', JSON.stringify(signInErr));
        return json({ error: 'Login failed. Please try again.' });
      }
      return json({ access_token: session.access_token, refresh_token: session.refresh_token, user: session.user });
    }

    // 5b. SIGNUP — upsert auth user via admin API
    const authUserId = await upsertAuthUser(adminClient, phoneEmail, password);
    if (!authUserId) return json({ error: 'Could not create account. Please try again.' });

    // If profile already exists, check completeness
    const { data: existingProfile } = await adminClient
      .from('profiles').select('id, address, date_of_birth').eq('phone_number', normalised).maybeSingle();

    if (existingProfile) {
      const isComplete = !!existingProfile.address && !!existingProfile.date_of_birth;
      if (isComplete) {
        // Fully complete account — treat as login
        await updateUserPassword(adminClient, authUserId, password);
        const { session } = await restSignIn(SUPABASE_URL, ANON_KEY, phoneEmail, password);
        if (!session) return json({ error: 'Account already exists. Please use Sign In.' });
        return json({ access_token: session.access_token, refresh_token: session.refresh_token, user: session.user });
      }
      // Incomplete profile — fall through to overwrite it and complete setup
    }

    // 6. Save new profile
    const now = new Date().toISOString();
    const profilePayload: Record<string, unknown> = {
      id: authUserId, phone_number: normalised,
      signup_date: now, profile_created_at: now,
      subscription_status: 'none', updated_at: now,
    };
    if (profileData) {
      const { full_name, company_name, address, city, date_of_birth, bar_id, avatar_url } = profileData;
      Object.assign(profilePayload, {
        full_name: full_name ?? null, company_name: company_name ?? null,
        address: address ?? null, city: city ?? null,
        date_of_birth: date_of_birth ?? null, bar_registration_number: bar_id ?? null,
        avatar_url: avatar_url ?? null,
      });
    }
    await adminClient.from('profiles').upsert(profilePayload, { onConflict: 'id' });

    // Explicitly sync password before sign-in (ensures it's set even for newly created users)
    await updateUserPassword(adminClient, authUserId, password);

    // Small delay to let auth system propagate the new user/password
    await new Promise(r => setTimeout(r, 400));

    let signInResult = await restSignIn(SUPABASE_URL, ANON_KEY, phoneEmail, password);

    // Retry once more after a longer delay if first attempt failed
    if (!signInResult.session) {
      console.warn('[verify-otp] signup restSignIn attempt 1 failed, retrying...', JSON.stringify(signInResult.error));
      await new Promise(r => setTimeout(r, 800));
      signInResult = await restSignIn(SUPABASE_URL, ANON_KEY, phoneEmail, password);
    }

    const { session, error: signInErr } = signInResult;
    if (!session) {
      console.error('[verify-otp] signup restSignIn failed after retry:', signInErr);
      return json({ error: 'Account created but sign-in failed. Please use Sign In.' });
    }
    return json({ access_token: session.access_token, refresh_token: session.refresh_token, user: session.user, is_new_user: true });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[verify-otp] error:', msg);
    return json({ error: msg });
  }
});
