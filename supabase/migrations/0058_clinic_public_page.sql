-- Migration: clinic_public_page
-- Adds public landing page support for clinics.
-- Each clinic can have one public page at consultin.app/p/:slug

-- ─────────────────────────────────────────────
-- 1. Table: clinic_public_page
-- ─────────────────────────────────────────────
create table clinic_public_page (
  id              uuid        primary key default gen_random_uuid(),
  clinic_id       uuid        not null unique references clinics(id) on delete cascade,
  slug            text        not null unique,
  published       boolean     not null default false,

  -- Visual identity
  logo_url        text,
  cover_url       text,
  primary_color   text        not null default '#2563eb',

  -- Description
  tagline         text,

  -- Section toggles
  show_professionals  boolean not null default true,
  show_location       boolean not null default true,
  show_services       boolean not null default true,
  show_hours          boolean not null default true,
  show_booking        boolean not null default true,
  show_whatsapp       boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Slug must be lowercase alphanumeric + hyphens, 3–60 chars
alter table clinic_public_page
  add constraint clinic_public_page_slug_format
  check (slug ~ '^[a-z0-9][a-z0-9\-]{1,58}[a-z0-9]$');

-- Auto-update updated_at
create or replace function update_clinic_public_page_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_clinic_public_page_updated_at
before update on clinic_public_page
for each row execute function update_clinic_public_page_updated_at();

-- ─────────────────────────────────────────────
-- 2. Extend professionals table
-- ─────────────────────────────────────────────
alter table professionals
  add column if not exists photo_url text,
  add column if not exists bio       text;

-- ─────────────────────────────────────────────
-- 3. Storage bucket: clinic-assets (public)
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinic-assets',
  'clinic-assets',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────
-- 4. RLS: clinic_public_page
-- ─────────────────────────────────────────────
alter table clinic_public_page enable row level security;

-- Anyone can read published pages (public)
create policy "public_read_published_clinic_page"
on clinic_public_page for select
using (published = true);

-- Clinic members can read their own page (even unpublished)
create policy "clinic_members_read_own_page"
on clinic_public_page for select
using (
  exists (
    select 1 from user_clinic_memberships ucm
    where ucm.clinic_id = clinic_public_page.clinic_id
      and ucm.user_id = (select auth.uid())
  )
);

-- Clinic members can insert/update/delete their own page
create policy "clinic_members_write_own_page"
on clinic_public_page for insert
with check (
  exists (
    select 1 from user_clinic_memberships ucm
    where ucm.clinic_id = clinic_public_page.clinic_id
      and ucm.user_id = (select auth.uid())
  )
);

create policy "clinic_members_update_own_page"
on clinic_public_page for update
using (
  exists (
    select 1 from user_clinic_memberships ucm
    where ucm.clinic_id = clinic_public_page.clinic_id
      and ucm.user_id = (select auth.uid())
  )
);

create policy "clinic_members_delete_own_page"
on clinic_public_page for delete
using (
  exists (
    select 1 from user_clinic_memberships ucm
    where ucm.clinic_id = clinic_public_page.clinic_id
      and ucm.user_id = (select auth.uid())
  )
);

-- ─────────────────────────────────────────────
-- 5. RLS: Storage bucket clinic-assets
-- ─────────────────────────────────────────────

-- Public read
create policy "clinic_assets_public_read"
on storage.objects for select
using (bucket_id = 'clinic-assets');

-- Authenticated clinic members can upload to their own folder
create policy "clinic_assets_clinic_upload"
on storage.objects for insert
with check (
  bucket_id = 'clinic-assets'
  and (select auth.role()) = 'authenticated'
  and exists (
    select 1 from user_clinic_memberships ucm
    where ucm.user_id = (select auth.uid())
      -- path pattern: clinic-assets/{clinic_id}/...
    and ucm.clinic_id::text = split_part(name, '/', 1)
  )
);

create policy "clinic_assets_clinic_update"
on storage.objects for update
using (
  bucket_id = 'clinic-assets'
  and (select auth.role()) = 'authenticated'
  and exists (
    select 1 from user_clinic_memberships ucm
    where ucm.user_id = (select auth.uid())
      and ucm.clinic_id::text = split_part(name, '/', 1)
  )
);

create policy "clinic_assets_clinic_delete"
on storage.objects for delete
using (
  bucket_id = 'clinic-assets'
  and (select auth.role()) = 'authenticated'
  and exists (
    select 1 from user_clinic_memberships ucm
    where ucm.user_id = (select auth.uid())
      and ucm.clinic_id::text = split_part(name, '/', 1)
  )
);

-- ─────────────────────────────────────────────
-- 6. Public read for professionals (via public page)
-- ─────────────────────────────────────────────
-- Professionals from clinics with a published page can be read publicly
create policy "public_read_professionals_via_page"
on professionals for select
using (
  exists (
    select 1 from clinic_public_page cpp
    where cpp.clinic_id = professionals.clinic_id
      and cpp.published = true
  )
);

-- Clinics with a published page can be read publicly.
create policy "public_read_clinics_via_page"
on clinics for select
using (
  exists (
    select 1 from clinic_public_page cpp
    where cpp.clinic_id = clinics.id
      and cpp.published = true
  )
);

-- ─────────────────────────────────────────────
-- 7. Public read for service_types (via public page)
-- ─────────────────────────────────────────────
create policy "public_read_service_types_via_page"
on service_types for select
using (
  exists (
    select 1 from clinic_public_page cpp
    where cpp.clinic_id = service_types.clinic_id
      and cpp.published = true
  )
);
