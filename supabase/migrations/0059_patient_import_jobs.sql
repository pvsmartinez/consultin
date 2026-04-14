-- Migration: 0059_patient_import_jobs
-- Adds an asynchronous import pipeline for patient spreadsheets.
-- Flow:
--   1. Frontend uploads original CSV/XLSX file to Storage bucket `patient-imports`
--   2. Frontend inserts a row in `patient_import_jobs` with chosen mapping/custom fields
--   3. AFTER INSERT trigger fires `process-patient-import` edge function via pg_net
--   4. Edge function downloads the file, deduplicates, creates custom fields, and imports rows

create extension if not exists pg_net;

create table if not exists public.patient_import_job_config (
  key text primary key,
  value text not null
);

alter table public.patient_import_job_config enable row level security;

create table if not exists public.patient_import_jobs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  file_name text not null,
  storage_path text not null,
  file_size_bytes bigint,
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  failed_rows integer not null default 0,
  created_custom_fields integer not null default 0,
  source_headers jsonb not null default '[]'::jsonb,
  mapping jsonb not null default '{}'::jsonb,
  custom_fields jsonb not null default '[]'::jsonb,
  sample_errors jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patient_import_jobs enable row level security;

create policy "patient_import_jobs_select"
  on public.patient_import_jobs for select
  using (
    clinic_id = public.current_user_clinic_id()
    and public.current_user_role() in ('admin', 'receptionist')
  );

create policy "patient_import_jobs_insert"
  on public.patient_import_jobs for insert
  with check (
    clinic_id = public.current_user_clinic_id()
    and public.current_user_role() in ('admin', 'receptionist')
  );

drop trigger if exists set_patient_import_jobs_updated_at on public.patient_import_jobs;
create trigger set_patient_import_jobs_updated_at
  before update on public.patient_import_jobs
  for each row execute function public.set_updated_at();

create index if not exists idx_patient_import_jobs_clinic_created_at
  on public.patient_import_jobs (clinic_id, created_at desc);

create index if not exists idx_patient_import_jobs_status
  on public.patient_import_jobs (status);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-imports',
  'patient-imports',
  false,
  52428800,
  array[
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.spreadsheet'
  ]
)
on conflict (id) do nothing;

create policy "patient_imports_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'patient-imports'
    and (storage.foldername(name))[1] = public.current_user_clinic_id()::text
    and public.current_user_role() in ('admin', 'receptionist')
  );

create policy "patient_imports_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'patient-imports'
    and (storage.foldername(name))[1] = public.current_user_clinic_id()::text
    and public.current_user_role() in ('admin', 'receptionist')
  );

create policy "patient_imports_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'patient-imports'
    and (storage.foldername(name))[1] = public.current_user_clinic_id()::text
    and public.current_user_role() in ('admin', 'receptionist')
  );

create or replace function public.enqueue_patient_import_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supabase_url text;
  v_srk text;
begin
  if new.status <> 'queued' then
    return new;
  end if;

  select value into v_supabase_url from public.patient_import_job_config where key = 'supabase_url';
  select value into v_srk from public.patient_import_job_config where key = 'service_role_key';

  if v_supabase_url is null or v_srk is null then
    raise warning '[patient_import_jobs] config missing in patient_import_job_config — run seed-patient-import-config.sh';
    return new;
  end if;

  perform net.http_post(
    url := v_supabase_url || '/functions/v1/process-patient-import',
    body := json_build_object('jobId', new.id)::jsonb,
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_srk
    )::jsonb
  );

  return new;
end;
$$;

drop trigger if exists patient_import_job_enqueue on public.patient_import_jobs;
create trigger patient_import_job_enqueue
  after insert on public.patient_import_jobs
  for each row execute function public.enqueue_patient_import_job();

comment on table public.patient_import_jobs is
  'Asynchronous patient spreadsheet imports. The original file is stored in the patient-imports bucket and processed by the process-patient-import edge function.';