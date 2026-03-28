import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { useAuthContext } from '../contexts/AuthContext'
import type { RoomAvailabilitySlot } from '../types'
import type { Json } from '../types/database'

function mapRow(r: Record<string, unknown>): RoomAvailabilitySlot {
  return {
    id:         r.id as string,
    clinicId:   r.clinic_id as string,
    roomId:     r.room_id as string,
    weekday:    r.weekday as RoomAvailabilitySlot['weekday'],
    startTime:  r.start_time as string,
    endTime:    r.end_time as string,
    active:     r.active as boolean,
    weekParity: (r.week_parity as string | null) ?? null,
  }
}

/**
 * All room_availability_slots for the current clinic.
 * Filter client-side by roomId when you only need one room's schedule.
 */
export function useRoomAvailabilitySlots() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()

  const query = useQuery({
    queryKey: QK.rooms.availability(profile?.clinicId),
    enabled: !!profile?.clinicId,
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<RoomAvailabilitySlot[]> => {
      const { data, error } = await supabase
        .from('room_availability_slots')
        .select('*')
        .order('room_id')
        .order('weekday')
        .order('start_time')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => mapRow(r))
    },
  })

  const upsert = useMutation({
    mutationFn: async ({
      roomId,
      slots,
    }: {
      roomId: string
      slots: Omit<RoomAvailabilitySlot, 'id' | 'clinicId'>[]
    }) => {
      const { error } = await supabase.rpc('upsert_room_availability_slots', {
        p_room_id:   roomId,
        p_clinic_id: profile!.clinicId!,
        p_slots: slots.map(s => ({
          weekday:     s.weekday,
          start_time:  s.startTime,
          end_time:    s.endTime,
          active:      s.active,
          week_parity: s.weekParity ?? null,
        })) as Json[],
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.rooms.availability(profile?.clinicId) }),
  })

  return { ...query, upsert }
}

// ── Room Closures ─────────────────────────────────────────────────────────────

export interface RoomClosure {
  id:        string
  roomId:    string
  clinicId:  string
  startsAt:  string   // 'YYYY-MM-DD'
  endsAt:    string   // 'YYYY-MM-DD'
  reason:    string | null
  createdAt: string
}

export function useRoomClosures(roomId: string) {
  const qc = useQueryClient()
  const { profile } = useAuthContext()

  const query = useQuery({
    queryKey: QK.rooms.closures(roomId),
    enabled: !!roomId,
    staleTime: 60_000,
    queryFn: async (): Promise<RoomClosure[]> => {
      const { data, error } = await supabase
        .from('room_closures')
        .select('*')
        .eq('room_id', roomId)
        .order('starts_at')
      if (error) throw error
      return (data ?? []).map((r) => ({
        id:        r.id,
        roomId:    r.room_id,
        clinicId:  r.clinic_id,
        startsAt:  r.starts_at,
        endsAt:    r.ends_at,
        reason:    r.reason ?? null,
        createdAt: r.created_at,
      }))
    },
  })

  const add = useMutation({
    mutationFn: async (input: { startsAt: string; endsAt: string; reason?: string }) => {
      const { error } = await supabase.from('room_closures').insert({
        room_id:   roomId,
        clinic_id: profile!.clinicId!,
        starts_at: input.startsAt,
        ends_at:   input.endsAt,
        reason:    input.reason ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.rooms.closures(roomId) }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('room_closures').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.rooms.closures(roomId) }),
  })

  return { ...query, add, remove }
}

/**
 * Clinic-wide availability slots for ALL professionals.
 * Used by AppointmentsPage to build per-resource businessHours for the calendar.
 */
export function useClinicAvailabilitySlots() {
  const { profile } = useAuthContext()
  return useQuery({
    queryKey: QK.rooms.clinicAvailability(profile?.clinicId),
    enabled: !!profile?.clinicId,
    staleTime: 60_000,
    queryFn: async (): Promise<Array<{
      professional_id: string
      weekday: number
      start_time: string
      end_time: string
      active: boolean
      week_parity: string | null
    }>> => {
      const { data, error } = await supabase
        .from('availability_slots')
        .select('professional_id, weekday, start_time, end_time, active, week_parity')
        .eq('active', true)
      if (error) throw error
      return (data ?? []) as Array<{
        professional_id: string
        weekday: number
        start_time: string
        end_time: string
        active: boolean
        week_parity: string | null
      }>
    },
  })
}
