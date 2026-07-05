
-- ── Payments table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mobile_number         text,
  plan_type             text NOT NULL CHECK (plan_type IN ('monthly', 'yearly')),
  amount                integer NOT NULL,            -- in paise (₹49 = 4900, ₹499 = 49900)
  currency              text NOT NULL DEFAULT 'INR',
  razorpay_order_id     text UNIQUE,
  razorpay_payment_id   text UNIQUE,
  razorpay_signature    text,
  payment_status        text NOT NULL DEFAULT 'created'
                        CHECK (payment_status IN ('created','authorized','captured','failed','cancelled','pending','refunded')),
  subscription_start    timestamptz,
  subscription_expiry   timestamptz,
  webhook_verified      boolean NOT NULL DEFAULT false,
  error_code            text,
  error_description     text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Index for quick user lookups and admin queries
CREATE INDEX IF NOT EXISTS payments_user_id_idx        ON payments(user_id);
CREATE INDEX IF NOT EXISTS payments_status_idx         ON payments(payment_status);
CREATE INDEX IF NOT EXISTS payments_order_id_idx       ON payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS payments_created_at_idx     ON payments(created_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS payments_updated_at_trigger ON payments;
CREATE TRIGGER payments_updated_at_trigger
  BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_payments_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helper to check admin role (avoids self-loop)
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- Users: SELECT own payments
DROP POLICY IF EXISTS payments_select_own ON payments;
CREATE POLICY payments_select_own ON payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users: INSERT their own payment orders (created by Edge Function via service-role, but allow read-back)
DROP POLICY IF EXISTS payments_insert_own ON payments;
CREATE POLICY payments_insert_own ON payments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admins: full access
DROP POLICY IF EXISTS payments_admin_all ON payments;
CREATE POLICY payments_admin_all ON payments
  FOR ALL TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- Service role (Edge Functions): unrestricted
DROP POLICY IF EXISTS payments_service_all ON payments;
CREATE POLICY payments_service_all ON payments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
