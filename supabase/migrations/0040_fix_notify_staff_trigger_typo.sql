-- Migration: 0040_fix_notify_staff_trigger_typo
-- ════════════════════════════════════════════════════════════════
-- Fixes a typo in notify_staff_on_appointment_change() that caused
-- ALL appointment status updates to fail with:
--   "invalid input value for enum appointment_status: \"canceled\""
--
-- Root cause: the trigger compared NEW.status IN ('cancelled', 'canceled').
-- 'canceled' (one 'l') is not a valid appointment_status enum value.
-- PostgreSQL performs an implicit cast of each IN list element to the enum
-- type and throws when it encounters an unknown literal.
--
-- Fix: remove 'canceled' — the only valid enum value is 'cancelled'.
-- ════════════════════════════════════════════════════════════════

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
    IF NEW.status = 'cancelled'
       AND (OLD.status IS NULL OR OLD.status != 'cancelled') THEN
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
