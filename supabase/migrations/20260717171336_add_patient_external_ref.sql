-- Stable source identifier for idempotent patient migrations and reconciliation.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_clinic_external_ref
  ON public.patients (clinic_id, external_ref)
  WHERE external_ref IS NOT NULL;

COMMENT ON COLUMN public.patients.external_ref IS
  'Stable identifier from the source system, scoped to the clinic; used for idempotent migrations.';
