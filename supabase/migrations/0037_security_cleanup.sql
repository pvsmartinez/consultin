-- Migration: 0037_security_cleanup
-- ════════════════════════════════════════════════════════════════
-- Fixes two remaining Supabase linter security warnings:
--
--  rls_policy_always_true (lint 0024):
--    Drop the anon INSERT policy on clinic_signup_requests.
--    Inserts are now handled exclusively by the submit-clinic-signup
--    Edge Function which uses the service role (bypasses RLS entirely).
--
--  extension_in_public (lint 0014):
--    Move btree_gist from the public schema to the extensions schema.
--    btree_gist adds GiST operator support for scalar types, used by the
--    appointments.no_overlap exclusion constraint.
--    The extensions schema is always in the Supabase search_path so all
--    existing constraints and queries continue to work unchanged.
-- ════════════════════════════════════════════════════════════════


-- ─── clinic_signup_requests: remove anon INSERT policy ───────────────────────
-- The submit-clinic-signup Edge Function now handles all public submissions
-- using the service role, so no RLS INSERT policy is needed for anon.
DROP POLICY IF EXISTS "signup_requests_anon_insert" ON public.clinic_signup_requests;


-- ─── btree_gist: move to extensions schema ───────────────────────────────────
-- ALTER EXTENSION requires superuser; Supabase runs migrations as the postgres
-- role which has superuser privileges on hosted projects.
ALTER EXTENSION btree_gist SET SCHEMA extensions;
