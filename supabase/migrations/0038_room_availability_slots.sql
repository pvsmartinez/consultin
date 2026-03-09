-- ─────────────────────────────────────────────────────────────────────────────
-- 0038: Disponibilidade por sala (room_availability_slots)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Each clinic_room can now have its own weekly schedule independent of the
-- global clinic working-hours. The agenda shades each room column according to
-- its own availability windows instead of the single clinic-wide block.
--
-- Schema mirrors availability_slots (professional) with room_id instead of
-- professional_id. week_parity allows bi-weekly (quinzenal) schedules.

CREATE TABLE IF NOT EXISTS public.room_availability_slots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id)       ON DELETE CASCADE,
  room_id     uuid        NOT NULL REFERENCES public.clinic_rooms(id)  ON DELETE CASCADE,
  weekday     smallint    NOT NULL CHECK (weekday BETWEEN 0 AND 6),    -- 0=Dom … 6=Sáb
  start_time  time        NOT NULL,
  end_time    time        NOT NULL,
  active      boolean     NOT NULL DEFAULT true,
  week_parity text        CHECK (week_parity IN ('even', 'odd')),      -- NULL = toda semana
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.room_availability_slots ENABLE ROW LEVEL SECURITY;

-- Any authenticated member of the clinic can read
CREATE POLICY "room_avail_clinic_read"
  ON public.room_availability_slots
  FOR SELECT
  USING (
    (SELECT auth.uid()) IN (
      SELECT id FROM public.user_profiles WHERE clinic_id = room_availability_slots.clinic_id
    )
  );

-- Only admins can write
CREATE POLICY "room_avail_admin_write"
  ON public.room_availability_slots
  FOR ALL
  USING (
    (SELECT auth.uid()) IN (
      SELECT up.id FROM public.user_profiles up
      WHERE  up.clinic_id = room_availability_slots.clinic_id
        AND  'admin' = ANY(up.roles)
    )
  );

-- ── Atomic upsert RPC ─────────────────────────────────────────────────────────
-- Replaces all slots for a room in a single transaction (no partial-update races).
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
      slot->>'start_time',
      slot->>'end_time',
      COALESCE((slot->>'active')::boolean, true),
      NULLIF(slot->>'week_parity', '')
    FROM jsonb_array_elements(p_slots) AS slot;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_room_availability_slots(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_room_availability_slots(uuid, uuid, jsonb) TO authenticated;
