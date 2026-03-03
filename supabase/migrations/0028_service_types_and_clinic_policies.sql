-- Migration: 0028_service_types_and_clinic_policies
-- Adds: service_types table, appointments.service_type_id,
--       clinic settings for patient registration + payment policies

-- ─── Service Types (appointment types with price, duration, color) ────────────
CREATE TABLE IF NOT EXISTS service_types (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id        UUID NOT NULL REFERENCES clinics ON DELETE CASCADE,
  name             TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  price_cents      INTEGER,          -- null = no fixed price / define at booking
  color            TEXT NOT NULL DEFAULT '#3b82f6',
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation" ON service_types
  FOR ALL USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid())
  );

-- Allow patient role to read service_types for their clinic (for booking)
CREATE POLICY "patient_read" ON service_types
  FOR SELECT USING (
    clinic_id = (
      SELECT p.clinic_id FROM user_profiles p
      WHERE p.id = auth.uid()
    )
  );

-- ─── Appointments: add service_type_id ──────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS service_type_id UUID REFERENCES service_types ON DELETE SET NULL;

-- ─── Clinic: patient registration + payment policy settings ─────────────────
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS allow_self_registration    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS accepted_payment_methods   TEXT[]  NOT NULL DEFAULT ARRAY['cash','pix','credit_card','debit_card'],
  ADD COLUMN IF NOT EXISTS payment_timing             TEXT    NOT NULL DEFAULT 'flexible',   -- 'before_appointment' | 'after_appointment' | 'flexible'
  ADD COLUMN IF NOT EXISTS cancellation_hours         INTEGER NOT NULL DEFAULT 24;           -- hours before appt that patient can cancel (0 = always, -1 = never)
