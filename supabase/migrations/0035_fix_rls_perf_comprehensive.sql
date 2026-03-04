-- Migration: 0035_fix_rls_perf_comprehensive
-- ════════════════════════════════════════════════════════════════
-- Eliminates all remaining Supabase linter warnings in two categories:
--
--  auth_rls_initplan (lint 0003):
--    Wraps bare auth.uid() / auth.email() calls in (select ...) so Postgres
--    evaluates the session value once per statement rather than once per row.
--
--  multiple_permissive_policies (lint 0006):
--    Consolidates overlapping permissive policies on the same table+action
--    into a single policy per action using OR conditions. Specifically replaces
--    any remaining FOR ALL policies that overlap with action-specific policies.
--
-- Tables affected:
--   appointments, availability_slots, clinic_invites, clinic_rooms,
--   clinic_signup_requests, clinics, notification_log, patient_records,
--   patients, professionals, service_types, user_clinic_memberships,
--   user_profiles, whatsapp_faqs, whatsapp_messages, whatsapp_sessions,
--   whatsapp_templates
-- ════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- APPOINTMENTS
-- ════════════════════════════════════════════════════════════════
-- Drops 6 overlapping policies (FOR ALL admin_receptionist, plus patient and
-- professional variants per action) and replaces with 4 explicit-action policies.
DROP POLICY IF EXISTS "appointments_admin_receptionist"  ON appointments;
DROP POLICY IF EXISTS "appointments_patient_own"         ON appointments;
DROP POLICY IF EXISTS "appointments_patient_insert"      ON appointments;
DROP POLICY IF EXISTS "appointments_patient_cancel"      ON appointments;
DROP POLICY IF EXISTS "appointments_professional_own"    ON appointments;
DROP POLICY IF EXISTS "appointments_professional_update" ON appointments;

-- SELECT: staff (full clinic access) | professional (own across clinics) | patient (own)
CREATE POLICY "appointments_select" ON appointments
  FOR SELECT
  USING (
    (current_user_role() IN ('admin', 'receptionist') AND clinic_id = current_user_clinic_id())
    OR (current_user_role() = 'professional'
        AND professional_id IN (
          SELECT id FROM professionals WHERE user_id = (SELECT auth.uid())
        ))
    OR (current_user_role() = 'patient'
        AND patient_id = (SELECT id FROM patients WHERE user_id = (SELECT auth.uid()) LIMIT 1))
  );

-- INSERT: staff | patient self-book (status must be 'scheduled')
CREATE POLICY "appointments_insert" ON appointments
  FOR INSERT
  WITH CHECK (
    (current_user_role() IN ('admin', 'receptionist') AND clinic_id = current_user_clinic_id())
    OR (current_user_role() = 'patient'
        AND clinic_id = current_user_clinic_id()
        AND patient_id = (SELECT id FROM patients WHERE user_id = (SELECT auth.uid()) LIMIT 1)
        AND status = 'scheduled')
  );

-- UPDATE: staff | professional (own) | patient cancel (only → 'cancelled', only future)
CREATE POLICY "appointments_update" ON appointments
  FOR UPDATE
  USING (
    (current_user_role() IN ('admin', 'receptionist') AND clinic_id = current_user_clinic_id())
    OR (current_user_role() = 'professional'
        AND professional_id IN (
          SELECT id FROM professionals WHERE user_id = (SELECT auth.uid())
        ))
    OR (current_user_role() = 'patient'
        AND patient_id = (SELECT id FROM patients WHERE user_id = (SELECT auth.uid()) LIMIT 1)
        AND starts_at > NOW())
  )
  WITH CHECK (
    (current_user_role() IN ('admin', 'receptionist') AND clinic_id = current_user_clinic_id())
    OR (current_user_role() = 'professional'
        AND professional_id IN (
          SELECT id FROM professionals WHERE user_id = (SELECT auth.uid())
        ))
    OR (current_user_role() = 'patient' AND status = 'cancelled')
  );

-- DELETE: staff only
CREATE POLICY "appointments_delete" ON appointments
  FOR DELETE
  USING (
    current_user_role() IN ('admin', 'receptionist')
    AND clinic_id = current_user_clinic_id()
  );


-- ════════════════════════════════════════════════════════════════
-- AVAILABILITY SLOTS
-- ════════════════════════════════════════════════════════════════
-- Drops FOR SELECT (bare auth.uid) and FOR ALL staff_write (overlaps SELECT),
-- replaces with 4 explicit-action policies.
DROP POLICY IF EXISTS "availability_slots_select"      ON availability_slots;
DROP POLICY IF EXISTS "availability_slots_staff_write" ON availability_slots;

-- Any clinic member (including patient) can see availability for booking
CREATE POLICY "availability_slots_select" ON availability_slots
  FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  );

CREATE POLICY "availability_slots_insert" ON availability_slots
  FOR INSERT
  WITH CHECK (
    clinic_id = current_user_clinic_id()
    AND current_user_role() IN ('admin', 'receptionist', 'professional')
  );

CREATE POLICY "availability_slots_update" ON availability_slots
  FOR UPDATE
  USING (
    clinic_id = current_user_clinic_id()
    AND current_user_role() IN ('admin', 'receptionist', 'professional')
  )
  WITH CHECK (
    clinic_id = current_user_clinic_id()
    AND current_user_role() IN ('admin', 'receptionist', 'professional')
  );

CREATE POLICY "availability_slots_delete" ON availability_slots
  FOR DELETE
  USING (
    clinic_id = current_user_clinic_id()
    AND current_user_role() IN ('admin', 'receptionist', 'professional')
  );


-- ════════════════════════════════════════════════════════════════
-- CLINIC INVITES
-- ════════════════════════════════════════════════════════════════
-- Drops 3 overlapping policies (two FOR ALL + one FOR SELECT) and replaces
-- with 4 explicit-action policies.  Also fixes bare auth.email().
DROP POLICY IF EXISTS "clinic_staff_invites" ON clinic_invites;
DROP POLICY IF EXISTS "invitee_read_own"     ON clinic_invites;
DROP POLICY IF EXISTS "super_admin_invites"  ON clinic_invites;

-- SELECT: staff (own clinic) | invitee (email match) | super admin
CREATE POLICY "clinic_invites_select" ON clinic_invites
  FOR SELECT
  USING (
    (current_user_role() IN ('admin', 'receptionist') AND clinic_id = current_user_clinic_id())
    OR ((SELECT auth.uid()) IS NOT NULL
        AND lower(email) = lower((SELECT auth.email()))
        AND used_at IS NULL)
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "clinic_invites_insert" ON clinic_invites
  FOR INSERT
  WITH CHECK (
    (current_user_role() IN ('admin', 'receptionist') AND clinic_id = current_user_clinic_id())
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "clinic_invites_update" ON clinic_invites
  FOR UPDATE
  USING (
    (current_user_role() IN ('admin', 'receptionist') AND clinic_id = current_user_clinic_id())
    OR public.current_user_is_super_admin()
  )
  WITH CHECK (
    (current_user_role() IN ('admin', 'receptionist') AND clinic_id = current_user_clinic_id())
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "clinic_invites_delete" ON clinic_invites
  FOR DELETE
  USING (
    (current_user_role() IN ('admin', 'receptionist') AND clinic_id = current_user_clinic_id())
    OR public.current_user_is_super_admin()
  );


-- ════════════════════════════════════════════════════════════════
-- CLINIC ROOMS  (auth_rls_initplan fix only — 4 individual policies)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "clinic_rooms_select" ON clinic_rooms;
DROP POLICY IF EXISTS "clinic_rooms_insert" ON clinic_rooms;
DROP POLICY IF EXISTS "clinic_rooms_update" ON clinic_rooms;
DROP POLICY IF EXISTS "clinic_rooms_delete" ON clinic_rooms;

CREATE POLICY "clinic_rooms_select" ON clinic_rooms
  FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "clinic_rooms_insert" ON clinic_rooms
  FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "clinic_rooms_update" ON clinic_rooms
  FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "clinic_rooms_delete" ON clinic_rooms
  FOR DELETE
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );


-- ════════════════════════════════════════════════════════════════
-- CLINIC SIGNUP REQUESTS
-- ════════════════════════════════════════════════════════════════
-- Original: "public can insert" (FOR INSERT) + "super admin manages" (FOR ALL)
-- → both fire for INSERT → multiple_permissive_policies on INSERT.
-- Fix: single FOR ALL policy where USING restricts SELECT/UPDATE/DELETE to
-- super admin and WITH CHECK (true) allows any INSERT (public onboarding form).
DROP POLICY IF EXISTS "public can insert signup request"    ON clinic_signup_requests;
DROP POLICY IF EXISTS "super admin manages signup requests" ON clinic_signup_requests;

CREATE POLICY "signup_requests_policy" ON clinic_signup_requests
  FOR ALL
  USING  (public.current_user_is_super_admin())
  WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- CLINICS
-- ════════════════════════════════════════════════════════════════
-- Drops 3 overlapping policies (two FOR ALL + one FOR SELECT) and replaces
-- with explicit-action policies.
DROP POLICY IF EXISTS "clinic_isolation"           ON clinics;
DROP POLICY IF EXISTS "authenticated_read_clinics" ON clinics;
DROP POLICY IF EXISTS "super_admin_clinics_all"    ON clinics;

-- Any authenticated user can read clinic names (needed for patient onboarding
-- before user_profiles exists).
CREATE POLICY "clinics_select" ON clinics
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

-- Only the clinic's own member (admin) or super admin can mutate the row.
CREATE POLICY "clinics_insert" ON clinics
  FOR INSERT
  WITH CHECK (
    id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "clinics_update" ON clinics
  FOR UPDATE
  USING (
    id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "clinics_delete" ON clinics
  FOR DELETE
  USING (
    id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );


-- ════════════════════════════════════════════════════════════════
-- NOTIFICATION LOG  (auth_rls_initplan fix)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "clinic staff can view their notification log" ON notification_log;

CREATE POLICY "clinic staff can view their notification log" ON notification_log
  FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  );


-- ════════════════════════════════════════════════════════════════
-- PATIENT RECORDS
-- ════════════════════════════════════════════════════════════════
-- Migration 0034 accidentally recreated a bare "clinic_isolation" policy on
-- patient_records AFTER migration 0020 had already properly replaced it with
-- the role-restricted "patient_records_staff" policy.
-- Drop the redundant clinic_isolation; patient_records_staff remains.
DROP POLICY IF EXISTS "clinic_isolation" ON patient_records;


-- ════════════════════════════════════════════════════════════════
-- PATIENTS
-- ════════════════════════════════════════════════════════════════
-- Drops FOR ALL (clinic_staff) which overlaps with FOR SELECT and FOR UPDATE
-- patient-specific policies, plus the bare-auth.uid() INSERT policy.
DROP POLICY IF EXISTS "patients_clinic_staff"  ON patients;
DROP POLICY IF EXISTS "patients_own_record"    ON patients;
DROP POLICY IF EXISTS "patients_own_update"    ON patients;
DROP POLICY IF EXISTS "patients_self_register" ON patients;

-- SELECT: staff (full clinic) | patient (own record)
CREATE POLICY "patients_select" ON patients
  FOR SELECT
  USING (
    (current_user_role() IN ('admin', 'receptionist', 'professional')
     AND clinic_id = current_user_clinic_id())
    OR (current_user_role() = 'patient' AND user_id = (SELECT auth.uid()))
  );

-- INSERT: staff | patient self-register (user_id = own uid, no role check needed
-- because user_profiles may not exist yet during onboarding)
CREATE POLICY "patients_insert" ON patients
  FOR INSERT
  WITH CHECK (
    (current_user_role() IN ('admin', 'receptionist', 'professional')
     AND clinic_id = current_user_clinic_id())
    OR user_id = (SELECT auth.uid())
  );

-- UPDATE: staff | patient (own record only)
CREATE POLICY "patients_update" ON patients
  FOR UPDATE
  USING (
    (current_user_role() IN ('admin', 'receptionist', 'professional')
     AND clinic_id = current_user_clinic_id())
    OR (current_user_role() = 'patient' AND user_id = (SELECT auth.uid()))
  );

-- DELETE: staff only
CREATE POLICY "patients_delete" ON patients
  FOR DELETE
  USING (
    current_user_role() IN ('admin', 'receptionist', 'professional')
    AND clinic_id = current_user_clinic_id()
  );


-- ════════════════════════════════════════════════════════════════
-- PROFESSIONALS
-- ════════════════════════════════════════════════════════════════
-- Drops FOR ALL (admin_write) which overlaps with two FOR SELECT policies.
-- Replaces with explicit per-action policies.
DROP POLICY IF EXISTS "professionals_clinic"      ON professionals;
DROP POLICY IF EXISTS "professionals_admin_write" ON professionals;
DROP POLICY IF EXISTS "professionals_own_record"  ON professionals;
DROP POLICY IF EXISTS "clinic_isolation"          ON professionals;  -- safety drop (removed in 0003)

-- SELECT: any clinic member can see professionals | professional sees own across clinics
CREATE POLICY "professionals_select" ON professionals
  FOR SELECT
  USING (
    clinic_id = current_user_clinic_id()
    OR user_id = (SELECT auth.uid())
  );

CREATE POLICY "professionals_insert" ON professionals
  FOR INSERT
  WITH CHECK (
    current_user_role() = 'admin' AND clinic_id = current_user_clinic_id()
  );

CREATE POLICY "professionals_update" ON professionals
  FOR UPDATE
  USING (
    current_user_role() = 'admin' AND clinic_id = current_user_clinic_id()
  )
  WITH CHECK (
    current_user_role() = 'admin' AND clinic_id = current_user_clinic_id()
  );

CREATE POLICY "professionals_delete" ON professionals
  FOR DELETE
  USING (
    current_user_role() = 'admin' AND clinic_id = current_user_clinic_id()
  );


-- ════════════════════════════════════════════════════════════════
-- SERVICE TYPES
-- ════════════════════════════════════════════════════════════════
-- Drop FOR ALL "clinic_isolation" (bare auth.uid) and redundant "patient_read"
-- SELECT (same logic, subsumed by clinic_isolation).
-- Replace with 4 explicit-action policies with fixed auth.uid().
DROP POLICY IF EXISTS "clinic_isolation" ON service_types;
DROP POLICY IF EXISTS "patient_read"     ON service_types;

-- Any clinic member (staff or patient) can read service types for booking.
CREATE POLICY "service_types_select" ON service_types
  FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  );

CREATE POLICY "service_types_insert" ON service_types
  FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  );

CREATE POLICY "service_types_update" ON service_types
  FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  )
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  );

CREATE POLICY "service_types_delete" ON service_types
  FOR DELETE
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  );


-- ════════════════════════════════════════════════════════════════
-- USER CLINIC MEMBERSHIPS
-- ════════════════════════════════════════════════════════════════
-- Drops 3 overlapping policies (two FOR ALL + one FOR SELECT), replaces
-- with 4 explicit-action policies.
DROP POLICY IF EXISTS "own_memberships_read"     ON user_clinic_memberships;
DROP POLICY IF EXISTS "clinic_admin_memberships" ON user_clinic_memberships;
DROP POLICY IF EXISTS "super_admin_memberships"  ON user_clinic_memberships;

-- SELECT: own memberships | clinic admin | super admin
CREATE POLICY "ucm_select" ON user_clinic_memberships
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR (current_user_role() = 'admin' AND clinic_id = current_user_clinic_id())
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "ucm_insert" ON user_clinic_memberships
  FOR INSERT
  WITH CHECK (
    (current_user_role() = 'admin' AND clinic_id = current_user_clinic_id())
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "ucm_update" ON user_clinic_memberships
  FOR UPDATE
  USING (
    (current_user_role() = 'admin' AND clinic_id = current_user_clinic_id())
    OR public.current_user_is_super_admin()
  )
  WITH CHECK (
    (current_user_role() = 'admin' AND clinic_id = current_user_clinic_id())
    OR public.current_user_is_super_admin()
  );

CREATE POLICY "ucm_delete" ON user_clinic_memberships
  FOR DELETE
  USING (
    (current_user_role() = 'admin' AND clinic_id = current_user_clinic_id())
    OR public.current_user_is_super_admin()
  );


-- ════════════════════════════════════════════════════════════════
-- USER PROFILES
-- ════════════════════════════════════════════════════════════════
-- Drops all 8 existing policies (for SELECT, UPDATE, DELETE includes those
-- already fixed in 0034) and the two bare-auth INSERT policies from 0020.
-- Consolidates into 4 explicit-action policies.
DROP POLICY IF EXISTS "own_profile_read"                  ON user_profiles;
DROP POLICY IF EXISTS "own_profile_update"                ON user_profiles;
DROP POLICY IF EXISTS "clinic_members_read"               ON user_profiles;
DROP POLICY IF EXISTS "clinic_admin_update_member"        ON user_profiles;
DROP POLICY IF EXISTS "clinic_admin_delete_member"        ON user_profiles;
DROP POLICY IF EXISTS "super_admin_profiles_all"          ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_patient_self_create" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_invite_create"       ON user_profiles;

-- SELECT: own profile | clinic staff see members | super admin
CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT
  USING (
    id = (SELECT auth.uid())
    OR (clinic_id IS NOT NULL
        AND clinic_id = current_user_clinic_id()
        AND current_user_role() IN ('admin', 'receptionist', 'professional'))
    OR public.current_user_is_super_admin()
  );

-- INSERT:
--   • Patient self-onboarding: creates their own profile with role='patient'
--   • Staff invite acceptance: id = own uid + valid pending invite in clinic_invites
--   • Super admin: unrestricted
CREATE POLICY "user_profiles_insert" ON user_profiles
  FOR INSERT
  WITH CHECK (
    (id = (SELECT auth.uid())
     AND NOT is_super_admin
     AND roles = ARRAY['patient']::user_role[])
    OR (id = (SELECT auth.uid())
        AND NOT is_super_admin
        AND EXISTS (
          SELECT 1
          FROM   public.clinic_invites ci
          WHERE  ci.clinic_id = clinic_id
            AND  lower(ci.email) = lower((SELECT auth.email()))
            AND  ci.used_at IS NULL
        ))
    OR public.current_user_is_super_admin()
  );

-- UPDATE: own profile | clinic admin updates other members | super admin
CREATE POLICY "user_profiles_update" ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (id != (SELECT auth.uid())
        AND clinic_id = current_user_clinic_id()
        AND current_user_role() = 'admin')
    OR public.current_user_is_super_admin()
  );

-- DELETE: clinic admin removes other members | super admin (cannot delete self)
CREATE POLICY "user_profiles_delete" ON user_profiles
  FOR DELETE
  TO authenticated
  USING (
    (id != (SELECT auth.uid())
     AND clinic_id = current_user_clinic_id()
     AND current_user_role() = 'admin')
    OR public.current_user_is_super_admin()
  );


-- ════════════════════════════════════════════════════════════════
-- WHATSAPP FAQS  (auth_rls_initplan fix)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "clinic_isolation" ON public.whatsapp_faqs;

CREATE POLICY "clinic_isolation" ON public.whatsapp_faqs
  FOR ALL
  USING (
    clinic_id = (SELECT clinic_id FROM public.user_profiles WHERE id = (SELECT auth.uid()))
  )
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM public.user_profiles WHERE id = (SELECT auth.uid()))
  );


-- ════════════════════════════════════════════════════════════════
-- WHATSAPP MESSAGES  (auth_rls_initplan fix)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "clinic staff can view their messages"    ON whatsapp_messages;
DROP POLICY IF EXISTS "attendants can insert outbound messages" ON whatsapp_messages;

CREATE POLICY "clinic staff can view their messages" ON whatsapp_messages
  FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  );

CREATE POLICY "attendants can insert outbound messages" ON whatsapp_messages
  FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    AND direction = 'outbound'
    AND sent_by = 'attendant'
  );


-- ════════════════════════════════════════════════════════════════
-- WHATSAPP SESSIONS  (auth_rls_initplan fix)
-- ════════════════════════════════════════════════════════════════
-- Also drops the live-only "attendants can manage sessions" policy (if it
-- exists from manual creation) since the two explicit policies below cover
-- the access patterns it was meant to provide.
DROP POLICY IF EXISTS "clinic staff can view their sessions"   ON whatsapp_sessions;
DROP POLICY IF EXISTS "clinic staff can update their sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "attendants can manage sessions"         ON whatsapp_sessions;

CREATE POLICY "clinic staff can view their sessions" ON whatsapp_sessions
  FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  );

CREATE POLICY "clinic staff can update their sessions" ON whatsapp_sessions
  FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  )
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  );


-- ════════════════════════════════════════════════════════════════
-- WHATSAPP TEMPLATES  (auth_rls_initplan fix)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "clinic staff can manage their templates" ON whatsapp_templates;

CREATE POLICY "clinic staff can manage their templates" ON whatsapp_templates
  FOR ALL
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  )
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  );
