-- Migration: 0054_security_fixes
-- ════════════════════════════════════════════════════════════════
-- Fix 1: prof_bank_select — restore role restriction lost in 0034
--   Migration 0034 removed the role check from prof_bank_select to fix an
--   auth_rls_initplan warning, but it inadvertently allowed patients to read
--   professional bank account data (any clinic member could SELECT).
--   This restores the role guard: only admin/receptionist/professional can read.
--
-- Fix 2: get_user_id_by_email RPC helper
--   Safe email→userId lookup for the whatsapp-otp edge function, replacing
--   the auth.admin.listUsers({ perPage: 1000 }) call that would silently miss
--   users beyond the first 1000 and is slow at scale.
-- ════════════════════════════════════════════════════════════════


-- ─── Fix 1: pro_bank_select — add role restriction back ──────────────────────
-- The regression was introduced in 0034 while fixing an auth_rls_initplan lint
-- warning. The new policy keeps the (select auth.uid()) wrapper but re-adds
-- the role check so patients cannot read bank account data.
DROP POLICY IF EXISTS "prof_bank_select" ON public.professional_bank_accounts;

CREATE POLICY "prof_bank_select" ON public.professional_bank_accounts
  FOR SELECT USING (
    (
      clinic_id = (SELECT clinic_id FROM public.user_profiles WHERE id = (SELECT auth.uid()))
      AND public.current_user_role() IN ('admin', 'receptionist', 'professional')
    )
    OR public.current_user_is_super_admin()
  );


-- ─── Fix 2: get_user_id_by_email RPC helper ──────────────────────────────────
-- Used by the whatsapp-otp edge function to resolve an email to a Supabase
-- user id without paginating the full auth users list.
-- SECURITY DEFINER + fixed search_path: executes as postgres but safely
-- qualified. Only callable via service_role (which edge functions use).
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

-- Only service_role needs to call this; revoke from anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
