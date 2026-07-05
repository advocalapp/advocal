-- 1. Add INSERT policy for new users (service-role bypasses RLS, but user's own session needs this for profile setup)
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id AND (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin');

-- 2. Fix UPDATE policy — remove get_user_role() call which caused issues; just check uid
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id AND (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin')
  WITH CHECK (auth.uid() = id);

NOTIFY pgrst, 'reload schema';