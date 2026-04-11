import { useQuery } from '@tanstack/react-query'
import { startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { useAuthContext } from '../contexts/AuthContext'

// ─── Report data for a given month + optional professional filter ──────────────

export function useReportData(month: Date, professionalId: string) {
  const { profile } = useAuthContext()
  const clinicId   = profile?.clinicId
  const monthStart = startOfMonth(month).toISOString()
  const monthEnd   = endOfMonth(month).toISOString()

  return useQuery({
    queryKey: QK.financial.report(clinicId, monthStart, professionalId),
    staleTime: 5 * 60_000,
    enabled: !!clinicId,
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select(`
          id, starts_at, status, notes,
          charge_amount_cents, paid_amount_cents, paid_at,
          patient:patients(id, name),
          professional:professionals(id, name)
        `)
        .eq('clinic_id', clinicId!)
        .gte('starts_at', monthStart)
        .lte('starts_at', monthEnd)
        .order('starts_at')
      if (professionalId) q = q.eq('professional_id', professionalId)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
}
