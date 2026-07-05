-- Make both trigger functions SECURITY DEFINER so they run as owner (postgres)
-- regardless of which role GoTrue (supabase_auth_admin) uses to call them.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_name  text;
  v_role  public.user_role;
BEGIN
  v_phone := NEW.raw_user_meta_data->>'phone_number';
  v_name  := NEW.raw_user_meta_data->>'full_name';
  v_role  := COALESCE(
               (NEW.raw_user_meta_data->>'role')::public.user_role,
               'user'::public.user_role
             );
  INSERT INTO public.profiles (id, email, phone_number, full_name, role)
  VALUES (NEW.id, NEW.email, v_phone, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let a profile insert failure block auth user creation
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_otp_phone_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email LIKE '%@advocal.app' THEN
    UPDATE public.profiles
    SET phone_number = REGEXP_REPLACE(NEW.email, '@advocal\.app$', '')
    WHERE id = NEW.id
      AND (phone_number IS NULL OR phone_number = '');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let a sync failure block auth operations
  RETURN NEW;
END;
$$;

-- Also grant supabase_auth_admin direct access to profiles as a safety net
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT SELECT, INSERT, UPDATE ON public.profiles TO supabase_auth_admin;
  END IF;
END$$;