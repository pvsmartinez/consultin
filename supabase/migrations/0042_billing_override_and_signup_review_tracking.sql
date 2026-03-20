-- Migration: 0042_billing_override_and_signup_review_tracking
-- Adds an explicit manual billing override for super admins and updates the
-- billing gate helper to consider it. Keeps Asaas state separate from manual
-- unlocks.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS billing_override_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_payments(target_clinic uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.current_user_is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.clinics c ON c.id = up.clinic_id
      WHERE up.id = (SELECT auth.uid())
        AND up.clinic_id = target_clinic
        AND (c.payments_enabled = TRUE OR c.billing_override_enabled = TRUE)
    );
$$;