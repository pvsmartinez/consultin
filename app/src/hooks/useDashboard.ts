import { useQuery } from '@tanstack/react-query'
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from 'date-fns'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'

// ─── Today's appointments list (for ClinicDashboard) ────────────────────────

export interface TodayAppointment {
  id: string
  starts_at: string
  status: string
  patient: { name: string } | { name: string }[] | null
  professional: { name: string } | { name: string }[] | null
}

export function useTodayAppointments() {
  const { profile } = useAuthContext()
  return useQuery({
    queryKey: ['today-appointments', profile?.clinicId ?? null],
    enabled: !!profile?.clinicId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = new Date()
      const { data } = await supabase
        .from('appointments')
        .select('id, starts_at, status, patient:patients(name), professional:professionals(name)')
        .gte('starts_at', startOfDay(now).toISOString())
        .lte('starts_at', endOfDay(now).toISOString())
        .neq('status', 'cancelled')
        .order('starts_at', { ascending: true })
      return (data ?? []) as TodayAppointment[]
    },
  })
}

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

      // Revenue uses RPC clinic_month_revenue (0026) — SUM happens in SQL,
      // no need to download all paid rows to the browser just to reduce() them.
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

        supabase.rpc('clinic_month_revenue', {
          p_month_start: monthStart,
          p_month_end:   monthEnd,
        }),
      ])

      return {
        todayCount:    todayResult.count ?? 0,
        totalPatients: patientsResult.count ?? 0,
        monthRevenue:  (revenueResult.data as unknown as number) ?? 0,
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
          .select('id, starts_at, status, patient_id, patient:patients(id, name)')
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

// ─── Professionals working today (admin dashboard widget) ─────────────────────

export interface ProfessionalToday {
  id: string
  name: string
  specialty: string | null
  appointmentCount: number
  nextAt: string | null
}

export function useProfessionalsToday() {
  const { profile } = useAuthContext()
  return useQuery<ProfessionalToday[]>({
    queryKey: ['professionals-today', profile?.clinicId ?? null],
    enabled: !!profile?.clinicId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const now = new Date()
      const { data } = await supabase
        .from('appointments')
        .select('professional_id, starts_at, professional:professionals(id, name, specialty)')
        .gte('starts_at', startOfDay(now).toISOString())
        .lte('starts_at', endOfDay(now).toISOString())
        .neq('status', 'cancelled')
        .order('starts_at', { ascending: true })

      const map = new Map<string, ProfessionalToday>()
      for (const row of data ?? []) {
        const prof = Array.isArray(row.professional) ? row.professional[0] : row.professional
        if (!prof) continue
        const existing = map.get(prof.id as string)
        if (existing) {
          existing.appointmentCount++
        } else {
          map.set(prof.id as string, {
            id:               prof.id as string,
            name:             prof.name as string,
            specialty:        (prof.specialty as string) ?? null,
            appointmentCount: 1,
            nextAt:           row.starts_at as string,
          })
        }
      }
      return Array.from(map.values())
    },
  })
}

// ─── Clinic alerts (action-required items) ────────────────────────────────────

export interface ClinicAlert {
  type: 'unconfirmed' | 'no_show' | 'overdue_payment'
  count: number
  label: string
  link: string
}

export function useClinicAlerts() {
  const { profile } = useAuthContext()
  return useQuery<ClinicAlert[]>({
    queryKey: ['clinic-alerts', profile?.clinicId ?? null],
    enabled: !!profile?.clinicId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const now = new Date()
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      const yesterday = subDays(now, 1)

      const [unconfirmedRes, noShowRes, overdueRes] = await Promise.all([
        // Scheduled (not yet confirmed) appointments created more than 2h ago
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'scheduled')
          .gte('starts_at', startOfDay(now).toISOString())
          .lte('starts_at', endOfDay(now).toISOString())
          .lte('created_at', twoHoursAgo.toISOString()),

        // No-shows from yesterday
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'no_show')
          .gte('starts_at', startOfDay(yesterday).toISOString())
          .lte('starts_at', endOfDay(yesterday).toISOString()),

        // Completed appointments with unpaid charge (charge > 0, paid = null)
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .not('charge_amount_cents', 'is', null)
          .is('paid_amount_cents', null),
      ])

      const alerts: ClinicAlert[] = []
      const unc = unconfirmedRes.count ?? 0
      const nos = noShowRes.count ?? 0
      const ovd = overdueRes.count ?? 0

      if (unc > 0) alerts.push({ type: 'unconfirmed', count: unc, label: `${unc} consulta${unc > 1 ? 's' : ''} de hoje ainda sem confirmação`, link: '/agenda' })
      if (nos > 0) alerts.push({ type: 'no_show', count: nos, label: `${nos} falta${nos > 1 ? 's' : ''} ontem sem retorno`, link: '/agenda' })
      if (ovd > 0) alerts.push({ type: 'overdue_payment', count: ovd, label: `${ovd} consulta${ovd > 1 ? 's' : ''} realizada${ovd > 1 ? 's' : ''} com pagamento pendente`, link: '/financeiro' })

      return alerts
    },
  })
}
