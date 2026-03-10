/**
 * useAppointmentPayments — cobrar paciente por consulta + repasse ao profissional
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import {
  findOrCreateAsaasCustomer,
  createAsaasCharge,
  getAsaasCharge,
  createAsaasTransfer,
} from '../services/asaas'
import type { AppointmentPayment, PaymentStatus, TransferStatus } from '../types'

function mapRow(r: Record<string, unknown>): AppointmentPayment {
  return {
    id:                   r.id as string,
    clinicId:             r.clinic_id as string,
    appointmentId:        r.appointment_id as string,
    asaasChargeId:        (r.asaas_charge_id as string) ?? null,
    paymentMethod:        (r.payment_method as AppointmentPayment['paymentMethod']) ?? null,
    status:               (r.status as PaymentStatus) ?? 'PENDING',
    amountCents:          r.amount_cents as number,
    pixKey:               (r.pix_key as string) ?? null,
    pixExpiresAt:         (r.pix_expires_at as string) ?? null,
    paidAt:               (r.paid_at as string) ?? null,
    transferStatus:       (r.transfer_status as TransferStatus) ?? 'PENDING',
    transferAmountCents:  (r.transfer_amount_cents as number) ?? null,
    asaasTransferId:      (r.asaas_transfer_id as string) ?? null,
    transferredAt:        (r.transferred_at as string) ?? null,
    notes:                (r.notes as string) ?? null,
    createdAt:            r.created_at as string,
  }
}

/** Lists pagamentos de uma consulta */
export function useAppointmentPayments(appointmentId: string | undefined) {
  return useQuery({
    queryKey: QK.financial.apptPayments(appointmentId),
    enabled: !!appointmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointment_payments')
        .select('*')
        .eq('appointment_id', appointmentId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => mapRow(r))
    },
  })
}

/** Lista todos os pagamentos de consultas da clínica no mês */
export function useClinicAppointmentPayments(clinicId: string | undefined, month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1).toISOString()
  const end   = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59).toISOString()

  return useQuery({
    queryKey: QK.financial.clinicPayments(clinicId, start),
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointment_payments')
        .select('*, appointment:appointments(id, starts_at, patient:patients(id,name), professional:professionals(id,name))')
        .eq('clinic_id', clinicId!)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => mapRow(r))
    },
  })
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateAppointmentChargeInput {
  clinicId: string
  appointmentId: string
  amountCents: number
  /** PIX gera QR code imediato; BOLETO gera boleto; CREDIT_CARD redireciona para link */
  paymentMethod: 'PIX' | 'BOLETO' | 'CREDIT_CARD'
  patient: {
    id: string
    name: string
    /** CPF obrigatório — Asaas exige para criar customer */
    cpf: string
    email: string | null
    phone: string | null
  }
  description?: string
  dueDays?: number   // vencimento em dias a partir de hoje (default 3)
}

/**
 * 1. Cria (ou reutiliza) customer do paciente no Asaas
 * 2. Cria cobrança
 * 3. Salva registro em appointment_payments
 */
export function useCreateAppointmentCharge() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateAppointmentChargeInput) => {
      // 1. Criar (ou recuperar) customer do paciente no Asaas
      if (!input.patient.cpf) {
        throw new Error(
          'O paciente não tem CPF cadastrado. Edite o cadastro do paciente antes de gerar a cobrança.',
        )
      }
      const customer = await findOrCreateAsaasCustomer({
        name:              input.patient.name,
        cpfCnpj:           input.patient.cpf,
        email:             input.patient.email ?? undefined,
        mobilePhone:       input.patient.phone ?? undefined,
        externalReference: input.patient.id,
      })

      // 2. Data de vencimento
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + (input.dueDays ?? 3))
      const dueDateStr = dueDate.toISOString().slice(0, 10)

      // 3. Criar cobrança no Asaas
      const charge = await createAsaasCharge({
        customer:          customer.id,
        billingType:       input.paymentMethod,
        value:             input.amountCents / 100,
        dueDate:           dueDateStr,
        description:       input.description ?? 'Consulta médica',
        externalReference: input.appointmentId,
      })

      // 4. Salvar no banco
      const { data: row, error } = await supabase
        .from('appointment_payments')
        .insert({
          clinic_id:       input.clinicId,
          appointment_id:  input.appointmentId,
          asaas_charge_id: charge.id,
          payment_method:  input.paymentMethod,
          status:          charge.status,
          amount_cents:    input.amountCents,
          pix_key:         charge.pixTransaction?.payload ?? null,
          pix_expires_at:  charge.pixTransaction?.expirationDate ?? null,
          transfer_status: 'PENDING',
        })
        .select()
        .single()
      if (error) throw new Error(error.message)

      return {
        payment: mapRow(row as Record<string, unknown>),
        pixPayload: charge.pixTransaction?.payload ?? null,
        pixQrCode:  charge.pixTransaction?.encodedImage ?? null,
        invoiceUrl: charge.invoiceUrl,
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QK.financial.apptPayments(vars.appointmentId) })
      qc.invalidateQueries({ queryKey: QK.financial.clinicPayments(vars.clinicId) })
    },
  })
}

/** Sincroniza status de pagamento com o Asaas */
export function useSyncPaymentStatus() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payment: AppointmentPayment) => {
      if (!payment.asaasChargeId) throw new Error('Sem chargeId para sincronizar')
      const charge = await getAsaasCharge(payment.asaasChargeId)
      const isPaid = charge.status === 'RECEIVED' || charge.status === 'CONFIRMED'
      const paidAt = isPaid ? new Date().toISOString() : null

      // Atualiza appointment_payments
      const { error } = await supabase
        .from('appointment_payments')
        .update({ status: charge.status as AppointmentPayment['status'], paid_at: paidAt })
        .eq('id', payment.id)
      if (error) throw new Error(error.message)

      // Sincroniza appointments.paid_amount_cents para manter os KPIs do Financeiro corretos
      if (isPaid) {
        await supabase
          .from('appointments')
          .update({
            paid_amount_cents: payment.amountCents,
            paid_at: paidAt,
            status: 'completed',
          })
          .eq('id', payment.appointmentId)
      }

      return charge.status as AppointmentPayment['status']
    },
    onSuccess: (_, payment) => {
      qc.invalidateQueries({ queryKey: QK.financial.apptPayments(payment.appointmentId) })
      qc.invalidateQueries({ queryKey: QK.financial.clinicPayments(payment.clinicId) })
    },
  })
}

export interface CreateTransferInput {
  payment: AppointmentPayment
  professionalId: string
  transferAmountCents: number
  bankAccount: {
    bankCode: string
    agency: string
    agencyDigit?: string
    account: string
    accountDigit?: string
    ownerName: string
    ownerCpfCnpj: string
    accountType: 'CONTA_CORRENTE' | 'CONTA_POUPANCA' | 'CONTA_SALARIO'
  }
}

/** Efetua repasse ao profissional via Asaas Transfer */
export function useTransferToProfessional() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateTransferInput) => {
      const transfer = await createAsaasTransfer({
        value:             input.transferAmountCents / 100,
        operationType:     'TED',
        bankAccount: {
          bank:            { code: input.bankAccount.bankCode },
          accountName:     input.bankAccount.ownerName,
          ownerName:       input.bankAccount.ownerName,
          cpfCnpj:         input.bankAccount.ownerCpfCnpj,
          agency:          input.bankAccount.agency,
          agencyDigit:     input.bankAccount.agencyDigit,
          account:         input.bankAccount.account,
          accountDigit:    input.bankAccount.accountDigit ?? '',
          bankAccountType: input.bankAccount.accountType,
        },
        description:       'Repasse de consulta',
        externalReference: input.payment.id,
      })

      // Asaas transfer é assíncrono: DONE = concluído, PENDING = aguardando
      const asaasToOurs: Record<string, TransferStatus> = {
        DONE:      'TRANSFERRED',
        PENDING:   'PENDING',
        CANCELLED: 'FAILED',
        FAILED:    'FAILED',
      }
      const transferStatus: TransferStatus = asaasToOurs[transfer.status] ?? 'PENDING'

      const { error } = await supabase
        .from('appointment_payments')
        .update({
          transfer_status:       transferStatus,
          transfer_amount_cents: input.transferAmountCents,
          asaas_transfer_id:     transfer.id,
          transferred_at:        transferStatus === 'TRANSFERRED' ? new Date().toISOString() : null,
        })
        .eq('id', input.payment.id)
      if (error) throw new Error(error.message)

      return transfer
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QK.financial.apptPayments(vars.payment.appointmentId) })
      qc.invalidateQueries({ queryKey: QK.financial.clinicPayments(vars.payment.clinicId) })
    },
  })
}
