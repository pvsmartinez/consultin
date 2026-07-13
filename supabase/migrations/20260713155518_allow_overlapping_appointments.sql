-- Migration: allow_overlapping_appointments
-- ════════════════════════════════════════════════════════════════
-- Double-booking (same professional or same room, overlapping times) is a
-- valid real-world scheduling choice — clinics intentionally overbook to
-- cover no-shows, or a dentist may run two patients in parallel chairs.
-- The DB previously hard-blocked this via a GiST exclusion constraint and a
-- trigger; both are removed here. Conflicts are now surfaced as a visual
-- warning in the agenda UI instead of being rejected at write time.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS no_overlap;

DROP TRIGGER IF EXISTS appointments_room_overlap ON public.appointments;
DROP FUNCTION IF EXISTS public.check_room_overlap();
