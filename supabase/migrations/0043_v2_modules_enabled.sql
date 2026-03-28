-- v2 UI: add modules_enabled column to clinics
-- Each module key: 'rooms', 'staff', 'whatsapp', 'financial'
-- Patients module is always active and not stored here.
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS modules_enabled text[] NOT NULL DEFAULT '{}';

-- Grant access to authenticated role (same as other clinic columns)
COMMENT ON COLUMN clinics.modules_enabled IS
  'Active feature modules for this clinic. Values: rooms, staff, whatsapp, financial';
