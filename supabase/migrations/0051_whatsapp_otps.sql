-- ─────────────────────────────────────────────────────────────────────────────
-- 0051: whatsapp_otps
--
-- One-time codes sent to a user's WhatsApp number to authenticate on the web.
-- Flow:
--   1. User enters email on login page
--   2. Backend looks up phone from user_profiles, generates 6-digit code
--   3. Code is stored here (hashed) and sent via WhatsApp
--   4. User types code → backend verifies → issues Supabase magic link token
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,           -- SHA-256 of the 6-digit code
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only service role may access this table
ALTER TABLE public.whatsapp_otps ENABLE ROW LEVEL SECURITY;

-- No public policies — only service role key bypasses RLS
-- (edge function uses SUPABASE_SERVICE_ROLE_KEY)

-- Index for fast lookup during verification
CREATE INDEX IF NOT EXISTS idx_whatsapp_otps_email
  ON public.whatsapp_otps (email, created_at DESC);

-- Auto-clean codes older than 1 hour to keep table lean
-- (a pg_cron job would be ideal but this table stays tiny; we clean on read instead)
