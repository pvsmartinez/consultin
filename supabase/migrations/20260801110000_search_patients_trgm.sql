-- Migration: 20260801110000_search_patients_trgm
-- ════════════════════════════════════════════════════════════════
-- Perf fix for patient search.
--
-- search_patients (migration 20260717100000) matches substrings:
--   normalize_patient_search(p.name) LIKE '%' || query || '%'
--   ... digits LIKE '%' || digits || '%'
-- A leading wildcard makes the existing btree expression indexes useless,
-- so every keystroke falls back to a per-clinic sequential scan.
--
-- Fix: enable pg_trgm and add GIN trigram indexes over the same normalized
-- expressions — GIN (gin_trgm_ops) supports substring LIKE patterns.
-- The btree indexes are kept (they still narrow by clinic_id).
-- ════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_patients_name_trgm
  ON public.patients USING GIN (public.normalize_patient_search(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_cpf_digits_trgm
  ON public.patients USING GIN ((regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_phone_digits_trgm
  ON public.patients USING GIN ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) gin_trgm_ops);
