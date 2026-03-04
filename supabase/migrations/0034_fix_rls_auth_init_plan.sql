-- ─── Fix: Auth RLS Initialization Plan ───────────────────────────────────────
-- Replace bare auth.uid() calls in RLS policies with (select auth.uid()) so
-- Postgres evaluates the session value once per statement instead of once per
-- row, eliminating the "re-evaluation for each row" performance warning.
-- Affected tables: clinics, user_profiles, clinic_invites, patient_records,
--   patients, appointments, professional_bank_accounts, appointment_payments,
--   storage.objects (avatars bucket)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── clinics ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clinic_isolation"         ON clinics;
DROP POLICY IF EXISTS "authenticated_read_clinics" ON clinics;

CREATE POLICY "clinic_isolation" ON clinics
  FOR ALL USING (id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "authenticated_read_clinics" ON clinics
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

-- ─── user_profiles ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own_profile_read"          ON user_profiles;
DROP POLICY IF EXISTS "own_profile_update"        ON user_profiles;
DROP POLICY IF EXISTS "clinic_admin_update_member" ON user_profiles;
DROP POLICY IF EXISTS "clinic_admin_delete_member" ON user_profiles;

CREATE POLICY "own_profile_read" ON user_profiles
  FOR SELECT USING (id = (SELECT auth.uid()));

CREATE POLICY "own_profile_update" ON user_profiles
  FOR UPDATE USING (id = (SELECT auth.uid()));

CREATE POLICY "clinic_admin_update_member"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    id != (SELECT auth.uid())
    AND clinic_id = current_user_clinic_id()
    AND current_user_role() = 'admin'
  );

CREATE POLICY "clinic_admin_delete_member"
  ON public.user_profiles
  FOR DELETE
  TO authenticated
  USING (
    id != (SELECT auth.uid())
    AND clinic_id = current_user_clinic_id()
    AND current_user_role() = 'admin'
  );

-- ─── clinic_invites ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invitee_read_own" ON clinic_invites;

CREATE POLICY "invitee_read_own" ON clinic_invites
  FOR SELECT
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND lower(email) = lower(auth.email())
    AND used_at IS NULL
  );

-- ─── patient_records ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clinic_isolation" ON patient_records;

CREATE POLICY "clinic_isolation" ON patient_records
  FOR ALL USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid())));

-- ─── patients ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "patients_own_record" ON patients;
DROP POLICY IF EXISTS "patients_own_update" ON patients;

CREATE POLICY "patients_own_record" ON patients
  FOR SELECT
  USING (
    current_user_role() = 'patient'
    AND user_id = (SELECT auth.uid())
  );

CREATE POLICY "patients_own_update" ON patients
  FOR UPDATE
  USING (
    current_user_role() = 'patient'
    AND user_id = (SELECT auth.uid())
  );

-- ─── appointments ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "appointments_patient_own" ON appointments;

CREATE POLICY "appointments_patient_own" ON appointments
  FOR SELECT
  USING (
    current_user_role() = 'patient'
    AND patient_id = (SELECT id FROM patients WHERE user_id = (SELECT auth.uid()) LIMIT 1)
  );

-- ─── professional_bank_accounts ───────────────────────────────────────────────
DROP POLICY IF EXISTS "prof_bank_select" ON professional_bank_accounts;
DROP POLICY IF EXISTS "prof_bank_insert" ON professional_bank_accounts;
DROP POLICY IF EXISTS "prof_bank_update" ON professional_bank_accounts;
DROP POLICY IF EXISTS "prof_bank_delete" ON professional_bank_accounts;

CREATE POLICY "prof_bank_select" ON professional_bank_accounts
  FOR SELECT USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "prof_bank_insert" ON professional_bank_accounts
  FOR INSERT WITH CHECK (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "prof_bank_update" ON professional_bank_accounts
  FOR UPDATE USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "prof_bank_delete" ON professional_bank_accounts
  FOR DELETE USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

-- ─── appointment_payments ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "appt_pay_select" ON appointment_payments;
DROP POLICY IF EXISTS "appt_pay_insert" ON appointment_payments;
DROP POLICY IF EXISTS "appt_pay_update" ON appointment_payments;

CREATE POLICY "appt_pay_select" ON appointment_payments
  FOR SELECT USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "appt_pay_insert" ON appointment_payments
  FOR INSERT WITH CHECK (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "appt_pay_update" ON appointment_payments
  FOR UPDATE USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

-- ─── storage.objects (avatars bucket) ────────────────────────────────────────
DROP POLICY IF EXISTS "avatars: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars: owner update" ON storage.objects;
DROP POLICY IF EXISTS "avatars: owner delete" ON storage.objects;

CREATE POLICY "avatars: owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars: owner update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars: owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );
