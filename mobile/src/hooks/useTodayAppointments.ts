import { useQuery } from '@tanstack/react-query'
import { startOfDay, endOfDay } from 'date-fns'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import { QK } from '../lib/queryKeys'
import type { Appointment } from '../types'

function mapRow(row: Record<string, unknown>): Appointment {
  const p = row.patient as Record<string, unknown> | null
  const pr = row.professional as Record<string, unknown> | null
  return {
    id:                row.id as string,
    clinicId:          row.clinic_id as string,
    patientId:         row.patient_id as string,
    professionalId:    row.professional_id as string,
    startsAt:          row.starts_at as string,
    endsAt:            row.ends_at as string,
    status:            row.status as Appointment['status'],
    notes:             (row.notes as string) ?? null,
    chargeAmountCents: (row.charge_amount_cents as number) ?? null,
    paidAmountCents:   (row.paid_amount_cents as number) ?? null,
    paidAt:            (row.paid_at as string) ?? null,
    paymentMethod:     (row.payment_method as string) ?? null,
    createdAt:         row.created_at as string,
    patient: p ? { id: p.id as string, name: p.name as string, phone: (p.phone as string) ?? null } : undefined,
    professional: pr ? { id: pr.id as string, name: pr.name as string, specialty: (pr.specialty as string) ?? null } : undefined,
  }
}

export function useTodayAppointments() {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  const from = startOfDay(new Date()).toISOString()
  const to   = endOfDay(new Date()).toISOString()

  return useQuery({
    queryKey: QK.appointments.today(clinicId),
    staleTime: 60_000,
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, patient:patients(id, name, phone), professional:professionals(id, name, specialty)')
        .eq('clinic_id', clinicId!)
        .gte('starts_at', from)
        .lte('starts_at', to)
        .not('status', 'in', '("cancelled","no_show")')
        .order('starts_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map(r => mapRow(r as unknown as Record<string, unknown>))
    },
  })
}
