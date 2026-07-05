
-- admin_notifications
CREATE TABLE IF NOT EXISTS admin_notifications (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  title           text        NOT NULL,
  message         text        NOT NULL,
  target_audience text        NOT NULL DEFAULT 'all',
  target_user_ids uuid[],
  sent_by         uuid,
  status          text        NOT NULL DEFAULT 'draft',
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_notifications_pkey PRIMARY KEY (id)
);

-- admin_activity_logs
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  admin_id    uuid,
  action      text        NOT NULL,
  entity_type text,
  entity_id   uuid,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_activity_logs_pkey PRIMARY KEY (id)
);

-- admin_settings
CREATE TABLE IF NOT EXISTS admin_settings (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  key        text        NOT NULL UNIQUE,
  value      jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_settings_pkey PRIMARY KEY (id)
);

-- push_notification_logs
CREATE TABLE IF NOT EXISTS push_notification_logs (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  notification_id uuid,
  user_id         uuid        NOT NULL,
  token           text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending',
  error_message   text,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_notification_logs_pkey PRIMARY KEY (id)
);

-- subscription columns on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_start_date timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_end_date timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_start_date timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_end_date timestamptz;
