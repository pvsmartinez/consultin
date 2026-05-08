-- Structured patient clinical registry for requests, documents and prostheses.

create type public.clinical_item_category as enum ('request', 'document');

create type public.clinical_item_type as enum (
  'exam_request',
  'prescription',
  'medical_certificate',
  'consent_term',
  'custom'
);

create type public.clinical_item_status as enum (
  'draft',
  'requested',
  'issued',
  'completed',
  'cancelled'
);

create type public.prosthesis_status as enum (
  'planned',
  'requested',
  'in_production',
  'ready',
  'installed',
  'maintenance',
  'cancelled'
);

create table if not exists public.patient_clinical_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  category public.clinical_item_category not null,
  item_type public.clinical_item_type not null,
  status public.clinical_item_status not null default 'draft',
  title text not null,
  description text,
  notes text,
  requested_for_date date,
  issued_on date,
  completed_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_patient_clinical_items_patient_created_at
  on public.patient_clinical_items(patient_id, created_at desc);

create index if not exists idx_patient_clinical_items_clinic_category_status
  on public.patient_clinical_items(clinic_id, category, status);

alter table public.patient_clinical_items enable row level security;

drop policy if exists "patient_clinical_items_select" on public.patient_clinical_items;
create policy "patient_clinical_items_select"
  on public.patient_clinical_items for select
  using (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop policy if exists "patient_clinical_items_insert" on public.patient_clinical_items;
create policy "patient_clinical_items_insert"
  on public.patient_clinical_items for insert
  with check (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop policy if exists "patient_clinical_items_update" on public.patient_clinical_items;
create policy "patient_clinical_items_update"
  on public.patient_clinical_items for update
  using (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  )
  with check (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop policy if exists "patient_clinical_items_delete" on public.patient_clinical_items;
create policy "patient_clinical_items_delete"
  on public.patient_clinical_items for delete
  using (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop trigger if exists set_patient_clinical_items_updated_at on public.patient_clinical_items;
create trigger set_patient_clinical_items_updated_at
  before update on public.patient_clinical_items
  for each row execute function public.set_updated_at();

create table if not exists public.patient_prostheses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  name text not null,
  tooth_region text,
  laboratory_name text,
  status public.prosthesis_status not null default 'planned',
  started_on date,
  due_on date,
  installed_on date,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_patient_prostheses_patient_created_at
  on public.patient_prostheses(patient_id, created_at desc);

create index if not exists idx_patient_prostheses_clinic_status
  on public.patient_prostheses(clinic_id, status);

alter table public.patient_prostheses enable row level security;

drop policy if exists "patient_prostheses_select" on public.patient_prostheses;
create policy "patient_prostheses_select"
  on public.patient_prostheses for select
  using (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop policy if exists "patient_prostheses_insert" on public.patient_prostheses;
create policy "patient_prostheses_insert"
  on public.patient_prostheses for insert
  with check (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop policy if exists "patient_prostheses_update" on public.patient_prostheses;
create policy "patient_prostheses_update"
  on public.patient_prostheses for update
  using (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  )
  with check (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop policy if exists "patient_prostheses_delete" on public.patient_prostheses;
create policy "patient_prostheses_delete"
  on public.patient_prostheses for delete
  using (
    clinic_id = (select public.current_user_clinic_id())
    and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
  );

drop trigger if exists set_patient_prostheses_updated_at on public.patient_prostheses;
create trigger set_patient_prostheses_updated_at
  before update on public.patient_prostheses
  for each row execute function public.set_updated_at();