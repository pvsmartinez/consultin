-- Migration 0030: Patient booking config + WhatsApp AI customisation
-- Adds:
--   clinics.allow_professional_selection — patient can choose professional at booking
--   clinics.wa_ai_custom_prompt          — clinic-specific instructions for the AI agent
--   clinics.wa_ai_allow_schedule         — AI can propose and book new appointments
--   clinics.wa_ai_allow_confirm          — AI can confirm existing appointments
--   clinics.wa_ai_allow_cancel           — AI can cancel existing appointments
--   whatsapp_faqs                        — clinic-editable FAQ knowledge base for the AI

-- ─── Clinics: booking config ────────────────────────────────────────────────
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS allow_professional_selection BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.clinics.allow_professional_selection IS
  'When true, the patient booking flow shows a professional picker. When false, any available professional is auto-assigned.';

-- ─── Clinics: WhatsApp AI config ─────────────────────────────────────────────
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS wa_ai_custom_prompt  TEXT,
  ADD COLUMN IF NOT EXISTS wa_ai_allow_schedule BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wa_ai_allow_confirm  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS wa_ai_allow_cancel   BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.clinics.wa_ai_custom_prompt IS
  'Extra instructions appended to the WhatsApp AI system prompt. Clinic can define tone, restrictions, etc.';
COMMENT ON COLUMN public.clinics.wa_ai_allow_schedule IS
  'When true, the AI can propose and create new appointments via WhatsApp.';
COMMENT ON COLUMN public.clinics.wa_ai_allow_confirm IS
  'When true, the AI can confirm pending appointments.';
COMMENT ON COLUMN public.clinics.wa_ai_allow_cancel IS
  'When true, the AI can cancel appointments.';

-- ─── WhatsApp FAQs (knowledge base) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_faqs (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id  UUID        NOT NULL REFERENCES public.clinics ON DELETE CASCADE,
  question   TEXT        NOT NULL,
  answer     TEXT        NOT NULL,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_faqs_clinic ON public.whatsapp_faqs (clinic_id, active);

ALTER TABLE public.whatsapp_faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation" ON public.whatsapp_faqs
  FOR ALL USING (
    clinic_id = (SELECT clinic_id FROM public.user_profiles WHERE id = auth.uid())
  );
