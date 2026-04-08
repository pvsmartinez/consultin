-- ─────────────────────────────────────────────────────────────────────────────
-- 0049: wa_platform_bot — memory and history for Consultin's own WhatsApp bot
--
-- This bot is NOT per-clinic. It lives on Consultin's own WhatsApp number and
-- helps prospective clinic owners or staff to:
--   1. Create a new clinic account on the platform
--   2. Edit / learn about their existing clinic
--   3. Join a clinic they work at (staff invite flow)
--
-- Each phone that texts the platform number gets a persistent row in
-- wa_platform_users. Rolling message history is kept in wa_platform_messages.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Platform user memory ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_platform_users (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone            TEXT        NOT NULL UNIQUE,
  name             TEXT,
  email            TEXT,
  -- Linked to auth.users once we identify who this person is
  linked_user_id   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Free-form notes the bot can write (extra context, preferences, etc.)
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_platform_users_phone
  ON public.wa_platform_users (phone);

CREATE INDEX IF NOT EXISTS idx_wa_platform_users_linked_user
  ON public.wa_platform_users (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

-- Only service_role (edge functions) can access this table — no user-facing RLS
ALTER TABLE public.wa_platform_users ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.wa_platform_users IS
  'Phone-based persistent memory for Consultin''s own WhatsApp onboarding bot.';

-- ─── 2. Rolling conversation history ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_platform_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id UUID        NOT NULL REFERENCES public.wa_platform_users(id) ON DELETE CASCADE,
  role             TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_platform_messages_user_time
  ON public.wa_platform_messages (platform_user_id, created_at DESC);

ALTER TABLE public.wa_platform_messages ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.wa_platform_messages IS
  'Conversation history for the platform onboarding bot (last N kept for AI context).';

-- ─── 3. Auto-update updated_at on wa_platform_users ─────────────────────────
CREATE OR REPLACE FUNCTION public.touch_wa_platform_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wa_platform_users_updated_at
  BEFORE UPDATE ON public.wa_platform_users
  FOR EACH ROW EXECUTE FUNCTION public.touch_wa_platform_user();
