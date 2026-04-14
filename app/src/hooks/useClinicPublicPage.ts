import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { useAuthContext } from '../contexts/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClinicPublicPage {
  id: string
  clinicId: string
  slug: string
  published: boolean
  logoUrl: string | null
  coverUrl: string | null
  primaryColor: string
  tagline: string | null
  showProfessionals: boolean
  showLocation: boolean
  showServices: boolean
  showHours: boolean
  showBooking: boolean
  showWhatsapp: boolean
  createdAt: string
  updatedAt: string
}

export type ClinicPublicPageInput = Omit<ClinicPublicPage, 'id' | 'clinicId' | 'createdAt' | 'updatedAt'>

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapPage(r: Record<string, unknown>): ClinicPublicPage {
  return {
    id:                r.id as string,
    clinicId:          r.clinic_id as string,
    slug:              r.slug as string,
    published:         r.published as boolean,
    logoUrl:           (r.logo_url as string) ?? null,
    coverUrl:          (r.cover_url as string) ?? null,
    primaryColor:      (r.primary_color as string) ?? '#2563eb',
    tagline:           (r.tagline as string) ?? null,
    showProfessionals: r.show_professionals as boolean,
    showLocation:      r.show_location as boolean,
    showServices:      r.show_services as boolean,
    showHours:         r.show_hours as boolean,
    showBooking:       r.show_booking as boolean,
    showWhatsapp:      r.show_whatsapp as boolean,
    createdAt:         r.created_at as string,
    updatedAt:         r.updated_at as string,
  }
}

function mapPublicPageFull(r: Record<string, unknown>): ClinicPublicPageFull {
  const clinic = (r.clinic as Record<string, unknown> | null) ?? {}
  const professionals = Array.isArray(r.professionals) ? r.professionals : []
  const services = Array.isArray(r.services) ? r.services : []

  return {
    ...mapPage(r),
    clinic: {
      name:                       clinic.name as string,
      address:                    (clinic.address as string) ?? null,
      city:                       (clinic.city as string) ?? null,
      state:                      (clinic.state as string) ?? null,
      phone:                      (clinic.phone as string) ?? null,
      whatsappPhoneDisplay:       (clinic.whatsappPhoneDisplay as string) ?? null,
      workingHours:               (clinic.workingHours as Record<string, unknown>) ?? null,
      allowSelfRegistration:      Boolean(clinic.allowSelfRegistration),
      allowProfessionalSelection: Boolean(clinic.allowProfessionalSelection),
    },
    professionals: professionals.map((professional) => {
      const pr = professional as Record<string, unknown>
      return {
        id:        pr.id as string,
        name:      pr.name as string,
        specialty: (pr.specialty as string) ?? null,
        photoUrl:  (pr.photoUrl as string) ?? null,
        bio:       (pr.bio as string) ?? null,
        active:    Boolean(pr.active),
      }
    }),
    services: services.map((service) => {
      const sv = service as Record<string, unknown>
      return {
        id:              sv.id as string,
        name:            sv.name as string,
        durationMinutes: sv.durationMinutes as number,
        priceCents:      (sv.priceCents as number) ?? null,
      }
    }),
  }
}

// ─── Hook: authenticated (clinic settings) ────────────────────────────────────

export function useClinicPublicPage() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  const query = useQuery({
    queryKey: QK.publicPage.own(clinicId),
    staleTime: 60_000,
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_public_page')
        .select('*')
        .eq('clinic_id', clinicId!)
        .maybeSingle()
      if (error) throw error
      return data ? mapPage(data as Record<string, unknown>) : null
    },
  })

  const upsert = useMutation({
    mutationFn: async (input: ClinicPublicPageInput) => {
      const payload = {
        clinic_id:          clinicId!,
        slug:               input.slug,
        published:          input.published,
        logo_url:           input.logoUrl ?? null,
        cover_url:          input.coverUrl ?? null,
        primary_color:      input.primaryColor,
        tagline:            input.tagline ?? null,
        show_professionals: input.showProfessionals,
        show_location:      input.showLocation,
        show_services:      input.showServices,
        show_hours:         input.showHours,
        show_booking:       input.showBooking,
        show_whatsapp:      input.showWhatsapp,
      }
      const { data, error } = await supabase
        .from('clinic_public_page')
        .upsert(payload, { onConflict: 'clinic_id' })
        .select()
        .single()
      if (error) throw error
      return mapPage(data as Record<string, unknown>)
    },
    onSuccess: (data) => {
      qc.setQueryData(QK.publicPage.own(clinicId), data)
    },
  })

  return { ...query, upsert }
}

// ─── Hook: public (read by slug, no auth required) ───────────────────────────

export interface ClinicPublicPageFull extends ClinicPublicPage {
  clinic: {
    name: string
    address: string | null
    city: string | null
    state: string | null
    phone: string | null
    whatsappPhoneDisplay: string | null
    workingHours: Record<string, unknown> | null
    allowSelfRegistration: boolean
    allowProfessionalSelection: boolean
  }
  professionals: Array<{
    id: string
    name: string
    specialty: string | null
    photoUrl: string | null
    bio: string | null
    active: boolean
  }>
  services: Array<{
    id: string
    name: string
    durationMinutes: number
    priceCents: number | null
  }>
}

export function usePublicPage(slug: string | undefined) {
  return useQuery({
    queryKey: QK.publicPage.bySlug(slug),
    staleTime: 5 * 60_000,
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_clinic_page', { p_slug: slug! })
      if (error || !data) throw new Error('Página não encontrada')
      return mapPublicPageFull(data as Record<string, unknown>)
    },
  })
}
