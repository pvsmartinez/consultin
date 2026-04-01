-- Migration: 0045_subscription_tiers_and_trial
-- Adds subscription_tier and trial_ends_at to clinics.
-- Enforces tier-based appointment quota at the application layer;
-- the DB stores the tier and trial window, limits are checked in the frontend.

-- ── Add columns ────────────────────────────────────────────────────────────────

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'trial'
    CONSTRAINT clinics_subscription_tier_check
    CHECK (subscription_tier IN ('trial', 'basic', 'professional', 'unlimited')),
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- ── Back-fill existing rows ────────────────────────────────────────────────────

-- All existing clinics get trial_ends_at = created_at + 7 days.
-- Clinics created long ago will already be past the trial window — this is
-- intentional: if they have payments_enabled=TRUE they have an active
-- subscription; if billing_override_enabled=TRUE they are manually unlocked.
UPDATE public.clinics
SET trial_ends_at = created_at + interval '7 days'
WHERE trial_ends_at IS NULL;

-- Existing clinics that are actively paying map to the 'basic' tier (R$100/month).
-- Super-admins can update the tier manually via the admin panel once the feature ships.
UPDATE public.clinics
SET subscription_tier = 'basic'
WHERE subscription_status = 'ACTIVE'
  AND subscription_tier = 'trial';

-- ── Trigger: auto-set trial_ends_at on new clinic inserts ─────────────────────

CREATE OR REPLACE FUNCTION public.set_clinic_trial_ends_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := NOW() + interval '7 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinic_set_trial_ends_at ON public.clinics;
CREATE TRIGGER clinic_set_trial_ends_at
  BEFORE INSERT ON public.clinics
  FOR EACH ROW
  EXECUTE FUNCTION public.set_clinic_trial_ends_at();
