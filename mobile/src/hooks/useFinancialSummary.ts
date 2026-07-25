import { useQuery } from '@tanstack/react-query'
import { startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import { QK } from '../lib/queryKeys'
import type { Appointment } from '../types'

export interface FinancialSummary {
  rows: Appointment[]
  totalChargeCents: number
  totalPaidCents: number
  pendingCount: number
}

function mapRow(row: Record<string, unknown>): Appointment {
  return {
    id:                row.id as string,
    clinicId:          row.clinic_id as string,
    patientId:         row.patient_id as string,
    professionalId:    row.professional_id as string,
    startsAt:          row.starts_at as string,
    endsAt:            row.ends_at as string,
    status:            row.status as Appointment['status'],
    notes:             null,
    chargeAmountCents: (row.charge_amount_cents as number) ?? null,
    paidAmountCents:   (row.paid_amount_cents as number) ?? null,
    paidAt:            (row.paid_at as string) ?? null,
    paymentMethod:     (row.payment_method as string) ?? null,
    createdAt:         row.created_at as string,
    patient: (row.patient as Record<string, unknown> | null)
      ? { id: (row.patient as Record<string, unknown>).id as string, name: (row.patient as Record<string, unknown>).name as string, phone: null }
      : undefined,
  }
}

export function useFinancialSummary(month: Date) {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId
  const monthStart = startOfMonth(month).toISOString()
  const monthEnd   = endOfMonth(month).toISOString()

  return useQuery({
    queryKey: QK.financial.monthly(clinicId, monthStart),
    staleTime: 60_000,
    enabled: !!clinicId,
    queryFn: async (): Promise<FinancialSummary> => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, clinic_id, patient_id, professional_id, starts_at, ends_at, status, charge_amount_cents, paid_amount_cents, paid_at, payment_method, created_at, patient:patients(id, name)')
        .eq('clinic_id', clinicId!)
        .gte('starts_at', monthStart)
        .lte('starts_at', monthEnd)
        .not('status', 'in', '("cancelled","no_show")')
        .order('starts_at', { ascending: false })
      if (error) throw error

      const rows = (data ?? []).map(r => mapRow(r as unknown as Record<string, unknown>))
      const totalChargeCents = rows.reduce((s, r) => s + (r.chargeAmountCents ?? 0), 0)
      const totalPaidCents   = rows.reduce((s, r) => s + (r.paidAmountCents ?? 0), 0)
      const pendingCount     = rows.filter(r => r.status !== 'completed').length

      return { rows, totalChargeCents, totalPaidCents, pendingCount }
    },
  })
}
