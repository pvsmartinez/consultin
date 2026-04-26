-- Migration: 0066_fix_generate_clinic_join_code
-- ════════════════════════════════════════════════════════════════
-- Fixes two Supabase lint warnings in generate_clinic_join_code:
--   "auto variable 'i' shadows a previously defined variable"
--   "unused variable 'i'"
--
-- PL/pgSQL FOR-loop automatically declares the loop variable — the
-- explicit `i INT` in the DECLARE block was redundant and caused the
-- shadowing warning. Removing it silences both warnings.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_clinic_join_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  TEXT := '';
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN code;
END;
$$;
