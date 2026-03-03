import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import type { WhatsappFaq } from '../types'

function mapFaq(r: Record<string, unknown>): WhatsappFaq {
  return {
    id:         r.id as string,
    clinicId:   r.clinic_id as string,
    question:   r.question as string,
    answer:     r.answer as string,
    active:     (r.active as boolean) ?? true,
    sortOrder:  (r.sort_order as number) ?? 0,
    createdAt:  r.created_at as string,
  }
}

export function useWhatsappFaqs() {
  const { profile } = useAuthContext()
  return useQuery<WhatsappFaq[]>({
    queryKey: ['whatsapp-faqs', profile?.clinicId],
    enabled: !!profile?.clinicId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('whatsapp_faqs')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      return (data as Record<string, unknown>[] ?? []).map(mapFaq)
    },
  })
}

export function useCreateWhatsappFaq() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (input: { question: string; answer: string }) => {
      const { data, error } = await (supabase as any)
        .from('whatsapp_faqs')
        .insert({ question: input.question, answer: input.answer })
        .select()
        .single()
      if (error) throw error
      return mapFaq(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-faqs', profile?.clinicId] }),
  })
}

export function useUpdateWhatsappFaq() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Pick<WhatsappFaq, 'question' | 'answer' | 'active' | 'sortOrder'>> & { id: string }) => {
      const patch: Record<string, unknown> = {}
      if (input.question !== undefined) patch.question   = input.question
      if (input.answer   !== undefined) patch.answer     = input.answer
      if (input.active   !== undefined) patch.active     = input.active
      if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder
      const { error } = await (supabase as any).from('whatsapp_faqs').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-faqs', profile?.clinicId] }),
  })
}

export function useDeleteWhatsappFaq() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('whatsapp_faqs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-faqs', profile?.clinicId] }),
  })
}
