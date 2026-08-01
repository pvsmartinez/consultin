-- Migration: 20260801100000_fix_rpc_cross_tenant_upserts
-- ════════════════════════════════════════════════════════════════
-- Fixes an authorization gap (multi-tenant data breach) in two SECURITY
-- DEFINER RPCs that are invoked by the frontend with client-supplied
-- clinic_id / professional_id / room_id:
--
--   upsert_availability_slots          (professional weekly availability)
--   upsert_room_availability_slots     (room weekly availability)
--
-- Both accepted arbitrary ids and did DELETE + INSERT without verifying the
-- caller belonged to the target clinic. Any authenticated user could wipe or
-- rewrite the schedule of any professional/room in any clinic.
--
-- Fix: derive the clinic from the caller (current_user_clinic_id), validate
-- that the professional / room belong to that clinic, and refuse otherwise.
-- The incoming p_clinic_id must match the caller's clinic.
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
DECLARE
  v_caller_clinic_id uuid;
  v_room_ok          boolean;
BEGIN
  v_caller_clinic_id := public.current_user_clinic_id();

  IF v_caller_clinic_id IS NULL THEN
    RAISE EXCEPTION 'no clinic for caller';
  END IF;

  IF p_clinic_id IS DISTINCT FROM v_caller_clinic_id THEN
    RAISE EXCEPTION 'clinic does not match caller';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.professionals
    WHERE id = p_professional_id AND clinic_id = v_caller_clinic_id
  ) THEN
    RAISE EXCEPTION 'professional not found in caller clinic';
  END IF;

  -- Any room referenced by a slot must belong to the caller's clinic.
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_slots) AS slot
    WHERE NULLIF(slot->>'room_id', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.clinic_rooms cr
        WHERE cr.id = NULLIF(slot->>'room_id', '')::uuid
          AND cr.clinic_id = v_caller_clinic_id
      )
  ) INTO v_room_ok;

  IF NOT v_room_ok THEN
    RAISE EXCEPTION 'room not found in caller clinic';
  END IF;

  DELETE FROM public.availability_slots
  WHERE professional_id = p_professional_id;

  IF jsonb_array_length(p_slots) > 0 THEN
    INSERT INTO public.availability_slots
      (clinic_id, professional_id, weekday, start_time, end_time, active, room_id, week_parity)
    SELECT
      v_caller_clinic_id,
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
DECLARE
  v_caller_clinic_id uuid;
BEGIN
  v_caller_clinic_id := public.current_user_clinic_id();

  IF v_caller_clinic_id IS NULL THEN
    RAISE EXCEPTION 'no clinic for caller';
  END IF;

  IF p_clinic_id IS DISTINCT FROM v_caller_clinic_id THEN
    RAISE EXCEPTION 'clinic does not match caller';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_rooms
    WHERE id = p_room_id AND clinic_id = v_caller_clinic_id
  ) THEN
    RAISE EXCEPTION 'room not found in caller clinic';
  END IF;

  DELETE FROM public.room_availability_slots WHERE room_id = p_room_id;

  IF jsonb_array_length(p_slots) > 0 THEN
    INSERT INTO public.room_availability_slots
      (clinic_id, room_id, weekday, start_time, end_time, active, week_parity)
    SELECT
      v_caller_clinic_id,
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
