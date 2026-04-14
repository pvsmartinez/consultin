-- 0061: secure public page access via RPC
-- Removes broad public table policies and exposes only a safe projection.

drop policy if exists "public_read_professionals_via_page" on public.professionals;
drop policy if exists "public_read_clinics_via_page" on public.clinics;
drop policy if exists "public_read_service_types_via_page" on public.service_types;

create or replace function public.get_public_clinic_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_page as (
    select
      cpp.id,
      cpp.clinic_id,
      cpp.slug,
      cpp.published,
      cpp.logo_url,
      cpp.cover_url,
      cpp.primary_color,
      cpp.tagline,
      cpp.show_professionals,
      cpp.show_location,
      cpp.show_services,
      cpp.show_hours,
      cpp.show_booking,
      cpp.show_whatsapp,
      cpp.created_at,
      cpp.updated_at,
      c.name as clinic_name,
      c.address,
      c.city,
      c.state,
      c.phone,
      c.whatsapp_phone_display,
      c.working_hours,
      c.allow_self_registration,
      c.allow_professional_selection
    from public.clinic_public_page cpp
    join public.clinics c on c.id = cpp.clinic_id
    where cpp.slug = p_slug
      and cpp.published = true
  )
  select jsonb_build_object(
    'id', sp.id,
    'clinic_id', sp.clinic_id,
    'slug', sp.slug,
    'published', sp.published,
    'logo_url', sp.logo_url,
    'cover_url', sp.cover_url,
    'primary_color', sp.primary_color,
    'tagline', sp.tagline,
    'show_professionals', sp.show_professionals,
    'show_location', sp.show_location,
    'show_services', sp.show_services,
    'show_hours', sp.show_hours,
    'show_booking', sp.show_booking,
    'show_whatsapp', sp.show_whatsapp,
    'created_at', sp.created_at,
    'updated_at', sp.updated_at,
    'clinic', jsonb_build_object(
      'name', sp.clinic_name,
      'address', sp.address,
      'city', sp.city,
      'state', sp.state,
      'phone', sp.phone,
      'whatsappPhoneDisplay', sp.whatsapp_phone_display,
      'workingHours', sp.working_hours,
      'allowSelfRegistration', sp.allow_self_registration,
      'allowProfessionalSelection', sp.allow_professional_selection
    ),
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'specialty', p.specialty,
        'photoUrl', p.photo_url,
        'bio', p.bio,
        'active', p.active
      ) order by p.name)
      from public.professionals p
      where p.clinic_id = sp.clinic_id
        and p.active = true
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'name', st.name,
        'durationMinutes', st.duration_minutes,
        'priceCents', st.price_cents
      ) order by st.name)
      from public.service_types st
      where st.clinic_id = sp.clinic_id
        and st.active = true
    ), '[]'::jsonb)
  )
  from selected_page sp;
$$;

revoke all on function public.get_public_clinic_page(text) from public;
grant execute on function public.get_public_clinic_page(text) to anon, authenticated;