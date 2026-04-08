-- Migration: 0048_wa_ai_model_gemma4
-- Update default wa_ai_model for new clinics to Gemma 4 31B (Google/OpenRouter).
-- Existing clinics keep their current model — change manually or via the Configurações > WhatsApp UI.

ALTER TABLE clinics
  ALTER COLUMN wa_ai_model SET DEFAULT 'google/gemma-4-31b-it';
