-- Fix: mark current_user_is_super_admin() as STABLE so PostgreSQL can cache
-- the result within a single query instead of re-executing the subquery for
-- every row evaluated by RLS policies. This eliminates the N×subquery overhead
-- that caused the /admin clinics tab to take 20-60s to load.

CREATE OR REPLACE FUNCTION public.current_user_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM user_profiles WHERE id = auth.uid()),
    FALSE
  )
$$;
