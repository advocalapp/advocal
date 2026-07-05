-- Add full eCourts case detail columns to cases table
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS decision_date         date,
  ADD COLUMN IF NOT EXISTS first_hearing_date    date,
  ADD COLUMN IF NOT EXISTS nature_of_disposal    text,
  ADD COLUMN IF NOT EXISTS petitioner_advocate   text,
  ADD COLUMN IF NOT EXISTS respondent_advocate   text,
  ADD COLUMN IF NOT EXISTS ecourts_case_history  jsonb,
  ADD COLUMN IF NOT EXISTS ecourts_final_orders  jsonb;
