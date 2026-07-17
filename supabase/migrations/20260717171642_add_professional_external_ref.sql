-- Stable source identifier for idempotent professional migration and appointment mapping.
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_clinic_external_ref
  ON public.professionals (clinic_id, external_ref)
  WHERE external_ref IS NOT NULL;

COMMENT ON COLUMN public.professionals.external_ref IS
  'Stable identifier from the source system, scoped to the clinic; used for idempotent migrations.';
