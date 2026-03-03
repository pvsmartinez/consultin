import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import { mapAppointment } from '../utils/mappers'
import type { Appointment } from '../types'

/** Returns ALL professional records for the current user across all their clinics.
 *  Uses user_clinic_memberships (fast) and falls back to email match for legacy records. */
export interface ProfessionalRecord { id: string; clinicId: string; clinicName: string | null }

export function useMyProfessionalRecords() {
  const { session } = useAuthContext()
  const email = session?.user.email
  return useQuery({
    queryKey: ['my-professional-records', session?.user.id],
    enabled: !!session?.user.id,
    staleTime: 60_000, // 1 min — runs on every page via AppLayout, cache it
    queryFn: async (): Promise<ProfessionalRecord[]> => {
      // Primary: direct user_id on professionals table (works for any role)
      const { data: direct } = await supabase
        .from('professionals')
        .select('id, clinic_id, clinics(id, name)')
        .eq('user_id', session!.user.id)
        .eq('active', true)

      if (direct && direct.length > 0) {
        return direct.map(r => ({
          id:        r.id as string,
          clinicId:  r.clinic_id as string,
          clinicName: ((r.clinics as { name?: string } | null)?.name) ?? null,
        }))
      }

      // Secondary: user_clinic_memberships → professional_id (multi-clinic professionals)
      const { data: memberships } = await supabase
        .from('user_clinic_memberships')
        .select('professional_id, clinic_id, clinics(id, name)')
        .eq('user_id', session!.user.id)
        .eq('active', true)
        .not('professional_id', 'is', null)

      if (memberships && memberships.length > 0) {
        return (memberships as Array<{
          professional_id: string
          clinic_id: string
          clinics: { name?: string } | null
        }>).map(m => ({
          id:        m.professional_id,
          clinicId:  m.clinic_id,
          clinicName: m.clinics?.name ?? null,
        }))
      }

      // Fallback: email match (legacy records without user_id)
      if (!email) return []
      const { data: byEmail } = await supabase
        .from('professionals')
        .select('id, clinic_id, clinics(id, name)')
        .ilike('email', email)
        .eq('active', true)
      return (byEmail ?? []).map(r => ({
        id:        r.id as string,
        clinicId:  r.clinic_id as string,
        clinicName: ((r.clinics as { name?: string } | null)?.name) ?? null,
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
  const ids = professionalFilter
    ? Array.isArray(professionalFilter) ? professionalFilter : [professionalFilter]
    : null

  return useQuery({
    queryKey: ['appointments', startsFrom, startsUntil, ids ?? 'all'],
    // Skip query when ids is an explicit empty array (personal view before prof records load,
    // or professional with no linked record) — prevents leaking all-clinic appointments.
    enabled: ids === null || ids.length > 0,
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select(`*, patient:patients(id,name,phone), professional:professionals(id,name,specialty), clinic_room:clinic_rooms(id,name,color), clinics(id,name)`)
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
}

export function useAppointmentMutations() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['appointments'] })

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
