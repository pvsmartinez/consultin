-- Migration: 0041_public_site_analytics
-- ════════════════════════════════════════════════════════════════
-- Stores lightweight public funnel analytics for the unauthenticated
-- Consultin marketing surface. This is intentionally limited to pre-login
-- routes and anonymous CTA events only.
--
-- Captured use cases:
--   - page views on /, /login, /cadastro-clinica
--   - CTA clicks from the landing page
--   - successful clinic signup request submissions
--
-- No patient, clinic, professional, or auth payloads are stored.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.public_site_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  event_name TEXT NOT NULL,
  page_path  TEXT NOT NULL,
  referrer   TEXT,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS public_site_events_created_at_idx
  ON public.public_site_events (created_at DESC);

CREATE INDEX IF NOT EXISTS public_site_events_event_name_created_at_idx
  ON public.public_site_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS public_site_events_page_path_created_at_idx
  ON public.public_site_events (page_path, created_at DESC);

ALTER TABLE public.public_site_events ENABLE ROW LEVEL SECURITY;