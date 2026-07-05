
CREATE OR REPLACE FUNCTION admin_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_advocates   bigint;
  v_active_users      bigint;
  v_paid_users        bigint;
  v_trial_users       bigint;
  v_expired_users     bigint;
  v_none_users        bigint;
  v_total_cases       bigint;
  v_total_hearings    bigint;
  v_todays_hearings   bigint;
  v_new_users_month   bigint;
  v_cases_this_month  bigint;
  v_cases_by_type     json;
  v_real_paid_users   bigint;
  v_est_revenue       numeric;
BEGIN
  SELECT COUNT(*) INTO v_total_advocates FROM public.profiles WHERE role = 'user';
  SELECT COUNT(*) INTO v_active_users    FROM public.profiles WHERE role = 'user' AND updated_at >= NOW() - INTERVAL '30 days';
  SELECT COUNT(*) INTO v_trial_users     FROM public.profiles WHERE role = 'user' AND subscription_status = 'trial';
  SELECT COUNT(*) INTO v_expired_users   FROM public.profiles WHERE role = 'user' AND subscription_status = 'expired';
  SELECT COUNT(*) INTO v_none_users      FROM public.profiles WHERE role = 'user' AND (subscription_status = 'none' OR subscription_status IS NULL);
  SELECT COUNT(*) INTO v_total_cases     FROM public.cases;
  SELECT COUNT(*) INTO v_cases_this_month FROM public.cases WHERE created_at >= date_trunc('month', NOW());
  SELECT COUNT(*) INTO v_total_hearings  FROM public.hearing_history;
  SELECT COUNT(*) INTO v_todays_hearings FROM public.cases WHERE hearing_date = CURRENT_DATE;
  SELECT COUNT(*) INTO v_new_users_month FROM public.profiles WHERE role = 'user' AND created_at >= date_trunc('month', NOW());
  SELECT json_object_agg(case_type, cnt) INTO v_cases_by_type
  FROM (
    SELECT COALESCE(case_type, 'Other') AS case_type, COUNT(*) AS cnt
    FROM public.cases
    GROUP BY COALESCE(case_type, 'Other')
  ) t;

  -- Real paid users: only count users with a captured/paid Razorpay payment
  SELECT COUNT(DISTINCT user_id) INTO v_real_paid_users
  FROM public.payments
  WHERE payment_status IN ('captured', 'paid')
    AND razorpay_payment_id IS NOT NULL
    AND razorpay_payment_id != '';

  -- Est. revenue: sum of all successful Razorpay payments (amount stored in paise, convert to rupees)
  SELECT COALESCE(SUM(amount::numeric / 100), 0) INTO v_est_revenue
  FROM public.payments
  WHERE payment_status IN ('captured', 'paid')
    AND razorpay_payment_id IS NOT NULL
    AND razorpay_payment_id != '';

  -- paid_users for dashboard = real Razorpay paid users only
  v_paid_users := v_real_paid_users;

  RETURN json_build_object(
    'total_advocates',  v_total_advocates,
    'active_users',     v_active_users,
    'paid_users',       v_paid_users,
    'trial_users',      v_trial_users,
    'expired_users',    v_expired_users,
    'none_users',       v_none_users,
    'total_cases',      v_total_cases,
    'total_hearings',   v_total_hearings,
    'todays_hearings',  v_todays_hearings,
    'new_users_month',  v_new_users_month,
    'cases_this_month', v_cases_this_month,
    'cases_by_type',    COALESCE(v_cases_by_type, '{}'::json),
    'est_revenue',      v_est_revenue
  );
END;
$$;
