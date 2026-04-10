-- ─────────────────────────────────────────────────────────────────────────────
-- 0053: structured bot state for wa_platform_users
--
-- Keeps ephemeral platform-bot workflow state in JSONB instead of encoding it
-- into the free-form notes column.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.wa_platform_users
  ADD COLUMN IF NOT EXISTS bot_state JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.wa_platform_users.bot_state IS
  'Structured ephemeral state for the Consultin platform WhatsApp bot (e.g. pending join code).';

UPDATE public.wa_platform_users
SET bot_state = '{}'::jsonb
WHERE bot_state IS NULL;
