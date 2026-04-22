-- Migration: 0059_public_signup_owner_lock
-- Adds a stable owner reference for clinics created from the public signup flow.
-- This lets the backend prevent duplicate clinic creation for the same auth user.

ALTER TABLE public.clinics
ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.clinics c
SET owner_user_id = up.id
FROM public.user_profiles up
WHERE up.clinic_id = c.id
  AND c.owner_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS clinics_owner_user_id_unique_idx
ON public.clinics (owner_user_id)
WHERE owner_user_id IS NOT NULL;

COMMENT ON COLUMN public.clinics.owner_user_id IS
'Auth user that owns a clinic created through the public signup flow. Unique when present.';