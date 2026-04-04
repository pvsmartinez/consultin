-- Migration 0047: add phone to user_profiles for WhatsApp staff identification
-- Receptionists and admins can now be identified by WhatsApp number without
-- needing a record in the professionals table.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN public.user_profiles.phone IS 'WhatsApp phone number (E.164 or local) — used to identify staff on inbound messages';

CREATE INDEX IF NOT EXISTS idx_user_profiles_clinic_phone
  ON public.user_profiles (clinic_id, phone)
  WHERE phone IS NOT NULL;
