-- ─────────────────────────────────────────────────────────────────────────────
-- 0029: Sala e frequência quinzenal na disponibilidade dos profissionais
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Adds two columns to availability_slots:
--   room_id      → qual sala o profissional ocupa nesse bloco
--   week_parity  → 'even' | 'odd' | NULL (NULL = toda semana)
--
-- Also replaces the upsert_availability_slots RPC to pass these new fields.

ALTER TABLE public.availability_slots
  ADD COLUMN IF NOT EXISTS room_id     UUID REFERENCES public.clinic_rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS week_parity TEXT CHECK (week_parity IN ('even', 'odd'));

-- ── Updated upsert RPC ───────────────────────────────────────────────────────
-- p_slots now accepts: { weekday, start_time, end_time, active, room_id?, week_parity? }
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
      slot->>'start_time',
      slot->>'end_time',
      COALESCE((slot->>'active')::boolean, true),
      NULLIF(slot->>'room_id', '')::uuid,
      NULLIF(slot->>'week_parity', '')
    FROM jsonb_array_elements(p_slots) AS slot;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_availability_slots(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_availability_slots(uuid, uuid, jsonb) TO authenticated;
