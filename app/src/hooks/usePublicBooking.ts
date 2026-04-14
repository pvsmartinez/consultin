import { useMutation, useQuery } from '@tanstack/react-query'
import { publicSupabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'

export interface PublicBookingSlot {
  professionalId: string
  professionalName: string
  specialty: string | null
  startsAt: string
  endsAt: string
  displayDate: string
  displayTime: string
}

export interface SubmitPublicBookingInput {
  slug: string
  patientName: string
  patientPhone: string
  patientEmail?: string
  professionalId: string
  startsAt: string
  endsAt: string
  serviceTypeId?: string
  notes?: string
}

export function usePublicBookingSlots(
  slug: string | undefined,
  date: string,
  professionalId: string,
  serviceTypeId: string,
) {
  return useQuery<PublicBookingSlot[]>({
    queryKey: QK.publicBooking.slots(slug, date, professionalId, serviceTypeId),
    enabled: !!slug && !!date,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await publicSupabase.functions.invoke('public-booking', {
        body: {
          action: 'slots',
          slug,
          date,
          professionalId: professionalId || undefined,
          serviceTypeId: serviceTypeId || undefined,
        },
      })
      if (error) throw new Error(error.message)
      if (!data?.ok) throw new Error(data?.error || 'Erro ao buscar horários')
      return (data.slots ?? []) as PublicBookingSlot[]
    },
  })
}

export function useSubmitPublicBooking() {
  return useMutation({
    mutationFn: async (input: SubmitPublicBookingInput) => {
      const { data, error } = await publicSupabase.functions.invoke('public-booking', {
        body: {
          action: 'book',
          ...input,
        },
      })
      if (error) throw new Error(error.message)
      if (!data?.ok) throw new Error(data?.error || 'Erro ao criar agendamento')
      return data as {
        ok: true
        appointmentId: string
        patientId: string
        patientName: string
        startsAt: string
        professionalName: string
      }
    },
  })
}
