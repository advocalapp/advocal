-- Insert missing identity for test user (email is generated, exclude it)
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '8888888888@advocal.app',
  '1b47b2d8-628c-477e-bb9f-82f21da4e152',
  '{"sub":"1b47b2d8-628c-477e-bb9f-82f21da4e152","email":"8888888888@advocal.app"}'::jsonb,
  'email',
  now(), now(), now()
)
ON CONFLICT DO NOTHING;

-- Fix all other users missing identities too
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT
  gen_random_uuid(),
  u.email,
  u.id,
  jsonb_build_object('sub', u.id, 'email', u.email),
  'email',
  now(), now(), now()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.user_id = u.id
)
ON CONFLICT DO NOTHING;

-- Fix upsert function — email is a generated column, never insert it explicitly
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
    SET encrypted_password = crypt(p_password, v_salt), updated_at = now()
    WHERE id = v_user_id;
    -- Ensure identity row exists
    INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), p_email, v_user_id, jsonb_build_object('sub', v_user_id, 'email', p_email), 'email', now(), now(), now())
    ON CONFLICT DO NOTHING;
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
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('phone_number', split_part(p_email, '@', 1)),
    'authenticated', 'authenticated'
  );
  INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), p_email, v_user_id, jsonb_build_object('sub', v_user_id, 'email', p_email), 'email', now(), now(), now());
  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_auth_user_with_password FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_auth_user_with_password TO service_role;