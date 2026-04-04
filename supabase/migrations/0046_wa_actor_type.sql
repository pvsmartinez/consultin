-- ─────────────────────────────────────────────────────────────────────────────
-- 0046: wa_actor_type — identifica quem está falando numa sessão WhatsApp
--
-- Antes: toda sessão era tratada como paciente (desconhecido ou identificado).
-- Agora:  profissionais/admins/recepcionistas também usam o WhatsApp para
--         gerenciar a clínica (agenda, salas, pacientes, etc.).
--
-- actor_type:
--   'patient'        — número cadastrado em patients.phone
--   'professional'   — número cadastrado em professionals.phone
--   'receptionist'   — profissional com role receptionist
--   'admin'          — profissional com role admin
--   'unknown'        — número não encontrado em nenhum cadastro
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS actor_type    text    NOT NULL DEFAULT 'unknown'
    CHECK (actor_type IN ('patient', 'professional', 'receptionist', 'admin', 'unknown')),
  ADD COLUMN IF NOT EXISTS professional_id uuid
    REFERENCES public.professionals(id) ON DELETE SET NULL;

-- Índice para lookup de profissional por telefone (últimos 9 dígitos)
CREATE INDEX IF NOT EXISTS idx_professionals_clinic_phone
  ON public.professionals (clinic_id, phone);

COMMENT ON COLUMN public.whatsapp_sessions.actor_type IS
  'Tipo do ator identificado pelo número de telefone: patient | professional | receptionist | admin | unknown';

COMMENT ON COLUMN public.whatsapp_sessions.professional_id IS
  'Referência ao profissional quando actor_type = professional/receptionist/admin';
