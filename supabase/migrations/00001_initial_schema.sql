-- User roles
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- Case status
CREATE TYPE public.case_status AS ENUM ('pending', 'ongoing', 'completed', 'adjourned', 'urgent');

-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  role public.user_role NOT NULL DEFAULT 'user',
  full_name text,
  bar_registration_number text,
  chamber_name text,
  chamber_address text,
  chamber_phone text,
  profile_photo_url text,
  notification_reminders boolean NOT NULL DEFAULT true,
  notification_same_day boolean NOT NULL DEFAULT true,
  notification_next_date boolean NOT NULL DEFAULT true,
  reminder_hours_before integer NOT NULL DEFAULT 24,
  date_format text NOT NULL DEFAULT 'DD/MM/YYYY',
  time_format text NOT NULL DEFAULT '12h',
  subscription_plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Cases table
CREATE TABLE public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_title text NOT NULL,
  case_type text,
  case_number text,
  cnr_number text,
  filing_number text,
  court_name text NOT NULL,
  court_room text,
  judge_name text,
  client_name text,
  opponent_name text,
  status public.case_status NOT NULL DEFAULT 'pending',
  hearing_date date,
  hearing_time time,
  next_hearing_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Hearing history table
CREATE TABLE public.hearing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hearing_date date NOT NULL,
  hearing_time time,
  outcome text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Team members table
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    'user'::public.user_role
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Get user role helper
CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hearing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Admins have full access to profiles" ON profiles
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));

-- Cases policies
CREATE POLICY "Users can manage their own cases" ON cases
  FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins have full access to cases" ON cases
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- Hearing history policies
CREATE POLICY "Users can manage their own hearing history" ON hearing_history
  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Team members policies
CREATE POLICY "Users can manage their own team members" ON team_members
  FOR ALL TO authenticated USING (auth.uid() = profile_id);

-- Public profiles view
CREATE VIEW public_profiles AS
  SELECT id, role FROM profiles;
