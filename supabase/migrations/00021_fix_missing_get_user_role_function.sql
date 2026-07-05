-- Recreate get_user_role as SECURITY DEFINER so it bypasses RLS when reading profiles
-- Without this, the admin RLS policy silently fails → returns 0 rows
CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid LIMIT 1;
$$;

-- Grant execute to all roles so RLS policies can call it
GRANT EXECUTE ON FUNCTION get_user_role(uuid) TO anon, authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';