
-- ─── Admin tables ─────────────────────────────────────────────────────────────

-- Activity logs table
CREATE TABLE public.admin_activity_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email text,
  action_type text NOT NULL,  -- 'user_login','case_created','subscription_change','notification_sent','admin_action'
  action_detail jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_activity_logs_actor_idx ON public.admin_activity_logs(actor_id);
CREATE INDEX admin_activity_logs_type_idx  ON public.admin_activity_logs(action_type);
CREATE INDEX admin_activity_logs_at_idx    ON public.admin_activity_logs(created_at DESC);

ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage activity logs" ON public.admin_activity_logs
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- Notification history table
CREATE TABLE public.admin_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  message         text NOT NULL,
  target_audience text NOT NULL DEFAULT 'all',  -- 'all','trial','premium','selected'
  target_user_ids uuid[],
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  status          text NOT NULL DEFAULT 'pending',  -- 'pending','sent','failed','scheduled'
  sent_count      int  NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_notifications_status_idx ON public.admin_notifications(status);
CREATE INDEX admin_notifications_at_idx     ON public.admin_notifications(created_at DESC);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notifications" ON public.admin_notifications
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- App settings table
CREATE TABLE public.admin_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings" ON public.admin_settings
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- Seed default settings
INSERT INTO public.admin_settings (key, value) VALUES
  ('app_config',        '{"app_name":"AdvoCal","app_version":"1.0.0","support_email":"support@advocal.in","support_phone":"+91 9999999999"}'::jsonb),
  ('subscription_plans','[{"id":"trial","name":"Free Trial","duration_days":14,"price":0,"features":["50 cases","Basic calendar","OTP login"]},{"id":"premium","name":"Premium","duration_days":365,"price":999,"features":["Unlimited cases","Full calendar","CNR lookup","Team members","Priority support"]}]'::jsonb),
  ('trial_settings',    '{"trial_duration_days":14,"trial_enabled":true}'::jsonb),
  ('notification_cfg',  '{"hearing_reminder_enabled":true,"reminder_hours_before":24}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─── Hearing history admin policy ─────────────────────────────────────────────
CREATE POLICY "Admins have full access to hearing history" ON hearing_history
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- ─── Admin dashboard stats RPC ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_advocates',    (SELECT count(*) FROM profiles),
    'active_users',       (SELECT count(*) FROM profiles WHERE subscription_status IN ('trial','premium')),
    'paid_users',         (SELECT count(*) FROM profiles WHERE subscription_status = 'premium'),
    'trial_users',        (SELECT count(*) FROM profiles WHERE subscription_status = 'trial'),
    'expired_users',      (SELECT count(*) FROM profiles WHERE subscription_status = 'expired'),
    'none_users',         (SELECT count(*) FROM profiles WHERE subscription_status = 'none'),
    'total_cases',        (SELECT count(*) FROM cases),
    'total_hearings',     (SELECT count(*) FROM hearing_history),
    'todays_hearings',    (SELECT count(*) FROM hearing_history WHERE hearing_date = current_date),
    'new_users_month',    (SELECT count(*) FROM profiles WHERE date_trunc('month', created_at) = date_trunc('month', now())),
    'cases_this_month',   (SELECT count(*) FROM cases WHERE date_trunc('month', created_at) = date_trunc('month', now())),
    'cases_by_type',      (SELECT jsonb_object_agg(COALESCE(case_type,'Other'), cnt) FROM (SELECT case_type, count(*) cnt FROM cases GROUP BY case_type) t)
  ) INTO result;
  RETURN result;
END;
$$;

-- New registrations per day (last 30 days)
CREATE OR REPLACE FUNCTION admin_user_growth(days_back int DEFAULT 30)
RETURNS TABLE(day date, new_users bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT date_trunc('day', created_at)::date AS day,
         count(*)                             AS new_users
  FROM profiles
  WHERE created_at >= now() - (days_back || ' days')::interval
  GROUP BY 1 ORDER BY 1;
$$;

-- Most active advocates by case count
CREATE OR REPLACE FUNCTION admin_top_advocates(lim int DEFAULT 10)
RETURNS TABLE(id uuid, full_name text, email text, case_count bigint, subscription_status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email,
         count(c.id) AS case_count,
         p.subscription_status
  FROM profiles p
  LEFT JOIN cases c ON c.user_id = p.id
  GROUP BY p.id ORDER BY case_count DESC LIMIT lim;
$$;
