-- Migration: 0057_reminder_templates
-- Adds per-clinic customizable reminder message templates.
-- Variables supported: {{nome}}, {{data}}, {{hora}}, {{profissional}}
-- The edge function interprets these and sends as free text when the patient
-- has an active WhatsApp session (< 24h), otherwise falls back to Meta template.

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS wa_reminder_d1_text text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS wa_reminder_d0_text text DEFAULT NULL;

COMMENT ON COLUMN clinics.wa_reminder_d1_text IS
  'Custom text for D-1 reminder. Variables: {{nome}}, {{data}}, {{hora}}, {{profissional}}. NULL uses the default Meta template.';
COMMENT ON COLUMN clinics.wa_reminder_d0_text IS
  'Custom text for D-0 reminder. Variables: {{nome}}, {{hora}}, {{profissional}}. NULL uses the default Meta template.';
