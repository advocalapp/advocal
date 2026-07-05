-- ═══════════════════════════════════════════════════════════════
-- ADVOCAL COMPLETE SCHEMA — idempotent, safe to run on any state
-- ═══════════════════════════════════════════════════════════════

-- ── Enums (idempotent) ─────────────────────────────────────────
DO $$ BEGIN CREATE TYPE public.user_role AS ENUM ('user','admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.case_status AS ENUM ('pending','ongoing','completed','adjourned','urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Profiles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                   text,
  role                    public.user_role NOT NULL DEFAULT 'user',
  full_name               text,
  phone_number            text,
  city                    text,
  location                text,
  bar_registration_number text,
  chamber_name            text,
  chamber_address         text,
  chamber_phone           text,
  company_name            text,
  address                 text,
  date_of_birth           date,
  avatar_url              text,
  profile_photo_url       text,
  is_suspended            boolean NOT NULL DEFAULT false,
  notification_reminders  boolean NOT NULL DEFAULT true,
  notification_same_day   boolean NOT NULL DEFAULT true,
  notification_next_date  boolean NOT NULL DEFAULT true,
  reminder_hours_before   integer NOT NULL DEFAULT 24,
  date_format             text NOT NULL DEFAULT 'DD/MM/YYYY',
  time_format             text NOT NULL DEFAULT '12h',
  subscription_plan       text NOT NULL DEFAULT 'free',
  subscription_status     text NOT NULL DEFAULT 'none',
  signup_date             timestamptz,
  profile_created_at      timestamptz,
  trial_start_date        timestamptz,
  trial_end_date          timestamptz,
  subscription_start_date timestamptz,
  subscription_end_date   timestamptz,
  premium_start_date      timestamptz,
  premium_end_date        timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bar_registration_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chamber_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chamber_address text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chamber_phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_photo_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_plan text NOT NULL DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'none';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_date timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_created_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_start_date timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_end_date timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_start_date timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_end_date timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_start_date timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_end_date timestamptz;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_subscription_status_check CHECK (subscription_status IN ('none','trial','premium','expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_idx ON public.profiles(phone_number) WHERE phone_number IS NOT NULL;

-- ── Cases ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_title          text NOT NULL,
  case_type           text,
  case_number         text,
  cnr_number          text,
  filing_number       text,
  filing_date         date,
  registration_date   date,
  court_name          text NOT NULL,
  court_room          text,
  judge_name          text,
  client_name         text,
  opponent_name       text,
  status              public.case_status NOT NULL DEFAULT 'pending',
  case_status_label   text,
  hearing_date        date,
  hearing_time        time,
  next_hearing_date   date,
  first_hearing_date  date,
  decision_date       date,
  nature_of_disposal  text,
  petitioner_advocate text,
  respondent_advocate text,
  petitioner_parties  jsonb,
  respondent_parties  jsonb,
  acts_under          jsonb,
  fir_details         jsonb,
  ecourts_case_history jsonb,
  ecourts_final_orders jsonb,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS filing_date date;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS registration_date date;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS case_status_label text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS first_hearing_date date;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS decision_date date;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS nature_of_disposal text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS petitioner_advocate text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS respondent_advocate text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS petitioner_parties jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS respondent_parties jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS acts_under jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS fir_details jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS ecourts_case_history jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS ecourts_final_orders jsonb;

-- ── Hearing history ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hearing_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hearing_date date NOT NULL,
  hearing_time time,
  outcome      text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Team members ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  role       text,
  email      text,
  phone      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── OTP sessions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.otp_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text NOT NULL,
  otp_hash   text NOT NULL,
  flow       text NOT NULL CHECK (flow IN ('login','signup')),
  attempts   int  NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_sessions_phone_idx ON public.otp_sessions(phone);

-- ── Push tokens ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL,
  platform   text NOT NULL DEFAULT 'android' CHECK (platform IN ('android','ios','web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);
CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON public.push_tokens(user_id);

-- ── Admin tables ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email   text,
  action_type   text NOT NULL,
  action_detail jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_activity_logs_at_idx ON public.admin_activity_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  message         text NOT NULL,
  target_audience text NOT NULL DEFAULT 'all',
  target_user_ids uuid[],
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  status          text NOT NULL DEFAULT 'pending',
  sent_count      int  NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_notifications_at_idx ON public.admin_notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_notification_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.admin_notifications(id) ON DELETE SET NULL,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token           text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('sent','failed','invalid_token')),
  error_message   text,
  sent_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_notification_logs_notification_id_idx ON public.push_notification_logs(notification_id);
CREATE INDEX IF NOT EXISTS push_notification_logs_user_id_idx ON public.push_notification_logs(user_id);

-- ── Storage ────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars','avatars',true,1048576,ARRAY['image/jpeg','image/jpg','image/png'])
ON CONFLICT (id) DO NOTHING;

-- ── Admin settings seed ────────────────────────────────────────
INSERT INTO public.admin_settings (key, value) VALUES
  ('app_config',         '{"app_name":"AdvoCal","app_version":"1.0.0","support_email":"support@advocal.in"}'::jsonb),
  ('subscription_plans', '[{"id":"trial","name":"Free Trial","duration_days":14,"price":0},{"id":"premium","name":"Premium","duration_days":365,"price":999}]'::jsonb),
  ('trial_settings',     '{"trial_duration_days":14,"trial_enabled":true}'::jsonb),
  ('notification_cfg',   '{"hearing_reminder_enabled":true,"reminder_hours_before":24}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- RLS (idempotent via ALTER TABLE which is safe to re-run)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hearing_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_logs ENABLE ROW LEVEL SECURITY;

-- ── Helper function ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = uid LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO anon, authenticated;

-- ── Policies (drop+recreate for idempotency) ───────────────────
DROP POLICY IF EXISTS "Admins have full access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Anon can read user profiles" ON public.profiles;
CREATE POLICY "Admins have full access to profiles" ON public.profiles FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role')='admin') WITH CHECK ((auth.jwt()->'app_metadata'->>'role')='admin');
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid()=id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid()=id AND (auth.jwt()->'app_metadata'->>'role')!='admin');
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid()=id AND (auth.jwt()->'app_metadata'->>'role')!='admin') WITH CHECK (auth.uid()=id);
CREATE POLICY "Anon can read user profiles" ON public.profiles FOR SELECT TO anon USING (role='user'::user_role);

DROP POLICY IF EXISTS "Users can manage their own cases" ON public.cases;
DROP POLICY IF EXISTS "Admins have full access to cases" ON public.cases;
CREATE POLICY "Users can manage their own cases" ON public.cases FOR ALL TO authenticated
  USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Admins have full access to cases" ON public.cases FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role')='admin');

DROP POLICY IF EXISTS "Users can manage their own hearing history" ON public.hearing_history;
DROP POLICY IF EXISTS "Admins have full access to hearing history" ON public.hearing_history;
CREATE POLICY "Users can manage their own hearing history" ON public.hearing_history FOR ALL TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Admins have full access to hearing history" ON public.hearing_history FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role')='admin');

DROP POLICY IF EXISTS "Users can manage their own team members" ON public.team_members;
CREATE POLICY "Users can manage their own team members" ON public.team_members FOR ALL TO authenticated USING (auth.uid()=profile_id);

DROP POLICY IF EXISTS "push_tokens: owner insert" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens: owner select" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens: owner update" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens: owner delete" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens: service read all" ON public.push_tokens;
CREATE POLICY "push_tokens: owner insert" ON public.push_tokens FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
CREATE POLICY "push_tokens: owner select" ON public.push_tokens FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "push_tokens: owner update" ON public.push_tokens FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY "push_tokens: owner delete" ON public.push_tokens FOR DELETE TO authenticated USING (user_id=auth.uid());
CREATE POLICY "push_tokens: service read all" ON public.push_tokens FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Admins can manage activity logs" ON public.admin_activity_logs;
CREATE POLICY "Admins can manage activity logs" ON public.admin_activity_logs FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role')='admin');
DROP POLICY IF EXISTS "Admins can manage notifications" ON public.admin_notifications;
CREATE POLICY "Admins can manage notifications" ON public.admin_notifications FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role')='admin');
DROP POLICY IF EXISTS "Admins can manage settings" ON public.admin_settings;
CREATE POLICY "Admins can manage settings" ON public.admin_settings FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role')='admin');
DROP POLICY IF EXISTS "push_notification_logs: service all" ON public.push_notification_logs;
CREATE POLICY "push_notification_logs: service all" ON public.push_notification_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth users can upload avatar" ON storage.objects;
DROP POLICY IF EXISTS "auth users can update avatar" ON storage.objects;
DROP POLICY IF EXISTS "public can view avatars" ON storage.objects;
CREATE POLICY "auth users can upload avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='avatars');
CREATE POLICY "auth users can update avatar" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='avatars');
CREATE POLICY "public can view avatars" ON storage.objects FOR SELECT TO public USING (bucket_id='avatars');

-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text; v_name text; v_role public.user_role;
BEGIN
  v_phone := NEW.raw_user_meta_data->>'phone_number';
  v_name  := NEW.raw_user_meta_data->>'full_name';
  v_role  := COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role,'user'::public.user_role);
  INSERT INTO public.profiles (id, email, phone_number, full_name, role)
  VALUES (NEW.id, NEW.email, v_phone, v_name, v_role) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.sync_otp_phone_to_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email LIKE '%@advocal.app' THEN
    UPDATE public.profiles SET phone_number = REGEXP_REPLACE(NEW.email,'@advocal\.app$','')
    WHERE id=NEW.id AND (phone_number IS NULL OR phone_number='');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS on_auth_user_otp_sync ON auth.users;
CREATE TRIGGER on_auth_user_otp_sync AFTER INSERT OR UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.sync_otp_phone_to_profile();

CREATE OR REPLACE FUNCTION public.sync_user_role_to_jwt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE auth.users SET raw_app_meta_data = COALESCE(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role',NEW.role::text) WHERE id=NEW.id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS on_profile_role_change ON public.profiles;
CREATE TRIGGER on_profile_role_change AFTER INSERT OR UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_user_role_to_jwt();

CREATE OR REPLACE FUNCTION public.update_notification_sent_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.notification_id IS NOT NULL THEN
    UPDATE public.admin_notifications
    SET sent_count=(SELECT COUNT(*) FROM push_notification_logs WHERE notification_id=NEW.notification_id AND status='sent'),
        status=CASE WHEN (SELECT COUNT(*) FROM push_notification_logs WHERE notification_id=NEW.notification_id AND status='failed')>0
          AND (SELECT COUNT(*) FROM push_notification_logs WHERE notification_id=NEW.notification_id AND status='sent')=0 THEN 'failed' ELSE 'sent' END
    WHERE id=NEW.notification_id;
  END IF; RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS push_notification_logs_after_insert ON public.push_notification_logs;
CREATE TRIGGER push_notification_logs_after_insert AFTER INSERT ON public.push_notification_logs FOR EACH ROW EXECUTE FUNCTION public.update_notification_sent_count();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN
    GRANT SELECT, INSERT, UPDATE ON public.profiles TO supabase_auth_admin;
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════
-- SQL HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_auth_password(p_user_id uuid, p_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth AS $$
DECLARE v_salt text;
BEGIN v_salt:=gen_salt('bf'); UPDATE auth.users SET encrypted_password=crypt(p_password,v_salt),updated_at=now() WHERE id=p_user_id; END;$$;

CREATE OR REPLACE FUNCTION public.upsert_auth_user_with_password(p_email text, p_password text, p_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth AS $$
DECLARE v_user_id uuid; v_salt text;
BEGIN
  v_salt:=gen_salt('bf');
  SELECT id INTO v_user_id FROM auth.users WHERE email=p_email;
  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users SET encrypted_password=crypt(p_password,v_salt),updated_at=now() WHERE id=v_user_id;
    INSERT INTO auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    VALUES(gen_random_uuid(),p_email,v_user_id,jsonb_build_object('sub',v_user_id,'email',p_email),'email',now(),now(),now()) ON CONFLICT DO NOTHING;
    RETURN v_user_id;
  END IF;
  v_user_id:=coalesce(p_user_id,gen_random_uuid());
  INSERT INTO auth.users(id,instance_id,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,aud,role)
  VALUES(v_user_id,'00000000-0000-0000-0000-000000000000',p_email,crypt(p_password,v_salt),now(),now(),now(),
    '{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('phone_number',split_part(p_email,'@',1)),'authenticated','authenticated');
  INSERT INTO auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
  VALUES(gen_random_uuid(),p_email,v_user_id,jsonb_build_object('sub',v_user_id,'email',p_email),'email',now(),now(),now());
  RETURN v_user_id;
END;$$;

REVOKE ALL ON FUNCTION public.update_auth_password FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_auth_user_with_password FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_auth_password TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_auth_user_with_password TO service_role;

-- ── Admin RPCs ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_advocates',(SELECT count(*) FROM profiles),
    'active_users',(SELECT count(*) FROM profiles WHERE subscription_status IN ('trial','premium')),
    'paid_users',(SELECT count(*) FROM profiles WHERE subscription_status='premium'),
    'trial_users',(SELECT count(*) FROM profiles WHERE subscription_status='trial'),
    'total_cases',(SELECT count(*) FROM cases),
    'total_hearings',(SELECT count(*) FROM hearing_history),
    'new_users_month',(SELECT count(*) FROM profiles WHERE date_trunc('month',created_at)=date_trunc('month',now()))
  ) INTO result; RETURN result;
END;$$;

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT '',p_status text DEFAULT 'all',p_page integer DEFAULT 0,p_pagesize integer DEFAULT 20)
RETURNS TABLE(id uuid,email text,full_name text,phone_number text,bar_registration_number text,chamber_name text,
  city text,subscription_status text,subscription_plan text,subscription_start_date timestamptz,
  subscription_end_date timestamptz,is_suspended boolean,role text,created_at timestamptz,updated_at timestamptz,total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY WITH filtered AS (
    SELECT p.* FROM profiles p WHERE p.role='user'
      AND(p_search=''OR p.full_name ILIKE '%'||p_search||'%'OR p.email ILIKE '%'||p_search||'%'
          OR p.phone_number ILIKE '%'||p_search||'%'OR p.bar_registration_number ILIKE '%'||p_search||'%')
      AND(p_status='all'OR p.subscription_status::text=p_status) ORDER BY p.created_at DESC)
  SELECT f.id,f.email,f.full_name,f.phone_number,f.bar_registration_number,f.chamber_name,f.city::text,
    f.subscription_status::text,f.subscription_plan,f.subscription_start_date,f.subscription_end_date,
    f.is_suspended,f.role::text,f.created_at,f.updated_at,COUNT(*)OVER() AS total_count
  FROM filtered f LIMIT p_pagesize OFFSET p_page*p_pagesize;
END;$$;

GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text,text,integer,integer) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';