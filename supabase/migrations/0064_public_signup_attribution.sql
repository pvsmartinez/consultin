-- Migration: 0064_public_signup_attribution
-- Persists lightweight marketing attribution for public self-serve signups.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS signup_attribution JSONB NOT NULL DEFAULT '{}'::jsonb;