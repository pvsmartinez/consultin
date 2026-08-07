-- Migration: 0001_initial_schema
-- Run: python3 scripts/migrate.py consultin --apply (da raiz do workspace)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Clinics ─────────────────────────────────────────────────────────────────
CREATE TABLE clinics (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  cnpj         TEXT UNIQUE,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  city         TEXT,
  state        CHAR(2),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── User profiles (linked to Supabase Auth) ─────────────────────────────────
CREATE TYPE user_role AS ENUM ('admin', 'receptionist', 'professional');

CREATE TABLE user_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  clinic_id  UUID NOT NULL REFERENCES clinics ON DELETE CASCADE,
  role       user_role NOT NULL DEFAULT 'receptionist',
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Professionals ────────────────────────────────────────────────────────────
CREATE TABLE professionals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id   UUID NOT NULL REFERENCES clinics ON DELETE CASCADE,
  name        TEXT NOT NULL,
  specialty   TEXT,
  council_id  TEXT,  -- CRM / CRO / CREFITO etc.
  phone       TEXT,
  email       TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Patients ─────────────────────────────────────────────────────────────────
CREATE TABLE patients (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id   UUID NOT NULL REFERENCES clinics ON DELETE CASCADE,
  name        TEXT NOT NULL,
  cpf         TEXT,
  birth_date  DATE,
  phone       TEXT,
  email       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, cpf)
);

-- ─── Appointments ─────────────────────────────────────────────────────────────
CREATE TYPE appointment_status AS ENUM (
  'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'
);

CREATE TABLE appointments (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id            UUID NOT NULL REFERENCES clinics ON DELETE CASCADE,
  patient_id           UUID NOT NULL REFERENCES patients ON DELETE RESTRICT,
  professional_id      UUID NOT NULL REFERENCES professionals ON DELETE RESTRICT,
  starts_at            TIMESTAMPTZ NOT NULL,
  ends_at              TIMESTAMPTZ NOT NULL,
  status               appointment_status NOT NULL DEFAULT 'scheduled',
  notes                TEXT,
  charge_amount_cents  INTEGER,   -- valor cobrado em centavos
  paid_amount_cents    INTEGER,   -- valor pago em centavos
  paid_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_overlap EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'no_show'))
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE clinics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments   ENABLE ROW LEVEL SECURITY;

-- Users can only see data from their own clinic
CREATE POLICY "clinic_isolation" ON clinics
  FOR ALL USING (id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "clinic_isolation" ON professionals
  FOR ALL USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "clinic_isolation" ON patients
  FOR ALL USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "clinic_isolation" ON appointments
  FOR ALL USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
-- Migration: 0002_patient_full_fields
-- Adds full patient demographics, flexible custom_fields,
-- and clinic scheduling configuration.

-- ─── Patients: full demographics ─────────────────────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS rg                  TEXT,
  ADD COLUMN IF NOT EXISTS sex                 CHAR(1) CHECK (sex IN ('M','F','O')),
  ADD COLUMN IF NOT EXISTS address_street      TEXT,
  ADD COLUMN IF NOT EXISTS address_number      TEXT,
  ADD COLUMN IF NOT EXISTS address_complement  TEXT,
  ADD COLUMN IF NOT EXISTS address_neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS address_city        TEXT,
  ADD COLUMN IF NOT EXISTS address_state       CHAR(2),
  ADD COLUMN IF NOT EXISTS address_zip         TEXT,   -- CEP: 00000-000
  -- Flexible extra fields defined per-clinic (e.g. "convenio", "alergias")
  ADD COLUMN IF NOT EXISTS custom_fields       JSONB NOT NULL DEFAULT '{}';

-- ─── Clinics: scheduling configuration ───────────────────────────────────────
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
  -- working_hours example:
  -- {"mon":{"start":"08:00","end":"18:00"},"tue":{"start":"08:00","end":"18:00"},...}
  ADD COLUMN IF NOT EXISTS working_hours         JSONB NOT NULL DEFAULT '{}',
  -- custom_patient_fields: defines extra fields clinics want on the patient form
  -- [{"key":"convenio","label":"Convênio","type":"text","required":false}, ...]
  ADD COLUMN IF NOT EXISTS custom_patient_fields JSONB NOT NULL DEFAULT '[]';

-- ─── Time Slots: reusable availability blocks per professional ────────────────
-- An appointment always occupies one or more availability slots.
-- This table is optional — clinics that don't pre-configure slots
-- can still create appointments directly.
CREATE TABLE IF NOT EXISTS availability_slots (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id        UUID NOT NULL REFERENCES clinics ON DELETE CASCADE,
  professional_id  UUID NOT NULL REFERENCES professionals ON DELETE CASCADE,
  weekday          SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sun 6=Sat
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinic_isolation" ON availability_slots
  FOR ALL USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

-- ─── Index helpers ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_patients_clinic     ON patients (clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_cpf        ON patients (cpf);
CREATE INDEX IF NOT EXISTS idx_appointments_date   ON appointments (clinic_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_prof   ON appointments (professional_id, starts_at);
-- Migration: 0003_auth_roles
-- Adds 'patient' role, links auth users to patient records,
-- and sets up RLS policies for each role.

-- ─── Extend user_role enum ────────────────────────────────────────────────────
-- 'professional' = médico/dentista/especialista
-- 'patient'      = paciente (acesso próprio via app)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'patient';

-- ─── Link patient record to auth user ────────────────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_user_id ON patients (user_id) WHERE user_id IS NOT NULL;

-- ─── RLS: user_profiles — each user reads their own profile ──────────────────
CREATE POLICY IF NOT EXISTS "own_profile_read" ON user_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY IF NOT EXISTS "own_profile_update" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- ─── Helper function: get current user's role ────────────────────────────────
CREATE OR REPLACE FUNCTION auth.user_role() RETURNS user_role AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ─── Helper function: get current user's clinic_id ───────────────────────────
CREATE OR REPLACE FUNCTION auth.user_clinic_id() RETURNS UUID AS $$
  SELECT clinic_id FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ─── Appointments: patients can only see their own ───────────────────────────
-- Drop old generic policy if it exists, then create role-specific ones
DROP POLICY IF EXISTS "clinic_isolation" ON appointments;

CREATE POLICY "appointments_clinic_staff" ON appointments
  FOR ALL
  USING (
    auth.user_role() IN ('admin', 'receptionist', 'professional')
    AND clinic_id = auth.user_clinic_id()
  );

CREATE POLICY "appointments_patient_own" ON appointments
  FOR SELECT
  USING (
    auth.user_role() = 'patient'
    AND patient_id = (SELECT id FROM patients WHERE user_id = auth.uid() LIMIT 1)
  );

-- ─── Patients: patients can read/update only their own record ─────────────────
DROP POLICY IF EXISTS "clinic_isolation" ON patients;

CREATE POLICY "patients_clinic_staff" ON patients
  FOR ALL
  USING (
    auth.user_role() IN ('admin', 'receptionist', 'professional')
    AND clinic_id = auth.user_clinic_id()
  );

CREATE POLICY "patients_own_record" ON patients
  FOR SELECT
  USING (
    auth.user_role() = 'patient'
    AND user_id = auth.uid()
  );

CREATE POLICY "patients_own_update" ON patients
  FOR UPDATE
  USING (
    auth.user_role() = 'patient'
    AND user_id = auth.uid()
  );

-- ─── Professionals: visible to all authenticated users of the clinic ──────────
DROP POLICY IF EXISTS "clinic_isolation" ON professionals;

CREATE POLICY "professionals_clinic" ON professionals
  FOR SELECT
  USING (clinic_id = auth.user_clinic_id());

CREATE POLICY "professionals_admin_write" ON professionals
  FOR ALL
  USING (
    auth.user_role() = 'admin'
    AND clinic_id = auth.user_clinic_id()
  );
