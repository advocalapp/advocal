
-- 1. Add new columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS company_name       text,
  ADD COLUMN IF NOT EXISTS address            text,
  ADD COLUMN IF NOT EXISTS date_of_birth      date,
  ADD COLUMN IF NOT EXISTS avatar_url         text;

-- 2. OTP sessions table
CREATE TABLE IF NOT EXISTS otp_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL,
  otp_hash      text NOT NULL,
  flow          text NOT NULL CHECK (flow IN ('login','signup')),
  attempts      int  NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  used          boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_sessions_phone_idx ON otp_sessions(phone);

ALTER TABLE otp_sessions ENABLE ROW LEVEL SECURITY;

-- 3. Storage bucket for avatars
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  1048576,
  ARRAY['image/jpeg','image/jpg','image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop first to avoid duplicate)
DROP POLICY IF EXISTS "auth users can upload avatar" ON storage.objects;
DROP POLICY IF EXISTS "auth users can update avatar" ON storage.objects;
DROP POLICY IF EXISTS "public can view avatars"      ON storage.objects;

CREATE POLICY "auth users can upload avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "auth users can update avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "public can view avatars"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');
