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

const ADMIN_PASSWORD = 'Redmoon@1217';
const PLAN_DAYS: Record<string, number> = { monthly: 30, yearly: 365 };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      (Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!,
      (Deno.env.get('APP_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const { user_id, plan_type, reason, admin_password, admin_id, admin_name } =
      await req.json().catch(() => ({}));

    // ── Validate inputs ───────────────────────────────────────────────────────
    if (!user_id)       return json({ error: 'user_id is required.' }, 400);
    if (!plan_type || !PLAN_DAYS[plan_type]) return json({ error: 'plan_type must be monthly or yearly.' }, 400);
    if (!reason?.trim()) return json({ error: 'Reason is required.' }, 400);
    if (admin_password !== ADMIN_PASSWORD) return json({ error: 'Incorrect admin password.' }, 401);

    // ── Fetch current profile ────────────────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, full_name, subscription_status, subscription_end_date')
      .eq('id', user_id)
      .single();

    if (profileErr || !profile) return json({ error: 'User not found.' }, 404);

    // ── Calculate new expiry ─────────────────────────────────────────────────
    const now = new Date();
    const existingExpiry = profile.subscription_end_date ? new Date(profile.subscription_end_date) : null;
    const baseDate = existingExpiry && existingExpiry > now ? existingExpiry : now;
    const newExpiry = new Date(baseDate);
    newExpiry.setDate(newExpiry.getDate() + PLAN_DAYS[plan_type]);

    const activationDate = baseDate > now ? baseDate : now;

    // ── Update profile ────────────────────────────────────────────────────────
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        subscription_status:     'premium',
        subscription_plan:       plan_type,
        subscription_source:     'admin',
        subscription_start_date: activationDate.toISOString(),
        subscription_end_date:   newExpiry.toISOString(),
        premium_start_date:      activationDate.toISOString(),
        premium_end_date:        newExpiry.toISOString(),
        updated_at:              now.toISOString(),
      })
      .eq('id', user_id);

    if (updateErr) return json({ error: updateErr.message }, 500);

    // ── Log to admin_plan_extensions ──────────────────────────────────────────
    await supabase.from('admin_plan_extensions').insert({
      user_id,
      user_name:          profile.full_name ?? 'Unknown',
      admin_id:           admin_id ?? null,
      admin_name:         admin_name ?? 'Admin',
      plan_type,
      reason:             reason.trim(),
      previous_end_date:  profile.subscription_end_date ?? null,
      new_end_date:       newExpiry.toISOString(),
    });

    // ── Log to admin_activity_logs ────────────────────────────────────────────
    await supabase.from('admin_activity_logs').insert({
      actor_id:     admin_id ?? null,
      actor_email:  admin_name ?? 'Admin',
      action_type:  'extend_plan',
      action_detail: {
        user_id,
        user_name:    profile.full_name ?? 'Unknown',
        plan_type,
        reason:       reason.trim(),
        new_end_date: newExpiry.toISOString(),
        admin_name:   admin_name ?? 'Admin',
      },
    });

    return json({
      success:         true,
      new_end_date:    newExpiry.toISOString(),
      activation_date: activationDate.toISOString(),
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
