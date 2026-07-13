drop index if exists public.idx_appointments_clinic_external_ref;

create unique index if not exists idx_appointments_clinic_external_ref
  on public.appointments(clinic_id, external_ref);
