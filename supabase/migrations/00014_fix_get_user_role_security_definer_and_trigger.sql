
-- ─── 1. Fix get_user_role — must be SECURITY DEFINER to bypass RLS ────────────
-- Without this, the "Admins have full access" RLS policy deadlocks:
-- checking role requires reading profiles, which requires being admin, which requires reading profiles...
CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- ─── 2. Fix handle_new_user — copy phone_number from metadata ─────────────────
-- Phone-OTP users sign up as {phone}@advocal.app with phone_number in raw_user_meta_data.
-- Previous trigger inserted email+role only, losing phone_number.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone  text;
  v_name   text;
  v_role   public.user_role;
BEGIN
  -- Extract phone from metadata (phone OTP users store it there)
  v_phone := NEW.raw_user_meta_data->>'phone_number';
  v_name  := NEW.raw_user_meta_data->>'full_name';
  v_role  := COALESCE(
               (NEW.raw_user_meta_data->>'role')::public.user_role,
               'user'::public.user_role
             );

  INSERT INTO public.profiles (id, email, phone_number, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    v_phone,
    v_name,
    v_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ─── 3. Backfill phone_number for any profiles that already exist but are missing it ──
UPDATE public.profiles p
SET phone_number = u.raw_user_meta_data->>'phone_number'
FROM auth.users u
WHERE p.id = u.id
  AND p.phone_number IS NULL
  AND u.raw_user_meta_data->>'phone_number' IS NOT NULL;
