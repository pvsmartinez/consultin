import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { useAuthContext } from '../contexts/AuthContext'
import type { ClinicRoom } from '../types'

function mapRow(r: Record<string, unknown>): ClinicRoom {
  return {
    id:        r.id as string,
    clinicId:  r.clinic_id as string,
    name:      r.name as string,
    color:     (r.color as string) ?? '#6366f1',
    active:    (r.active as boolean) ?? true,
    createdAt: r.created_at as string,
  }
}

export function useRooms() {
  const { profile } = useAuthContext()
  return useQuery({
    queryKey: QK.rooms.list(profile?.clinicId),
    enabled: !!profile?.clinicId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_rooms')
        .select('*')
        .eq('clinic_id', profile!.clinicId!)
        .order('name')
      if (error) throw error
      return (data ?? []).map(r => mapRow(r as Record<string, unknown>))
    },
  })
}

export function useCreateRoom() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (input: { name: string; color: string }) => {
      const { data, error } = await supabase
        .from('clinic_rooms')
        .insert({ clinic_id: profile!.clinicId!, name: input.name, color: input.color })
        .select()
        .single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.rooms.list(profile?.clinicId) }),
  })
}

export function useUpdateRoom() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (input: { id: string; name: string; color: string; active: boolean }) => {
      const { data, error } = await supabase
        .from('clinic_rooms')
        .update({ name: input.name, color: input.color, active: input.active })
        .eq('id', input.id)
        .select()
        .single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.rooms.list(profile?.clinicId) }),
  })
}

export function useDeleteRoom() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clinic_rooms').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.rooms.list(profile?.clinicId) }),
  })
}
