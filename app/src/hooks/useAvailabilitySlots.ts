import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import type { AvailabilitySlot } from '../types'
import type { Json } from '../types/database'

function mapRow(r: Record<string, unknown>): AvailabilitySlot {
  return {
    id:             r.id as string,
    clinicId:       r.clinic_id as string,
    professionalId: r.professional_id as string,
    weekday:        r.weekday as AvailabilitySlot['weekday'],
    startTime:      r.start_time as string,
    endTime:        r.end_time as string,
    active:         r.active as boolean,
    roomId:         (r.room_id as string) ?? null,
    weekParity:     (r.week_parity as 'even' | 'odd' | null) ?? null,
  }
}

export function useAvailabilitySlots(professionalId: string, clinicIdOverride?: string) {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  const key = ['availability-slots', professionalId]

  const query = useQuery({
    queryKey: key,
    enabled: !!professionalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('availability_slots')
        .select('*')
        .eq('professional_id', professionalId)
        .order('weekday')
        .order('start_time')
      if (error) throw error
      return (data ?? []).map(r => mapRow(r as Record<string, unknown>))
    },
  })

  const upsert = useMutation({
    mutationFn: async (slots: Omit<AvailabilitySlot, 'id' | 'clinicId'>[]) => {
      // Atomic replacement via RPC (0026_rpc_availability_revenue_room.sql).
      // DELETE + INSERT run in a single DB transaction — no race condition,
      // no "zero availability" window if the connection drops mid-flight.
      const clinicId = clinicIdOverride ?? profile!.clinicId!
      const { error } = await supabase.rpc('upsert_availability_slots', {
        p_professional_id: professionalId,
        p_clinic_id:       clinicId,
        p_slots: slots.map(s => ({
          weekday:     s.weekday,
          start_time:  s.startTime,
          end_time:    s.endTime,
          active:      s.active,
          room_id:     s.roomId ?? null,
          week_parity: s.weekParity ?? null,
        })) as Json[],
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  return { ...query, upsert }
}
