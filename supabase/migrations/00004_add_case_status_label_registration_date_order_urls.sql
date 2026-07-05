-- Add case_status_label: raw status string from eCourts (e.g. "Case disposed")
ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_status_label text;

-- Add registration_date from eCourts
ALTER TABLE cases ADD COLUMN IF NOT EXISTS registration_date date;

-- ecourts_final_orders already exists as jsonb — 
-- pdf_url will be stored inside each order object within that jsonb array
-- No new column needed, just the edge fn + type update
