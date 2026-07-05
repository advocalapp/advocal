INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admin-icons', 'admin-icons', true, 2097152,
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admin can upload icons" ON storage.objects;
DROP POLICY IF EXISTS "Public can view icons" ON storage.objects;

CREATE POLICY "Admin can upload icons"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'admin-icons' AND get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Public can view icons"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'admin-icons');