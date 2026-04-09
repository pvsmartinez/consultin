-- ─────────────────────────────────────────────────────────────────────────────
-- 0052: clinic_staff_requests — staff approval flow via platform WhatsApp bot
--
-- When a staff member messages the platform bot saying they work at a clinic,
-- their request lands here. The clinic owner is notified via WhatsApp and can
-- approve (triggers email + WA invite) or reject.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.clinic_staff_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  requester_name   TEXT        NOT NULL,
  requester_email  TEXT        NOT NULL,
  requester_phone  TEXT        NOT NULL,
  role             TEXT        NOT NULL DEFAULT 'professional'
                               CHECK (role IN ('professional', 'receptionist')),
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_clinic_staff_requests_clinic_status
  ON public.clinic_staff_requests (clinic_id, status);

CREATE INDEX idx_clinic_staff_requests_phone
  ON public.clinic_staff_requests (requester_phone);

-- Service role only — no user-facing RLS policies
ALTER TABLE public.clinic_staff_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.clinic_staff_requests IS
  'Pending requests from staff who want to join a clinic — awaiting owner approval via the platform WhatsApp bot.';
