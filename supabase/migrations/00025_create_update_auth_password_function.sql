-- Helper function for edge functions to update auth user password directly
-- Bypasses the broken auth.admin.updateUserById API on this platform
CREATE OR REPLACE FUNCTION public.update_auth_password(p_user_id uuid, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET
    encrypted_password = crypt(p_password, gen_salt('bf', 10)),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Also helper to upsert auth user by email with known password
CREATE OR REPLACE FUNCTION public.upsert_auth_user_with_password(
  p_email text,
  p_password text,
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

  IF v_user_id IS NOT NULL THEN
    -- Update existing user's password
    UPDATE auth.users
    SET
      encrypted_password = crypt(p_password, gen_salt('bf', 10)),
      updated_at = now()
    WHERE id = v_user_id;
    RETURN v_user_id;
  END IF;

  -- Insert new auth user
  v_user_id := coalesce(p_user_id, gen_random_uuid());
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    aud, role
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_password, gen_salt('bf', 10)),
    now(), now(), now(),
    '{"provider":"phone","providers":["phone"]}'::jsonb,
    jsonb_build_object('phone_number', split_part(p_email, '@', 1)),
    'authenticated', 'authenticated'
  );
  RETURN v_user_id;
END;
$$;

-- Grant execute to service role only (edge functions use service role)
REVOKE ALL ON FUNCTION public.update_auth_password FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_auth_user_with_password FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_auth_password TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_auth_user_with_password TO service_role;