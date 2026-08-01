-- Migration: 20260801120000_appointments_patient_id_index
-- ════════════════════════════════════════════════════════════════
-- appointments only indexed (clinic_id, starts_at) and (professional_id,
-- starts_at). Patient-scoped lookups (patient portal history, appointment
-- modal "patient history", delete checks) do sequential scans on the
-- biggest table in the app.
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_patient_starts
  ON public.appointments (clinic_id, patient_id, starts_at);
