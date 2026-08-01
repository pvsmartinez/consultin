import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { mapAppointment } from '../utils/mappers'
import { TZ_BR } from '../utils/date'
import { useAuthContext } from '../contexts/AuthContext'
import type { Appointment } from '../types'

export interface FinancialRow extends Appointment {
  patient?: { id: string; name: string; phone: string | null; cpf: string | null }
  professional?: { id: string; name: string; specialty: string | null }
}

export function useFinancial(month: Date) {
  // Compute month boundaries in São Paulo so the starts_at filter doesn't
  // include/exclude edge hours when the browser is outside America/Sao_Paulo.
  const spYmd = formatInTimeZone(month.toISOString(), TZ_BR, 'yyyy-MM-dd')
  const spMonth = spYmd.slice(0, 7)
  const [y, m] = spMonth.split('-').map(Number)
  const lastDay = String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')
  const monthStart = fromZonedTime(`${spMonth}-01T00:00:00`, TZ_BR).toISOString()
  const monthEnd   = fromZonedTime(`${spMonth}-${lastDay}T23:59:59`, TZ_BR).toISOString()
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  return useQuery({
    queryKey: QK.financial.monthly(clinicId, monthStart),
    staleTime: 60_000,
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, clinic_id, patient_id, professional_id, starts_at, ends_at,
          status, notes, room_id, service_type_id,
          charge_amount_cents, paid_amount_cents, professional_fee_cents,
          paid_at, payment_method, created_at,
          patient:patients(id, name, phone, cpf),
          professional:professionals(id, name, specialty)
        `)
        .eq('clinic_id', clinicId!)
        .gte('starts_at', monthStart)
        .lte('starts_at', monthEnd)
        .in('status', ['scheduled', 'confirmed', 'completed'])
        .order('starts_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => mapAppointment(r as Record<string, unknown>) as FinancialRow)
    },
  })
}

export type AppointmentPaymentMethod =
  | 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'insurance' | 'boleto' | 'other'

export const PAYMENT_METHOD_LABELS: Record<AppointmentPaymentMethod, string> = {
  cash:        'Dinheiro',
  pix:         'PIX',
  credit_card: 'Cartão de crédito',
  debit_card:  'Cartão de débito',
  insurance:   'Convênio',
  boleto:      'Boleto',
  other:       'Outro',
}

export function useMarkPaid() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  return useMutation({
    mutationFn: async ({
      id,
      paidAmountCents,
      paymentMethod,
    }: {
      id: string
      paidAmountCents: number
      paymentMethod?: AppointmentPaymentMethod
    }) => {
      const { error } = await supabase
        .from('appointments')
        .update({
          paid_amount_cents: paidAmountCents,
          paid_at: new Date().toISOString(),
          status: 'completed',
          ...(paymentMethod ? { payment_method: paymentMethod } : {}),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      if (clinicId) {
        qc.invalidateQueries({ queryKey: QK.financial.forClinic(clinicId) })
        qc.invalidateQueries({ queryKey: QK.appointments.forClinic(clinicId) })
        qc.invalidateQueries({ queryKey: QK.appointments.today(clinicId) })
        qc.invalidateQueries({ queryKey: QK.dashboard.clinicKPIs(clinicId) })
      } else {
        qc.invalidateQueries({ queryKey: QK.financial.all() })
        qc.invalidateQueries({ queryKey: QK.appointments.all() })
        qc.invalidateQueries({ queryKey: QK.dashboard.clinicKPIsAll() })
      }

      qc.invalidateQueries({ queryKey: QK.dashboard.profKPIsAll() })
    },
  })
}
