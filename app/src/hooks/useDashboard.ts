import { useQuery } from '@tanstack/react-query'
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'

// ─── Clinic KPIs (admin / receptionist) ───────────────────────────────────────

export function useClinicKPIs() {
  const { profile } = useAuthContext()
  return useQuery({
    queryKey: ['dashboard-clinic-kpis', profile?.clinicId ?? null],
    // Super admins without a clinic selected must not run this query
    enabled: !!profile?.clinicId,
    staleTime: 60_000,
    queryFn: async () => {
      const now = new Date()
      const todayStart = startOfDay(now).toISOString()
      const todayEnd = endOfDay(now).toISOString()
      const monthStart = startOfMonth(now).toISOString()
      const monthEnd = endOfMonth(now).toISOString()

      const [todayResult, patientsResult, revenueResult] = await Promise.all([
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .gte('starts_at', todayStart)
          .lte('starts_at', todayEnd)
          .neq('status', 'cancelled'),

        supabase
          .from('patients')
          .select('id', { count: 'exact', head: true }),

        supabase
          .from('appointments')
          .select('paid_amount_cents')
          .gte('starts_at', monthStart)
          .lte('starts_at', monthEnd)
          .eq('status', 'completed')
          .not('paid_amount_cents', 'is', null),
      ])

      const monthRevenueCents = (revenueResult.data ?? []).reduce(
        (sum, row) => sum + ((row.paid_amount_cents as number) ?? 0),
        0,
      )

      return {
        todayCount:    todayResult.count ?? 0,
        totalPatients: patientsResult.count ?? 0,
        monthRevenue:  monthRevenueCents,
      }
    },
  })
}

// ─── Professional KPIs ────────────────────────────────────────────────────────

export function useProfessionalKPIs(email: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard-professional-kpis', userId ?? email],
    enabled: !!(userId || email),
    staleTime: 60_000,
    queryFn: async () => {
      type ProfRow = { id: string; name: string; specialty: string | null }
      // Primary: match by user_id — immune to email casing/formatting differences
      let prof: ProfRow | null = null
      if (userId) {
        const { data } = await supabase
          .from('professionals')
          .select('id, name, specialty')
          .eq('user_id', userId)
          .eq('active', true)
          .maybeSingle()
        prof = data as unknown as ProfRow | null
      }
      // Fallback: email match (legacy records without user_id)
      if (!prof && email) {
        const { data } = await supabase
          .from('professionals')
          .select('id, name, specialty')
          .ilike('email', email)
          .maybeSingle()
        prof = data as unknown as ProfRow | null
      }

      if (!prof) return { profId: null, profName: null, specialty: null, todayCount: 0, patientsCount: 0, upcoming: [] }

      const now = new Date()
      const todayStart = startOfDay(now).toISOString()
      const todayEnd = endOfDay(now).toISOString()

      const [todayResult, patientsResult, upcomingResult] = await Promise.all([
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', prof.id)
          .gte('starts_at', todayStart)
          .lte('starts_at', todayEnd)
          .neq('status', 'cancelled'),

        // COUNT(DISTINCT patient_id) via RPC — avoids downloading all rows to JS
        supabase.rpc('professional_patient_count', { p_professional_id: prof.id }),

        supabase
          .from('appointments')
          .select('id, starts_at, status, patient:patients(name)')
          .eq('professional_id', prof.id)
          .gte('starts_at', now.toISOString())
          .in('status', ['scheduled', 'confirmed'])
          .order('starts_at', { ascending: true })
          .limit(5),
      ])

      const uniquePatients = (patientsResult.data as unknown as number) ?? 0

      return {
        profId:        prof.id as string,
        profName:      prof.name as string,
        specialty:     prof.specialty as string | null,
        todayCount:    todayResult.count ?? 0,
        patientsCount: uniquePatients,
        upcoming:      upcomingResult.data ?? [],
      }
    },
  })
}
