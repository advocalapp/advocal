
-- Legal pages table — stores editable content for each policy page
CREATE TABLE IF NOT EXISTS public.legal_pages (
  id            TEXT PRIMARY KEY,   -- e.g. 'about_us', 'privacy_policy'
  title         TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default rows (do nothing on conflict so re-runs are safe)
INSERT INTO public.legal_pages (id, title, content) VALUES
  ('about_us',          'About Us',                       'AdvoCal is a professional legal calendar application designed for advocates and legal professionals in India.'),
  ('contact_us',        'Contact Us',                     'For support, reach us at support@advocal.in'),
  ('privacy_policy',    'Privacy Policy',                 'Your privacy is important to us. This policy explains how we collect and use your data.'),
  ('terms_conditions',  'Terms and Conditions',           'By using AdvoCal, you agree to these terms and conditions.'),
  ('refund_policy',     'Refund & Cancellation Policy',   'Subscriptions are non-refundable. You may cancel anytime to stop future billing.'),
  ('payment_checkout',  'Payment Checkout Flow',          'Payments are processed securely via Razorpay. We support UPI, cards, and net banking.')
ON CONFLICT (id) DO NOTHING;

-- RLS: public read (app users), authenticated write only for admins
ALTER TABLE public.legal_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legal_pages_read"  ON public.legal_pages;
DROP POLICY IF EXISTS "legal_pages_admin" ON public.legal_pages;

CREATE POLICY "legal_pages_read"  ON public.legal_pages FOR SELECT USING (true);
CREATE POLICY "legal_pages_admin" ON public.legal_pages FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
