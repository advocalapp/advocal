-- Add explicit WITH CHECK to the cases INSERT/UPDATE policy
-- Previously only USING was specified; PostgreSQL uses USING for WITH CHECK
-- when omitted, but PostgREST can behave inconsistently in some versions.
DROP POLICY IF EXISTS "Users can manage their own cases" ON cases;
CREATE POLICY "Users can manage their own cases" ON cases
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);