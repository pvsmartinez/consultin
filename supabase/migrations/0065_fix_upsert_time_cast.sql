-- Migration: 0065_fix_upsert_time_cast
-- ════════════════════════════════════════════════════════════════
-- Fixes two Supabase lint errors (plpgsql type mismatch):
--   upsert_availability_slots      — start_time/end_time: text → time
--   upsert_room_availability_slots — start_time/end_time: text → time
--
-- The implicit text→time coercion works at runtime but the Supabase linter
-- flags it as an error (sqlState 42804). Adding explicit ::time casts
-- silences the warning and makes intent clear.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.upsert_availability_slots(
  p_professional_id uuid,
  p_clinic_id       uuid,
  p_slots           jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.availability_slots
  WHERE professional_id = p_professional_id;

  IF jsonb_array_length(p_slots) > 0 THEN
    INSERT INTO public.availability_slots
      (clinic_id, professional_id, weekday, start_time, end_time, active, room_id, week_parity)
    SELECT
      p_clinic_id,
      p_professional_id,
      (slot->>'weekday')::integer,
      (slot->>'start_time')::time,
      (slot->>'end_time')::time,
      COALESCE((slot->>'active')::boolean, true),
      NULLIF(slot->>'room_id', '')::uuid,
      NULLIF(slot->>'week_parity', '')
    FROM jsonb_array_elements(p_slots) AS slot;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_availability_slots(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_availability_slots(uuid, uuid, jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.upsert_room_availability_slots(
  p_room_id   uuid,
  p_clinic_id uuid,
  p_slots     jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.room_availability_slots WHERE room_id = p_room_id;

  IF jsonb_array_length(p_slots) > 0 THEN
    INSERT INTO public.room_availability_slots
      (clinic_id, room_id, weekday, start_time, end_time, active, week_parity)
    SELECT
      p_clinic_id,
      p_room_id,
      (slot->>'weekday')::smallint,
      (slot->>'start_time')::time,
      (slot->>'end_time')::time,
      COALESCE((slot->>'active')::boolean, true),
      NULLIF(slot->>'week_parity', '')
    FROM jsonb_array_elements(p_slots) AS slot;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_room_availability_slots(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_room_availability_slots(uuid, uuid, jsonb) TO authenticated;
