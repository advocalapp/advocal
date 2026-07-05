-- Add columns missing from rfyybptrmtajtthicpal profiles table
-- These will be applied via the platform project's linked schema sync
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS premium_start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS premium_end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;