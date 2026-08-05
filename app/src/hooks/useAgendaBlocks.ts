import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { useAuthContext } from '../contexts/AuthContext'

/** A period with no appointments: holiday, trip, lunch, meeting, other office. */
export interface AgendaBlock {
  id: string
  clinicId: string
  /** null = whole clinic (e.g. a holiday) */
  professionalId: string | null
  startsAt: string
  endsAt: string
  allDay: boolean
  reason: string | null
}

export interface AgendaBlockInput {
  professionalId: string | null
  startsAt: string
  endsAt: string
  allDay?: boolean
  reason?: string | null
}

function mapRow(r: Record<string, unknown>): AgendaBlock {
  return {
    id:             r.id as string,
    clinicId:       r.clinic_id as string,
    professionalId: (r.professional_id as string | null) ?? null,
    startsAt:       r.starts_at as string,
    endsAt:         r.ends_at as string,
    allDay:         (r.all_day as boolean) ?? false,
    reason:         (r.reason as string | null) ?? null,
  }
}

/**
 * Blocks overlapping [from, to). The bounds are compared inverted on purpose — a block
 * that started before the window and runs into it still has to show up, which a naive
 * `starts_at >= from` filter would drop.
 */
export function useAgendaBlocksQuery(from: string, to: string) {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  return useQuery({
    queryKey: QK.agendaBlocks.list(clinicId, from, to),
    enabled: !!clinicId,
    staleTime: 60_000,
    queryFn: async (): Promise<AgendaBlock[]> => {
      const { data, error } = await supabase
        .from('agenda_blocks')
        .select('id, clinic_id, professional_id, starts_at, ends_at, all_day, reason')
        .eq('clinic_id', clinicId!)
        .lt('starts_at', to)
        .gt('ends_at', from)
        .order('starts_at')
      if (error) throw error
      return (data ?? []).map(r => mapRow(r as Record<string, unknown>))
    },
  })
}

export function useAgendaBlockMutations() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId
  const invalidate = () => qc.invalidateQueries({ queryKey: QK.agendaBlocks.all() })

  const create = useMutation({
    mutationFn: async (input: AgendaBlockInput) => {
      const { data, error } = await supabase
        .from('agenda_blocks')
        .insert({
          clinic_id:       clinicId!,
          professional_id: input.professionalId,
          starts_at:       input.startsAt,
          ends_at:         input.endsAt,
          all_day:         input.allDay ?? false,
          reason:          input.reason ?? null,
          created_by:      profile?.id ?? null,
        })
        .select('id, clinic_id, professional_id, starts_at, ends_at, all_day, reason')
        .single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('agenda_blocks')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
      if (error) throw error
      if (!data?.id) throw new Error('Não foi possível confirmar a remoção do bloqueio')
    },
    onSuccess: invalidate,
  })

  return { create, remove }
}

/** The block covering `date`, if any — used to warn before booking over it. */
export function findBlockAt(
  blocks: AgendaBlock[],
  date: Date,
  professionalId?: string | null,
): AgendaBlock | null {
  const at = date.getTime()
  return blocks.find(block => {
    if (block.professionalId && professionalId && block.professionalId !== professionalId) return false
    return new Date(block.startsAt).getTime() <= at && new Date(block.endsAt).getTime() > at
  }) ?? null
}
