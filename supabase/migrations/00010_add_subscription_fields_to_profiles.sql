
-- Add subscription & trial tracking columns to profiles
ALTER TABLE profiles
  ADD COLUMN signup_date         timestamptz,
  ADD COLUMN profile_created_at  timestamptz,
  ADD COLUMN trial_start_date    timestamptz,
  ADD COLUMN subscription_status text NOT NULL DEFAULT 'none',
  ADD COLUMN subscription_start_date timestamptz,
  ADD COLUMN subscription_end_date   timestamptz;

-- subscription_status values: 'none' | 'trial' | 'premium' | 'expired'
-- Add a check constraint for valid values
ALTER TABLE profiles
  ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IN ('none','trial','premium','expired'));
