import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { useAuthContext } from '../contexts/AuthContext'
import { mapProfessional } from '../utils/mappers'
import type { Json, ProfessionalInput } from '../types'
import type { Professional } from '../types'

export { mapProfessional }

export function useProfessionals() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()

  const query = useQuery({
    queryKey: QK.professionals.list(profile?.clinicId),
    staleTime: 2 * 60_000,
    enabled: !!profile?.clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professionals')
        .select('*')
        .eq('clinic_id', profile!.clinicId!)
        .order('name')
      if (error) throw error
      return (data ?? []).map(r => mapProfessional(r as Record<string, unknown>))
    },
  })

  const create = useMutation({
    mutationFn: async (input: ProfessionalInput) => {
      const { data, error } = await supabase
        .from('professionals')
        .insert({
          clinic_id:     profile!.clinicId!,
          name:          input.name,
          specialty:     input.specialty,
          council_id:    input.councilId,
          phone:         input.phone,
          email:         input.email,
          active:        input.active,
          custom_fields: (input.customFields ?? {}) as Json,
          ...(input.userId !== undefined ? { user_id: input.userId } : {}),
        })
        .select()
        .single()
      if (error) throw error
      return mapProfessional(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.professionals.list(profile?.clinicId) }),
  })

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Professional> & { id: string }) => {
      const { data, error } = await supabase
        .from('professionals')
        .update({
          name:          input.name,
          specialty:     input.specialty,
          council_id:    input.councilId,
          phone:         input.phone,
          email:         input.email,
          photo_url:     input.photoUrl,
          bio:           input.bio,
          active:        input.active,
          custom_fields: (input.customFields ?? {}) as Json,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return mapProfessional(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.professionals.list(profile?.clinicId) }),
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('professionals')
        .update({ active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.professionals.list(profile?.clinicId) }),
  })

  return { ...query, create, update, toggleActive, isLoading: query.isPending && query.isFetching }
}
