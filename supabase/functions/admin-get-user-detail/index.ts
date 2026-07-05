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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      (Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!,
      (Deno.env.get('APP_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const { user_id } = await req.json().catch(() => ({}));
    if (!user_id) return json({ error: 'user_id is required.' }, 400);

    // Fetch full profile
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, email, full_name, phone_number, bar_registration_number, subscription_status, subscription_plan, subscription_source, subscription_start_date, subscription_end_date, premium_start_date, premium_end_date, trial_start_date, trial_end_date, updated_at, created_at')
      .eq('id', user_id)
      .single();

    if (profileErr || !profile) return json({ error: 'User not found.' }, 404);

    // Fetch latest Razorpay payment
    const { data: payments } = await supabase
      .from('payments')
      .select('razorpay_payment_id, razorpay_order_id, payment_status, amount, plan_type, subscription_start, subscription_expiry, created_at')
      .eq('user_id', user_id)
      .eq('payment_status', 'captured')
      .order('created_at', { ascending: false })
      .limit(1);

    const latestPayment = payments?.[0] ?? null;

    // Fetch extension history
    const { data: extensions } = await supabase
      .from('admin_plan_extensions')
      .select('id, plan_type, reason, admin_name, previous_end_date, new_end_date, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    return json({
      profile,
      latest_payment: latestPayment,
      extension_history: extensions ?? [],
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
