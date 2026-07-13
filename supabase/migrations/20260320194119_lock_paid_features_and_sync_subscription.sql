-- Migration: 0041_lock_paid_features_and_sync_subscription
-- Ensures paid financial operations are blocked at the DB layer when the
-- clinic subscription is inactive, while keeping super-admin access.

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
        AND c.payments_enabled = TRUE
    );
$$;

DROP POLICY IF EXISTS "prof_bank_insert" ON public.professional_bank_accounts;
DROP POLICY IF EXISTS "prof_bank_update" ON public.professional_bank_accounts;
DROP POLICY IF EXISTS "prof_bank_delete" ON public.professional_bank_accounts;

CREATE POLICY "prof_bank_insert" ON public.professional_bank_accounts
  FOR INSERT
  WITH CHECK (public.current_user_can_manage_payments(clinic_id));

CREATE POLICY "prof_bank_update" ON public.professional_bank_accounts
  FOR UPDATE
  USING (public.current_user_can_manage_payments(clinic_id))
  WITH CHECK (public.current_user_can_manage_payments(clinic_id));

CREATE POLICY "prof_bank_delete" ON public.professional_bank_accounts
  FOR DELETE
  USING (public.current_user_can_manage_payments(clinic_id));

DROP POLICY IF EXISTS "appt_pay_insert" ON public.appointment_payments;
DROP POLICY IF EXISTS "appt_pay_update" ON public.appointment_payments;

CREATE POLICY "appt_pay_insert" ON public.appointment_payments
  FOR INSERT
  WITH CHECK (public.current_user_can_manage_payments(clinic_id));

CREATE POLICY "appt_pay_update" ON public.appointment_payments
  FOR UPDATE
  USING (public.current_user_can_manage_payments(clinic_id))
  WITH CHECK (public.current_user_can_manage_payments(clinic_id));