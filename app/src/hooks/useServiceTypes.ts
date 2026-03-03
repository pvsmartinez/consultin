import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import { mapServiceType } from '../utils/mappers'
import type { ServiceType, ServiceTypeInput } from '../types'
import type { Database } from '../types/database'

export function useServiceTypes() {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  return useQuery<ServiceType[]>({
    queryKey: ['service-types', clinicId],
    enabled: !!clinicId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_types')
        .select('*')
        .eq('clinic_id', clinicId!)
        .order('name')
      if (error) throw error
      return (data as Record<string, unknown>[] ?? []).map(r => mapServiceType(r))
    },
  })
}

export function useCreateServiceType() {
  const { profile } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: ServiceTypeInput) => {
      const { data, error } = await supabase
        .from('service_types')
        .insert({
          clinic_id:        profile!.clinicId!,
          name:             input.name,
          duration_minutes: input.durationMinutes,
          price_cents:      input.priceCents ?? null,
          color:            input.color,
          active:           input.active,
        })
        .select()
        .single()
      if (error) throw error
      return mapServiceType(data as Record<string, unknown>)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-types', profile?.clinicId] })
    },
  })
}

export function useUpdateServiceType() {
  const { profile } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<ServiceTypeInput> & { id: string }) => {
      const update: Record<string, unknown> = {}
      if (input.name             !== undefined) update.name             = input.name
      if (input.durationMinutes  !== undefined) update.duration_minutes = input.durationMinutes
      if (input.priceCents       !== undefined) update.price_cents      = input.priceCents
      if (input.color            !== undefined) update.color            = input.color
      if (input.active           !== undefined) update.active           = input.active

      const { data, error } = await supabase
        .from('service_types')
        .update(update as Database['public']['Tables']['service_types']['Update'])
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return mapServiceType(data as Record<string, unknown>)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-types', profile?.clinicId] })
    },
  })
}

export function useDeleteServiceType() {
  const { profile } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_types')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-types', profile?.clinicId] })
    },
  })
}
