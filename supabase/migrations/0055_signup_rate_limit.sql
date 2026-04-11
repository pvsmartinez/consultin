-- Migration: 0055_signup_rate_limit
-- ════════════════════════════════════════════════════════════════
-- Adds submitter_ip column to clinic_signup_requests so the
-- submit-clinic-signup edge function can enforce IP-based rate limiting
-- (max 3 submissions per IP per hour) without extra infrastructure.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.clinic_signup_requests
  ADD COLUMN IF NOT EXISTS submitter_ip TEXT;

-- Index for fast rate limit check (IP + created_at scan)
CREATE INDEX IF NOT EXISTS idx_signup_requests_ip_created
  ON public.clinic_signup_requests (submitter_ip, created_at DESC)
  WHERE submitter_ip IS NOT NULL;
