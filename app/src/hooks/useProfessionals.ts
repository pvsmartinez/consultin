import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import type { Json, ProfessionalInput } from '../types'
import type { Professional } from '../types'

function mapRow(r: Record<string, unknown>): Professional {
  return {
    id:           r.id as string,
    clinicId:     r.clinic_id as string,
    userId:       (r.user_id as string) ?? null,
    name:         r.name as string,
    specialty:    (r.specialty as string) ?? null,
    councilId:    (r.council_id as string) ?? null,
    phone:        (r.phone as string) ?? null,
    email:        (r.email as string) ?? null,
    active:       r.active as boolean,
    customFields: (r.custom_fields as Record<string, unknown>) ?? {},
    createdAt:    r.created_at as string,
  }
}

export function useProfessionals() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()

  const query = useQuery({
    queryKey: ['professionals', profile?.clinicId ?? null],
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professionals')
        .select('*')
        .order('name')
      if (error) throw error
      return (data ?? []).map(r => mapRow(r as Record<string, unknown>))
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
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professionals', profile?.clinicId ?? null] }),
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
          active:        input.active,
          custom_fields: (input.customFields ?? {}) as Json,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professionals', profile?.clinicId ?? null] }),
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('professionals')
        .update({ active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professionals', profile?.clinicId ?? null] }),
  })

  return { ...query, create, update, toggleActive }
}
