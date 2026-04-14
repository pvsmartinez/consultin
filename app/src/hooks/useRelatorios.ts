import { useQuery } from '@tanstack/react-query'
import { endOfDay, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { useAuthContext } from '../contexts/AuthContext'

type SnapshotRow = {
  status: string
  charge_amount_cents: number | null
  paid_amount_cents: number | null
  patient_id: string | null
  patient: { id: string; created_at: string | null } | null
  professional: { id: string; name: string } | null
}

const SNAPSHOT_PAGE_SIZE = 1000

export interface ReportPeriodSummary {
  label: string
  totalAppointments: number
  completedCount: number
  cancelledCount: number
  totalChargedCents: number
  totalPaidCents: number
  uniquePatients: number
  newPatients: number
  topProfessionalName: string | null
  topProfessionalCount: number
}

function buildPeriodSummary(label: string, rows: SnapshotRow[], newPatients: number): ReportPeriodSummary {
  const professionalCounts = new Map<string, { name: string; count: number }>()
  for (const row of rows) {
    if (!row.professional?.id) continue
    const current = professionalCounts.get(row.professional.id)
    professionalCounts.set(row.professional.id, {
      name: row.professional.name,
      count: (current?.count ?? 0) + 1,
    })
  }

  const topProfessional = [...professionalCounts.values()].sort((a, b) => b.count - a.count)[0] ?? null

  return {
    label,
    totalAppointments: rows.length,
    completedCount: rows.filter(row => row.status === 'completed').length,
    cancelledCount: rows.filter(row => ['cancelled', 'no_show'].includes(row.status)).length,
    totalChargedCents: rows.reduce((sum, row) => sum + (row.charge_amount_cents ?? 0), 0),
    totalPaidCents: rows.reduce((sum, row) => sum + (row.paid_amount_cents ?? 0), 0),
    uniquePatients: new Set(rows.map(row => row.patient_id).filter(Boolean)).size,
    newPatients,
    topProfessionalName: topProfessional?.name ?? null,
    topProfessionalCount: topProfessional?.count ?? 0,
  }
}

async function loadSnapshotAppointments(
  clinicId: string,
  from: string,
  to: string,
  professionalId?: string,
): Promise<SnapshotRow[]> {
  const rows: SnapshotRow[] = []

  for (let page = 0; ; page += 1) {
    let query = supabase
      .from('appointments')
      .select('status, charge_amount_cents, paid_amount_cents, patient_id, patient:patients(id, created_at), professional:professionals(id, name)')
      .eq('clinic_id', clinicId)
      .gte('starts_at', from)
      .lte('starts_at', to)
      .order('starts_at', { ascending: true })
      .range(page * SNAPSHOT_PAGE_SIZE, ((page + 1) * SNAPSHOT_PAGE_SIZE) - 1)

    if (professionalId) query = query.eq('professional_id', professionalId)

    const { data, error } = await query
    if (error) throw error

    const batch = (data ?? []) as SnapshotRow[]
    rows.push(...batch)

    if (batch.length < SNAPSHOT_PAGE_SIZE) break
  }

  return rows
}

async function loadNewPatientsCount(
  clinicId: string,
  from: string,
  to: string,
  rows: SnapshotRow[],
  professionalId?: string,
): Promise<number> {
  if (professionalId) {
    return new Set(
      rows
        .filter(row => {
          const createdAt = row.patient?.created_at
          return !!createdAt && createdAt >= from && createdAt <= to
        })
        .map(row => row.patient_id)
        .filter(Boolean),
    ).size
  }

  const { count, error } = await supabase
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .gte('created_at', from)
    .lte('created_at', to)

  if (error) throw error
  return count ?? 0
}

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

export function useAdministrativeSnapshots(referenceDate = new Date(), professionalId = '') {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId
  const refKey = format(referenceDate, 'yyyy-MM-dd')

  return useQuery({
    queryKey: QK.financial.adminSummary(clinicId, refKey, professionalId),
    staleTime: 60_000,
    enabled: !!clinicId,
    queryFn: async () => {
      const todayStart = startOfDay(referenceDate).toISOString()
      const todayEnd = endOfDay(referenceDate).toISOString()
      const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 }).toISOString()
      const weekEnd = endOfWeek(referenceDate, { weekStartsOn: 1 }).toISOString()
      const monthStart = startOfMonth(referenceDate).toISOString()
      const monthEnd = endOfMonth(referenceDate).toISOString()

      const [todayRows, weekRows, monthRows] = await Promise.all([
        loadSnapshotAppointments(clinicId!, todayStart, todayEnd, professionalId || undefined),
        loadSnapshotAppointments(clinicId!, weekStart, weekEnd, professionalId || undefined),
        loadSnapshotAppointments(clinicId!, monthStart, monthEnd, professionalId || undefined),
      ])

      const [newPatientsToday, newPatientsWeek, newPatientsMonth] = await Promise.all([
        loadNewPatientsCount(clinicId!, todayStart, todayEnd, todayRows, professionalId || undefined),
        loadNewPatientsCount(clinicId!, weekStart, weekEnd, weekRows, professionalId || undefined),
        loadNewPatientsCount(clinicId!, monthStart, monthEnd, monthRows, professionalId || undefined),
      ])

      return {
        today: buildPeriodSummary('Hoje', todayRows, newPatientsToday),
        week: buildPeriodSummary('Semana', weekRows, newPatientsWeek),
        month: buildPeriodSummary('Mês', monthRows, newPatientsMonth),
      }
    },
  })
}
