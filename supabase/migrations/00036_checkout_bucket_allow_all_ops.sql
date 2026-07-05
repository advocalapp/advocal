
-- Allow all operations on advocal-public bucket for public role
DROP POLICY IF EXISTS advocal_public_select ON storage.objects;
DROP POLICY IF EXISTS advocal_public_insert ON storage.objects;
DROP POLICY IF EXISTS advocal_public_update ON storage.objects;
DROP POLICY IF EXISTS advocal_public_delete ON storage.objects;

CREATE POLICY advocal_public_select ON storage.objects FOR SELECT TO public USING (bucket_id = 'advocal-public');
CREATE POLICY advocal_public_insert ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'advocal-public');
CREATE POLICY advocal_public_update ON storage.objects FOR UPDATE TO public USING (bucket_id = 'advocal-public');
CREATE POLICY advocal_public_delete ON storage.objects FOR DELETE TO public USING (bucket_id = 'advocal-public');
