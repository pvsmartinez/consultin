-- Financial/clinical history: treatment budgets (orçamentos) and executed treatments (tratamentos).

alter table public.appointments
  add column if not exists source text not null default 'app',
  add column if not exists external_ref text;

create unique index if not exists idx_appointments_clinic_external_ref
  on public.appointments(clinic_id, external_ref)
  where external_ref is not null;

create type public.budget_status as enum (
  'pending', 'approved', 'rejected', 'cancelled', 'expired'
);

create type public.treatment_payment_status as enum (
  'pending', 'partial', 'paid'
);

create table if not exists public.patient_treatment_budgets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete set null,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  status public.budget_status not null default 'pending',
  total_amount_cents integer not null default 0,
  issued_on date,
  items jsonb not null default '[]'::jsonb,
  notes text,
  source text not null default 'app',
  external_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, external_ref)
);

create index if not exists idx_patient_treatment_budgets_patient_issued
  on public.patient_treatment_budgets(patient_id, issued_on desc);

create index if not exists idx_patient_treatment_budgets_clinic_status
  on public.patient_treatment_budgets(clinic_id, status);

alter table public.patient_treatment_budgets enable row level security;

drop policy if exists "patient_treatment_budgets_select" on public.patient_treatment_budgets;
create policy "patient_treatment_budgets_select"
  on public.patient_treatment_budgets for select
  using (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop policy if exists "patient_treatment_budgets_insert" on public.patient_treatment_budgets;
create policy "patient_treatment_budgets_insert"
  on public.patient_treatment_budgets for insert
  with check (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop policy if exists "patient_treatment_budgets_update" on public.patient_treatment_budgets;
create policy "patient_treatment_budgets_update"
  on public.patient_treatment_budgets for update
  using (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  )
  with check (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop policy if exists "patient_treatment_budgets_delete" on public.patient_treatment_budgets;
create policy "patient_treatment_budgets_delete"
  on public.patient_treatment_budgets for delete
  using (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop trigger if exists set_patient_treatment_budgets_updated_at on public.patient_treatment_budgets;
create trigger set_patient_treatment_budgets_updated_at
  before update on public.patient_treatment_budgets
  for each row execute function public.set_updated_at();

create table if not exists public.patient_treatments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete set null,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  budget_id uuid references public.patient_treatment_budgets(id) on delete set null,
  procedure_name text not null,
  tooth_region text,
  performed_on date,
  amount_cents integer not null default 0,
  paid_amount_cents integer not null default 0,
  payment_status public.treatment_payment_status not null default 'pending',
  notes text,
  source text not null default 'app',
  external_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, external_ref)
);

create index if not exists idx_patient_treatments_patient_performed
  on public.patient_treatments(patient_id, performed_on desc);

create index if not exists idx_patient_treatments_clinic_payment_status
  on public.patient_treatments(clinic_id, payment_status);

alter table public.patient_treatments enable row level security;

drop policy if exists "patient_treatments_select" on public.patient_treatments;
create policy "patient_treatments_select"
  on public.patient_treatments for select
  using (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop policy if exists "patient_treatments_insert" on public.patient_treatments;
create policy "patient_treatments_insert"
  on public.patient_treatments for insert
  with check (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop policy if exists "patient_treatments_update" on public.patient_treatments;
create policy "patient_treatments_update"
  on public.patient_treatments for update
  using (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  )
  with check (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop policy if exists "patient_treatments_delete" on public.patient_treatments;
create policy "patient_treatments_delete"
  on public.patient_treatments for delete
  using (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop trigger if exists set_patient_treatments_updated_at on public.patient_treatments;
create trigger set_patient_treatments_updated_at
  before update on public.patient_treatments
  for each row execute function public.set_updated_at();
