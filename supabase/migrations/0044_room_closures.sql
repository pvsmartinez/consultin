-- ─────────────────────────────────────────────────────────────────────────────
-- 0044: Fechamentos temporários de sala (room_closures)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Permite marcar períodos em que uma sala fica indisponível (ex: manutenção,
-- reforma, férias). Esses fechamentos são verificados na agenda para bloquear
-- novos agendamentos e exibir o período como indisponível.

CREATE TABLE public.room_closures (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id)      ON DELETE CASCADE,
  room_id     uuid        NOT NULL REFERENCES public.clinic_rooms(id) ON DELETE CASCADE,
  starts_at   date        NOT NULL,
  ends_at     date        NOT NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_closures_valid_period CHECK (ends_at >= starts_at)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.room_closures ENABLE ROW LEVEL SECURITY;

-- Qualquer membro da clínica pode ler
CREATE POLICY "room_closures_read" ON public.room_closures
  FOR SELECT USING (
    (SELECT auth.uid()) IN (
      SELECT id FROM public.user_profiles WHERE clinic_id = room_closures.clinic_id
    )
  );

-- Somente admins podem escrever (INSERT, UPDATE, DELETE)
CREATE POLICY "room_closures_admin_write" ON public.room_closures
  FOR ALL USING (
    (SELECT auth.uid()) IN (
      SELECT up.id FROM public.user_profiles up
      WHERE  up.clinic_id = room_closures.clinic_id
        AND  'admin' = ANY(up.roles)
    )
  );

-- ── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_room_closures_room_id ON public.room_closures (room_id);
CREATE INDEX idx_room_closures_period  ON public.room_closures (clinic_id, starts_at, ends_at);
