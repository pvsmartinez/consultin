-- ─────────────────────────────────────────────────────────────────────────────
-- 0027: clinic_notifications — in-app notification system para staff
-- ─────────────────────────────────────────────────────────────────────────────
-- Tipos de notificação:
--   wa_escalated           — sessão WA transferida pelo AI para atendente humano
--   appointment_cancelled  — paciente cancelou consulta pelo WhatsApp
--   appointment_confirmed  — paciente confirmou consulta pelo WhatsApp
--
-- Fluxo:
--   1. whatsapp-webhook insere ao executar escalate / cancel_appointment / confirm_appointment
--   2. useClinicNotifications (Realtime INSERT) exibe toast no frontend
--   3. Badge no menu lateral = COUNT(*) WHERE read_at IS NULL
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.clinic_notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  -- 'wa_escalated' | 'appointment_cancelled' | 'appointment_confirmed'
  type        text        NOT NULL,
  -- Contexto livre: patientName, appointmentId, sessionId, startsAt, etc.
  data        jsonb       NOT NULL DEFAULT '{}',
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índice parcial para busca eficiente de não-lidas (a query mais frequente)
CREATE INDEX idx_clinic_notifications_unread
  ON public.clinic_notifications (clinic_id, created_at DESC)
  WHERE read_at IS NULL;

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.clinic_notifications ENABLE ROW LEVEL SECURITY;

-- Staff pode ler as notificações da própria clínica
CREATE POLICY "cn_staff_select" ON public.clinic_notifications
  FOR SELECT USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() IN ('admin', 'receptionist')
  );

-- Staff pode marcar como lido (UPDATE somente read_at)
CREATE POLICY "cn_staff_update" ON public.clinic_notifications
  FOR UPDATE
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() IN ('admin', 'receptionist')
  )
  WITH CHECK (
    clinic_id = public.current_user_clinic_id()
  );

-- INSERT é feito apenas pelo service role (webhook/edge functions) — RLS bypassado
-- Não é necessário uma policy de INSERT para service role.

-- ─── pg_cron: agenda diária dos profissionais ──────────────────────────────
-- Dispara às 07:00 BRT (10:00 UTC) todos os dias.
-- Ativar no Supabase Dashboard > Integrations > Cron, ou via setup script
-- substituindo <PROJECT_REF> e <SERVICE_ROLE_KEY>.
--
-- SELECT cron.schedule(
--   'wa-professional-agenda',
--   '0 10 * * *',
--   $$SELECT net.http_post(
--       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-professional-agenda',
--       headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
--       body    := '{}'::jsonb
--   )$$
-- );
