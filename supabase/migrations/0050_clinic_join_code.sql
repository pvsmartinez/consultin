-- ─────────────────────────────────────────────────────────────────────────────
-- 0050: clinic_join_code
--
-- Adds a short alphanumeric join code to each clinic.
-- Clinic owners share this code with staff; when staff types the code
-- into the platform WhatsApp bot they are linked to that clinic.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper function: generates a random 6-char code (uppercase letters + digits,
-- no ambiguous characters like 0/O or 1/I)
CREATE OR REPLACE FUNCTION public.generate_clinic_join_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  TEXT := '';
  i     INT;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN code;
END;
$$;

-- Add the column (with a unique default for all future rows)
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS join_code TEXT UNIQUE
    DEFAULT public.generate_clinic_join_code();

-- Backfill existing clinics that have no code yet
UPDATE public.clinics
SET join_code = public.generate_clinic_join_code()
WHERE join_code IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE public.clinics
  ALTER COLUMN join_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinics_join_code ON public.clinics (join_code);

COMMENT ON COLUMN public.clinics.join_code IS
  '6-char alphanumeric code shared with staff so they can join this clinic via the platform bot.';
