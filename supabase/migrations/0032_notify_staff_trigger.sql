-- ────────────────────────────────────────────────────────────────────────────
-- Migration: 0032_notify_staff_trigger
--
-- Adds a Postgres AFTER trigger on `appointments` that fires on INSERT and on
-- status changes (→ cancelled, → no_show).  The trigger calls the
-- `whatsapp-notify-staff` edge function asynchronously via pg_net, which then
-- dispatches WhatsApp text messages to staff members who opted-in in their
-- personal notification settings (user_profiles.notif_* columns added in 0031).
--
-- Runtime config (URL + service role key) is stored in notify_staff_config.
-- After applying this migration, run:
--   bash scripts/seed-notify-staff-config.sh
-- (reads from app/.env and upserts into notify_staff_config — never committed)
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. Ensure pg_net extension is available (Supabase keeps it in the net schema) ─
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 2. Config table (values seeded by scripts/seed-notify-staff-config.sh) ──
CREATE TABLE IF NOT EXISTS notify_staff_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- RLS: block all direct access (only SECURITY DEFINER functions can read it)
ALTER TABLE notify_staff_config ENABLE ROW LEVEL SECURITY;

-- ── 3. Trigger function ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_staff_on_appointment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type    TEXT;
  v_supabase_url  TEXT;
  v_srk           TEXT;
BEGIN
  -- Determine which event fired
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'new_appointment';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('cancelled', 'canceled')
       AND (OLD.status IS NULL OR OLD.status NOT IN ('cancelled', 'canceled')) THEN
      v_event_type := 'cancellation';
    ELSIF NEW.status = 'no_show' AND (OLD.status IS NULL OR OLD.status != 'no_show') THEN
      v_event_type := 'no_show';
    ELSE
      -- No relevant status change — nothing to notify
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Read runtime config from notify_staff_config table
  SELECT value INTO v_supabase_url FROM notify_staff_config WHERE key = 'supabase_url';
  SELECT value INTO v_srk          FROM notify_staff_config WHERE key = 'service_role_key';

  -- Skip silently if not configured yet (won't crash the transaction)
  IF v_supabase_url IS NULL OR v_srk IS NULL THEN
    RAISE WARNING '[notify_staff_trigger] config not found in notify_staff_config — run seed-notify-staff-config.sh';
    RETURN NEW;
  END IF;

  -- Fire async HTTP POST (pg_net — non-blocking, won't fail the main transaction)
  PERFORM net.http_post(
    url     := v_supabase_url || '/functions/v1/whatsapp-notify-staff',
    body    := json_build_object(
                 'clinicId',       NEW.clinic_id,
                 'eventType',      v_event_type,
                 'appointmentId',  NEW.id
               )::jsonb,
    headers := json_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_srk
               )::jsonb
  );

  RETURN NEW;
END;
$$;

-- ── 4. Trigger on appointments ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS appointment_staff_notify ON appointments;

CREATE TRIGGER appointment_staff_notify
  AFTER INSERT OR UPDATE OF status
  ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION notify_staff_on_appointment_change();

-- ── 5. Comment ────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION notify_staff_on_appointment_change() IS
  'Fires whatsapp-notify-staff edge function on new appointments and status changes (cancellation, no_show). '
  'Reads connection config from notify_staff_config table (seeded by seed-notify-staff-config.sh).';
