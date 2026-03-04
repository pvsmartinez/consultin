-- Migration: 0036_fix_function_search_paths
-- ════════════════════════════════════════════════════════════════
-- Fixes two Supabase linter security warnings:
--
--  function_search_path_mutable (lint 0011):
--    When a function has no SET search_path, an attacker who can create
--    objects in a schema earlier in search_path could shadow trusted objects.
--    Fix: add SET search_path = '' so all references must be fully qualified.
--    Affected: set_updated_at, check_room_overlap, current_user_role,
--              _normalise_cpf, current_user_has_role
--
--  rls_policy_always_true (lint 0024):
--    clinic_signup_requests INSERT policy WITH CHECK (true) allowed both
--    anonymous and authenticated users to insert unrestricted rows.
--    Fix: restrict the policy to anon role only (public lead form intent)
--    and give authenticated super-admin its own explicit policy.
-- ════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- FUNCTION: set_updated_at
-- ════════════════════════════════════════════════════════════════
-- Trigger function — no external schema references, just needs a fixed path.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


-- ════════════════════════════════════════════════════════════════
-- FUNCTION: check_room_overlap
-- ════════════════════════════════════════════════════════════════
-- Qualify the `appointments` reference with `public.` since search_path is locked.
CREATE OR REPLACE FUNCTION public.check_room_overlap()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.room_id IS NOT NULL
     AND NEW.status NOT IN ('cancelled', 'no_show')
     AND EXISTS (
       SELECT 1 FROM public.appointments
       WHERE  room_id  = NEW.room_id
         AND  id      != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
         AND  status NOT IN ('cancelled', 'no_show')
         AND  tstzrange(starts_at, ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
     )
  THEN
    RAISE EXCEPTION 'room_overlap';
  END IF;
  RETURN NEW;
END;
$$;


-- ════════════════════════════════════════════════════════════════
-- FUNCTION: current_user_role
-- ════════════════════════════════════════════════════════════════
-- Returns the highest-privilege role from the user's roles array.
-- Qualifies user_profiles with public. now that search_path is fixed.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN 'admin'        = ANY(roles) THEN 'admin'::public.user_role
    WHEN 'receptionist' = ANY(roles) THEN 'receptionist'::public.user_role
    WHEN 'professional' = ANY(roles) THEN 'professional'::public.user_role
    ELSE 'patient'::public.user_role
  END
  FROM public.user_profiles
  WHERE id = auth.uid()
$$;


-- ════════════════════════════════════════════════════════════════
-- FUNCTION: _normalise_cpf
-- ════════════════════════════════════════════════════════════════
-- Pure SQL function, no schema references — just add search_path.
CREATE OR REPLACE FUNCTION public._normalise_cpf(raw TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(raw, '[^0-9]', '', 'g');
$$;


-- ════════════════════════════════════════════════════════════════
-- FUNCTION: current_user_has_role
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.current_user_has_role(r public.user_role)
RETURNS boolean LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r = ANY(roles)
  FROM   public.user_profiles
  WHERE  id = auth.uid()
$$;


-- ════════════════════════════════════════════════════════════════
-- clinic_signup_requests: tighten INSERT policy
-- ════════════════════════════════════════════════════════════════
-- The prior policy (created in 0035) allowed both anon and authenticated users
-- to INSERT with WITH CHECK (true), triggering the rls_policy_always_true lint.
-- Fix: give anon its own INSERT-only policy (public lead form can't have a
-- stronger check since there is no auth context), and restrict the super-admin
-- policy to authenticated only with a real USING + WITH CHECK.
DROP POLICY IF EXISTS "signup_requests_policy" ON public.clinic_signup_requests;

-- Anonymous users submit clinic signup requests via the public landing form.
-- There is no auth context available so WITH CHECK (true) is intentional and
-- required. Table-level NOT NULL constraints enforce data quality.
CREATE POLICY "signup_requests_anon_insert" ON public.clinic_signup_requests
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Super admin can read, update, and delete all signup requests.
CREATE POLICY "signup_requests_super_admin" ON public.clinic_signup_requests
  FOR ALL
  TO authenticated
  USING  (public.current_user_is_super_admin())
  WITH CHECK (public.current_user_is_super_admin());
