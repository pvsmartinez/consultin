import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { mapAppointment } from '../utils/mappers'
import { useAuthContext } from '../contexts/AuthContext'
import type { Appointment } from '../types'

export interface FinancialRow extends Appointment {
  patient?: { id: string; name: string; phone: string | null; cpf: string | null }
  professional?: { id: string; name: string; specialty: string | null }
}

export function useFinancial(month: Date) {
  const monthStart = startOfMonth(month).toISOString()
  const monthEnd   = endOfMonth(month).toISOString()
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
          *,
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
      qc.invalidateQueries({ queryKey: QK.financial.all() })
      qc.invalidateQueries({ queryKey: QK.appointments.all() })
      qc.invalidateQueries({ queryKey: QK.dashboard.clinicKPIsAll() })
      qc.invalidateQueries({ queryKey: QK.dashboard.profKPIsAll() })
    },
  })
}
