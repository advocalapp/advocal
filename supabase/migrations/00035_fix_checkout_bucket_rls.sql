
-- Drop and recreate INSERT policy to explicitly allow public (anon) uploads
DROP POLICY IF EXISTS advocal_public_insert ON storage.objects;
CREATE POLICY advocal_public_insert ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'advocal-public');
