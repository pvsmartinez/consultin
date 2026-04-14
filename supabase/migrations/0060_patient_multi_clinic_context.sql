-- Migration: 0060_patient_multi_clinic_context
-- Goal: allow one patient account to switch between clinics it already belongs to,
-- while keeping all patient data isolated by clinic.

-- Helpful indexes for patient/professional context switching.
create index if not exists idx_patients_user_clinic
  on public.patients (user_id, clinic_id)
  where user_id is not null;

create index if not exists idx_professionals_user_clinic
  on public.professionals (user_id, clinic_id)
  where user_id is not null;

create index if not exists idx_ucm_user_clinic_active
  on public.user_clinic_memberships (user_id, clinic_id, active);

-- Returns true when the authenticated user can legitimately switch their current
-- clinic context to the given clinic. This supports the model:
-- account is global, data remains local to each clinic.
create or replace function public.current_user_can_access_clinic(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = (select auth.uid())
      and (
        up.is_super_admin = true
        or target_clinic_id is null
        or up.clinic_id = target_clinic_id
        or exists (
          select 1
          from public.patients p
          where p.user_id = up.id
            and p.clinic_id = target_clinic_id
        )
        or exists (
          select 1
          from public.professionals prof
          where prof.user_id = up.id
            and prof.clinic_id = target_clinic_id
            and prof.active = true
        )
        or exists (
          select 1
          from public.user_clinic_memberships ucm
          where ucm.user_id = up.id
            and ucm.clinic_id = target_clinic_id
            and ucm.active = true
        )
      )
  );
$$;

revoke all on function public.current_user_can_access_clinic(uuid) from public;
grant execute on function public.current_user_can_access_clinic(uuid) to authenticated;

-- Switch the current clinic context for the logged-in patient.
create or replace function public.switch_patient_clinic(target_clinic_id uuid)
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.user_profiles;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if not public.current_user_can_access_clinic(target_clinic_id) then
    raise exception 'You do not have access to this clinic';
  end if;

  update public.user_profiles
  set clinic_id = target_clinic_id
  where id = (select auth.uid())
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Profile not found';
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.switch_patient_clinic(uuid) from public;
grant execute on function public.switch_patient_clinic(uuid) to authenticated;

-- Tighten self-updates on user_profiles so clients cannot arbitrarily point
-- their profile at any clinic_id.
drop policy if exists "user_profiles_update" on public.user_profiles;

create policy "user_profiles_update" on public.user_profiles
  for update
  to authenticated
  using (
    id = (select auth.uid())
    or (id != (select auth.uid())
        and clinic_id = current_user_clinic_id()
        and current_user_role() = 'admin')
    or public.current_user_is_super_admin()
  )
  with check (
    (id = (select auth.uid())
      and public.current_user_can_access_clinic(clinic_id))
    or (id != (select auth.uid())
        and clinic_id = current_user_clinic_id()
        and current_user_role() = 'admin')
    or public.current_user_is_super_admin()
  );
