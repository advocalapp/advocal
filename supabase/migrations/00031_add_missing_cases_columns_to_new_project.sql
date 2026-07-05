-- Add columns missing from rfyybptrmtajtthicpal cases table
-- Platform uses acts_under/fir_details/petitioner_parties/respondent_parties
-- New project uses acts/fir_number/parties — add the platform aliases too for compatibility
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS acts_under JSONB,
  ADD COLUMN IF NOT EXISTS fir_details JSONB,
  ADD COLUMN IF NOT EXISTS petitioner_parties JSONB,
  ADD COLUMN IF NOT EXISTS respondent_parties JSONB;