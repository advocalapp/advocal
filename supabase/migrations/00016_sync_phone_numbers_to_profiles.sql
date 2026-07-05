-- Sync phone numbers from auth.users to profiles for OTP users
UPDATE profiles p
SET phone_number = REGEXP_REPLACE(au.email, '@advocal\.app$', '')
FROM auth.users au
WHERE p.id = au.id
  AND au.email LIKE '%@advocal.app'
  AND (p.phone_number IS NULL OR p.phone_number = '')
  AND REGEXP_REPLACE(au.email, '@advocal\.app$', '') ~ '^\d{10,15}$';

-- Also ensure future OTP signups populate phone_number via trigger
CREATE OR REPLACE FUNCTION sync_otp_phone_to_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.email LIKE '%@advocal.app' THEN
    UPDATE profiles
    SET phone_number = REGEXP_REPLACE(NEW.email, '@advocal\.app$', '')
    WHERE id = NEW.id
      AND (phone_number IS NULL OR phone_number = '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_otp_sync ON auth.users;
CREATE TRIGGER on_auth_user_otp_sync
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_otp_phone_to_profile();