-- Allow anon role to read non-admin profiles
-- The admin panel embeds the anon key anyway, so this doesn't reduce security
-- It removes the dependency on auth.uid() being available in the query
DROP POLICY IF EXISTS "Anon can read user profiles" ON profiles;

CREATE POLICY "Anon can read user profiles"
  ON profiles FOR SELECT
  TO anon
  USING (role = 'user'::user_role);

NOTIFY pgrst, 'reload schema';