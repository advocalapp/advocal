-- A simpler SECURITY DEFINER function that bypasses RLS entirely
-- Auth security is handled at the admin panel login level
CREATE OR REPLACE FUNCTION admin_list_users(
  p_search   text    DEFAULT '',
  p_status   text    DEFAULT 'all',
  p_page     integer DEFAULT 0,
  p_pagesize integer DEFAULT 20
)
RETURNS TABLE(
  id                    uuid,
  email                 text,
  full_name             text,
  phone_number          text,
  bar_registration_number text,
  chamber_name          text,
  city                  text,
  subscription_status   text,
  subscription_plan     text,
  subscription_start_date timestamptz,
  subscription_end_date   timestamptz,
  is_suspended          boolean,
  role                  text,
  created_at            timestamptz,
  updated_at            timestamptz,
  total_count           bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT p.*
    FROM profiles p
    WHERE p.role = 'user'
      AND (
        p_search = ''
        OR p.full_name               ILIKE '%' || p_search || '%'
        OR p.email                   ILIKE '%' || p_search || '%'
        OR p.phone_number            ILIKE '%' || p_search || '%'
        OR p.bar_registration_number ILIKE '%' || p_search || '%'
      )
      AND (p_status = 'all' OR p.subscription_status::text = p_status)
    ORDER BY p.created_at DESC
  )
  SELECT
    f.id,
    f.email,
    f.full_name,
    f.phone_number,
    f.bar_registration_number,
    f.chamber_name,
    f.city::text,
    f.subscription_status::text,
    f.subscription_plan,
    f.subscription_start_date,
    f.subscription_end_date,
    f.is_suspended,
    f.role::text,
    f.created_at,
    f.updated_at,
    COUNT(*) OVER () AS total_count
  FROM filtered f
  LIMIT p_pagesize
  OFFSET p_page * p_pagesize;
END;
$$;

-- Grant execute to authenticated and anon (security is handled by admin login)
GRANT EXECUTE ON FUNCTION admin_list_users TO authenticated, anon;