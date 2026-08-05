-- Migration: 0003_auth_roles
-- Adds 'patient' role, links auth users to patient records,
-- and sets up RLS policies for each role.

-- ─── Extend user_role enum ────────────────────────────────────────────────────
-- 'professional' = médico/dentista/especialista
-- 'patient'      = paciente (acesso próprio via app)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'patient';

-- ─── Link patient record to auth user ────────────────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_user_id ON patients (user_id) WHERE user_id IS NOT NULL;

-- ─── RLS: user_profiles — each user reads their own profile ──────────────────
DROP POLICY IF EXISTS "own_profile_read" ON user_profiles;
CREATE POLICY "own_profile_read" ON user_profiles
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "own_profile_update" ON user_profiles;
CREATE POLICY "own_profile_update" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- ─── Helper function: get current user's role ────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS user_role AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ─── Helper function: get current user's clinic_id ───────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_clinic_id() RETURNS UUID AS $$
  SELECT clinic_id FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ─── Appointments: patients can only see their own ───────────────────────────
-- Drop old generic policy if it exists, then create role-specific ones
DROP POLICY IF EXISTS "clinic_isolation" ON appointments;

CREATE POLICY "appointments_clinic_staff" ON appointments
  FOR ALL
  USING (
    current_user_role() IN ('admin', 'receptionist', 'professional')
    AND clinic_id = current_user_clinic_id()
  );

CREATE POLICY "appointments_patient_own" ON appointments
  FOR SELECT
  USING (
    current_user_role()::text = 'patient'
    AND patient_id = (SELECT id FROM patients WHERE user_id = auth.uid() LIMIT 1)
  );

-- ─── Patients: patients can read/update only their own record ─────────────────
DROP POLICY IF EXISTS "clinic_isolation" ON patients;

CREATE POLICY "patients_clinic_staff" ON patients
  FOR ALL
  USING (
    current_user_role() IN ('admin', 'receptionist', 'professional')
    AND clinic_id = current_user_clinic_id()
  );

CREATE POLICY "patients_own_record" ON patients
  FOR SELECT
  USING (
    current_user_role()::text = 'patient'
    AND user_id = auth.uid()
  );

CREATE POLICY "patients_own_update" ON patients
  FOR UPDATE
  USING (
    current_user_role()::text = 'patient'
    AND user_id = auth.uid()
  );

-- ─── Professionals: visible to all authenticated users of the clinic ──────────
DROP POLICY IF EXISTS "clinic_isolation" ON professionals;

CREATE POLICY "professionals_clinic" ON professionals
  FOR SELECT
  USING (clinic_id = current_user_clinic_id());

CREATE POLICY "professionals_admin_write" ON professionals
  FOR ALL
  USING (
    current_user_role() = 'admin'
    AND clinic_id = current_user_clinic_id()
  );
