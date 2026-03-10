-- Migration: 0039_perf_professionals_email_index
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- useMyProfessionalRecords has a fallback lookup that filters by email
-- using PostgREST's .ilike('email', value) — which compiles to
-- `email ILIKE $1` with an exact (non-wildcard) value.
--
-- A functional index on lower(email) lets Postgres use an index scan
-- instead of a sequential scan, which matters as the professionals table grows.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_professionals_email_lower
  ON public.professionals (lower(email))
  WHERE email IS NOT NULL;
