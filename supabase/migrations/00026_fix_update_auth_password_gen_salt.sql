-- Fix gen_salt call: cast cost as int explicitly, and also expose a simpler test helper
CREATE OR REPLACE FUNCTION public.update_auth_password(p_user_id uuid, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_salt text;
BEGIN
  v_salt := gen_salt('bf');   -- default cost, no explicit integer arg
  UPDATE auth.users
  SET encrypted_password = crypt(p_password, v_salt),
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_auth_user_with_password(
  p_email    text,
  p_password text,
  p_user_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_user_id uuid;
  v_salt    text;
BEGIN
  v_salt := gen_salt('bf');

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = crypt(p_password, v_salt),
        updated_at = now()
    WHERE id = v_user_id;
    RETURN v_user_id;
  END IF;

  v_user_id := coalesce(p_user_id, gen_random_uuid());
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, aud, role
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_password, v_salt),
    now(), now(), now(),
    '{"provider":"phone","providers":["phone"]}'::jsonb,
    jsonb_build_object('phone_number', split_part(p_email, '@', 1)),
    'authenticated', 'authenticated'
  );
  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_auth_password FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_auth_user_with_password FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_auth_password TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_auth_user_with_password TO service_role;