
-- Add Acts & Sections, FIR Details, and full Parties data to cases table
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS acts_under        jsonb,
  ADD COLUMN IF NOT EXISTS fir_details       jsonb,
  ADD COLUMN IF NOT EXISTS petitioner_parties jsonb,
  ADD COLUMN IF NOT EXISTS respondent_parties jsonb;
