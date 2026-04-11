import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { useAuthContext } from '../contexts/AuthContext'
import { mapAppointment } from '../utils/mappers'
import type { Appointment, AppointmentStatus } from '../types'

/** Returns ALL professional records for the current user across all their clinics.
 *  Uses user_clinic_memberships (fast) and falls back to email match for legacy records. */
export interface ProfessionalRecord { id: string; clinicId: string; clinicName: string | null }

export function useMyProfessionalRecords() {
  const { session } = useAuthContext()
  const email = session?.user.email
  return useQuery({
    queryKey: QK.professionals.my(session?.user.id),
    enabled: !!session?.user.id,
    staleTime: 60_000, // 1 min — runs on every page via AppLayout, cache it
    queryFn: async (): Promise<ProfessionalRecord[]> => {
      const userId = session!.user.id

      // Run all three lookup strategies in parallel — avoids a 3× RTT sequential waterfall.
      // For the vast majority of users the first query returns immediately (user_id match),
      // so the extra parallel queries are just cheap no-ops that get cancelled client-side.
      const [directResult, membershipsResult, emailResult] = await Promise.all([
        // Primary: direct user_id match (preferred)
        supabase
          .from('professionals')
          .select('id, clinic_id, clinics(id, name)')
          .eq('user_id', userId)
          .eq('active', true),

        // Secondary: user_clinic_memberships (multi-clinic professionals)
        supabase
          .from('user_clinic_memberships')
          .select('professional_id, clinic_id, clinics(id, name)')
          .eq('user_id', userId)
          .eq('active', true)
          .not('professional_id', 'is', null),

        // Fallback: email match (legacy records without user_id)
        email
          ? supabase
              .from('professionals')
              .select('id, clinic_id, clinics(id, name)')
              .ilike('email', email)
              .eq('active', true)
          : Promise.resolve({ data: [] as { id: string; clinic_id: string; clinics: unknown }[], error: null }),
      ])

      type ClinicRef = { name?: string } | null
      const direct      = (directResult.data ?? []) as { id: string; clinic_id: string; clinics: ClinicRef }[]
      const memberships = (membershipsResult.data ?? []) as { professional_id: string; clinic_id: string; clinics: ClinicRef }[]
      const byEmail     = ((emailResult as { data: { id: string; clinic_id: string; clinics: ClinicRef }[] | null }).data ?? [])

      // Priority: user_id > membership > email
      if (direct.length > 0) {
        return direct.map(r => ({
          id:        r.id,
          clinicId:  r.clinic_id,
          clinicName: (r.clinics as ClinicRef)?.name ?? null,
        }))
      }
      if (memberships.length > 0) {
        return memberships.map(m => ({
          id:        m.professional_id,
          clinicId:  m.clinic_id,
          clinicName: (m.clinics as ClinicRef)?.name ?? null,
        }))
      }
      return byEmail.map(r => ({
        id:        r.id,
        clinicId:  r.clinic_id,
        clinicName: (r.clinics as ClinicRef)?.name ?? null,
      }))
    },
  })
}

export function useAppointmentsQuery(
  startsFrom: string,
  startsUntil: string,
  /** Filter by one or many professional IDs (for professional role: pass all their IDs) */
  professionalFilter?: string | string[] | null,
) {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId
  const ids = professionalFilter
    ? Array.isArray(professionalFilter) ? professionalFilter : [professionalFilter]
    : null

  return useQuery({
    queryKey: QK.appointments.list(clinicId, startsFrom, startsUntil, ids ?? 'all'),
    // Skip query when ids is an explicit empty array (personal view before prof records load,
    // or professional with no linked record) — prevents leaking all-clinic appointments.
    enabled: !!clinicId && (ids === null || ids.length > 0),
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select(`*, patient:patients(id,name,phone), professional:professionals(id,name,specialty), clinic_room:clinic_rooms(id,name,color), clinics(id,name)`)
        .eq('clinic_id', clinicId!)
        .gte('starts_at', startsFrom)
        .lte('starts_at', startsUntil)
        .order('starts_at')
      if (ids && ids.length > 0) {
        q = ids.length === 1
          ? q.eq('professional_id', ids[0])
          : q.in('professional_id', ids)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map(r => ({
        ...mapAppointment(r as Record<string, unknown>),
        clinicName: ((r as Record<string, unknown>).clinics as { name?: string } | null)?.name ?? null,
      }))
    },
  })
}

export interface AppointmentInput {
  patientId: string
  professionalId: string
  startsAt: string   // ISO UTC
  endsAt: string
  status: Appointment['status']
  notes?: string | null
  roomId?: string | null
  chargeAmountCents?: number | null
  professionalFeeCents?: number | null
  serviceTypeId?: string | null
}

export function useAppointmentMutations() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  const invalidate = () => qc.invalidateQueries({ queryKey: QK.appointments.all() })

  const create = useMutation({
    mutationFn: async (input: AppointmentInput) => {
      const { data, error } = await supabase
        .from('appointments')
        .insert({
          clinic_id:               profile!.clinicId!,
          patient_id:              input.patientId,
          professional_id:         input.professionalId,
          starts_at:               input.startsAt,
          ends_at:                 input.endsAt,
          status:                  input.status,
          notes:                   input.notes ?? null,
          room_id:                 input.roomId ?? null,
          charge_amount_cents:     input.chargeAmountCents ?? null,
          professional_fee_cents:  input.professionalFeeCents ?? null,
          service_type_id:         input.serviceTypeId ?? null,
        })
        .select(`*, patient:patients(id,name,phone), professional:professionals(id,name,specialty), clinic_room:clinic_rooms(id,name,color)`)
        .single()
      if (error) throw error
      return mapAppointment(data as Record<string, unknown>)
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, ...input }: AppointmentInput & { id: string }) => {
      const { data, error } = await supabase
        .from('appointments')
        .update({
          patient_id:              input.patientId,
          professional_id:         input.professionalId,
          starts_at:               input.startsAt,
          ends_at:                 input.endsAt,
          status:                  input.status,
          notes:                   input.notes ?? null,
          room_id:                 input.roomId ?? null,
          service_type_id:         input.serviceTypeId ?? null,
          charge_amount_cents:     input.chargeAmountCents ?? null,
          professional_fee_cents:  input.professionalFeeCents ?? null,
        })
        .eq('id', id)
        .select(`*, patient:patients(id,name,phone), professional:professionals(id,name,specialty), clinic_room:clinic_rooms(id,name,color)`)
        .single()
      if (error) throw error
      return mapAppointment(data as Record<string, unknown>)
    },
    onSuccess: invalidate,
  })

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { create, update, cancel }
}

/** Lightweight mutation for quick status changes (e.g. "Chegou", "Realizado", "Falta")
 *  without needing all appointment fields. */
export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) => {
      const { error } = await supabase
        .from('appointments')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.appointments.all() })
      queryClient.invalidateQueries({ queryKey: QK.appointments.todayAll() })
      queryClient.invalidateQueries({ queryKey: QK.dashboard.clinicKPIsAll() })
    },
  })
}
