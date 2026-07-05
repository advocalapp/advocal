
-- Track admin-granted plan extensions
CREATE TABLE IF NOT EXISTS public.admin_plan_extensions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name           text,
  admin_id            uuid,
  admin_name          text,
  plan_type           text NOT NULL CHECK (plan_type IN ('monthly','yearly')),
  reason              text NOT NULL,
  previous_end_date   timestamptz,
  new_end_date        timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Allow admins to read/write via service role (RLS not enforced for edge functions)
ALTER TABLE public.admin_plan_extensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only" ON public.admin_plan_extensions
  USING (false) WITH CHECK (false);

-- Add subscription_source column to profiles (admin | razorpay | trial)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_source text DEFAULT NULL;
