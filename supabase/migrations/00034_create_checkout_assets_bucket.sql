
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'advocal-public',
  'advocal-public',
  true,
  102400,
  ARRAY['text/html','text/css','application/javascript','image/png','image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'advocal_public_select'
  ) THEN
    EXECUTE 'CREATE POLICY advocal_public_select ON storage.objects FOR SELECT USING (bucket_id = ''advocal-public'')';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'advocal_public_insert'
  ) THEN
    EXECUTE 'CREATE POLICY advocal_public_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''advocal-public'')';
  END IF;
END $$;
