-- ─────────────────────────────────────────────────────────────────────────────
-- Bloqueios de agenda (agenda_blocks)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Marca períodos em que não há atendimento: feriado, viagem, almoço, reunião,
-- atendimento em outro consultório. Até agora a única forma de registrar isso era
-- criar uma consulta falsa com um paciente qualquer, o que sujava o prontuário do
-- paciente e contava como atendimento nos relatórios.
--
-- `professional_id` nulo = bloqueio de toda a clínica (ex: feriado).
--
-- Assim como consultas sobrepostas (20260713155518), o bloqueio **avisa** e não
-- rejeita: a clínica pode agendar por cima se precisar. Quem decide é a recepção,
-- não o banco.

CREATE TABLE public.agenda_blocks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL REFERENCES public.clinics(id)        ON DELETE CASCADE,
  professional_id uuid                 REFERENCES public.professionals(id) ON DELETE CASCADE,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  all_day         boolean     NOT NULL DEFAULT false,
  reason          text,
  created_by      uuid                 REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  external_ref    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_blocks_valid_period CHECK (ends_at > starts_at)
);

-- Idempotência para migrações vindas de outro sistema (mesma convenção de appointments).
CREATE UNIQUE INDEX idx_agenda_blocks_clinic_external_ref
  ON public.agenda_blocks (clinic_id, external_ref)
  WHERE external_ref IS NOT NULL;

CREATE INDEX idx_agenda_blocks_period
  ON public.agenda_blocks (clinic_id, starts_at, ends_at);
CREATE INDEX idx_agenda_blocks_professional
  ON public.agenda_blocks (professional_id, starts_at);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.agenda_blocks ENABLE ROW LEVEL SECURITY;

-- Qualquer membro da clínica lê (a agenda inteira precisa ver o bloqueio).
CREATE POLICY "agenda_blocks_read" ON public.agenda_blocks
  FOR SELECT USING (
    clinic_id = (SELECT clinic_id FROM public.user_profiles WHERE id = (SELECT auth.uid()))
    OR public.current_user_is_super_admin()
  );

-- Admin e recepção administram qualquer bloqueio da clínica; o profissional
-- bloqueia a própria agenda — é ele quem sabe que não vai poder atender.
CREATE POLICY "agenda_blocks_write" ON public.agenda_blocks
  FOR ALL USING (
    (
      clinic_id = (SELECT clinic_id FROM public.user_profiles WHERE id = (SELECT auth.uid()))
      AND (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.id = (SELECT auth.uid())
            AND ('admin' = ANY(up.roles) OR 'receptionist' = ANY(up.roles))
        )
        OR professional_id IN (
          SELECT p.id FROM public.professionals p WHERE p.user_id = (SELECT auth.uid())
        )
      )
    )
    OR public.current_user_is_super_admin()
  );

GRANT ALL ON public.agenda_blocks TO anon, authenticated, service_role;

COMMENT ON TABLE public.agenda_blocks IS
  'Períodos sem atendimento (feriado, viagem, almoço, reunião). professional_id nulo = clínica toda.';
