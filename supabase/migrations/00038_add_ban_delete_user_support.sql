
-- Add is_banned column if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

-- RPC to fully delete a user from auth + cascade (runs as service role)
CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove profile (cascades via FK to any referencing tables)
  DELETE FROM profiles WHERE id = target_user_id;
  -- Delete auth user so they can sign up fresh
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;
