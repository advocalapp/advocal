ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number  text,
  ADD COLUMN IF NOT EXISTS city          text,
  ADD COLUMN IF NOT EXISTS location      text;

-- Index on phone_number for fast look-ups during OTP sign-in
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_idx
  ON public.profiles (phone_number)
  WHERE phone_number IS NOT NULL;