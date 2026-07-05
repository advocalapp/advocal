
-- CRM Contacts
CREATE TABLE crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  company_id uuid,
  contact_type text NOT NULL DEFAULT 'client',
  address text,
  notes text,
  last_contact_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CRM Companies
CREATE TABLE crm_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  industry text,
  email text,
  phone text,
  address text,
  contact_person text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add FK for contacts → companies
ALTER TABLE crm_contacts ADD CONSTRAINT crm_contacts_company_fk
  FOREIGN KEY (company_id) REFERENCES crm_companies(id) ON DELETE SET NULL;

-- CRM Leads
CREATE TABLE crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  company_name text,
  status text NOT NULL DEFAULT 'new',
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CRM Tasks
CREATE TABLE crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_date date,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'pending',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CRM Documents
CREATE TABLE crm_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  doc_category text DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CRM Reminders
CREATE TABLE crm_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_date date NOT NULL,
  due_time time,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CRM Activities log
CREATE TABLE crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CRM Calls log
CREATE TABLE crm_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  phone_number text,
  call_type text NOT NULL DEFAULT 'outgoing',
  duration_seconds integer,
  notes text,
  called_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_calls ENABLE ROW LEVEL SECURITY;

-- contacts policies
CREATE POLICY "user_contacts_select" ON crm_contacts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_contacts_insert" ON crm_contacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_contacts_update" ON crm_contacts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_contacts_delete" ON crm_contacts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- companies policies
CREATE POLICY "user_companies_select" ON crm_companies FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_companies_insert" ON crm_companies FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_companies_update" ON crm_companies FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_companies_delete" ON crm_companies FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- leads policies
CREATE POLICY "user_leads_select" ON crm_leads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_leads_insert" ON crm_leads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_leads_update" ON crm_leads FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_leads_delete" ON crm_leads FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- tasks policies
CREATE POLICY "user_tasks_select" ON crm_tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_tasks_insert" ON crm_tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_tasks_update" ON crm_tasks FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_tasks_delete" ON crm_tasks FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- documents policies
CREATE POLICY "user_documents_select" ON crm_documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_documents_insert" ON crm_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_documents_update" ON crm_documents FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_documents_delete" ON crm_documents FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- reminders policies
CREATE POLICY "user_reminders_select" ON crm_reminders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_reminders_insert" ON crm_reminders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_reminders_update" ON crm_reminders FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_reminders_delete" ON crm_reminders FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- activities policies
CREATE POLICY "user_activities_select" ON crm_activities FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_activities_insert" ON crm_activities FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- calls policies
CREATE POLICY "user_calls_select" ON crm_calls FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_calls_insert" ON crm_calls FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_calls_update" ON crm_calls FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_calls_delete" ON crm_calls FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Storage bucket for CRM documents
INSERT INTO storage.buckets (id, name, public) VALUES ('crm-documents', 'crm-documents', false);
CREATE POLICY "crm_docs_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'crm-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "crm_docs_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'crm-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "crm_docs_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'crm-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
