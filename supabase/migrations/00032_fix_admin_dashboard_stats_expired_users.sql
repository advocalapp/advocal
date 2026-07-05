-- Replace admin_dashboard_stats to include expired_users (was missing, causing undefined in admin panel)
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_advocates', (SELECT count(*) FROM profiles),
    'active_users',    (SELECT count(*) FROM profiles WHERE subscription_status IN ('trial','premium')),
    'paid_users',      (SELECT count(*) FROM profiles WHERE subscription_status = 'premium'),
    'trial_users',     (SELECT count(*) FROM profiles WHERE subscription_status = 'trial'),
    'expired_users',   (SELECT count(*) FROM profiles WHERE subscription_status = 'expired'),
    'total_cases',     (SELECT count(*) FROM cases),
    'total_hearings',  (SELECT count(*) FROM hearing_history),
    'new_users_month', (SELECT count(*) FROM profiles WHERE date_trunc('month', created_at) = date_trunc('month', now()))
  ) INTO result;
  RETURN result;
END;
$$;