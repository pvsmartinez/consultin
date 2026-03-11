/**
 * AppointmentPaymentModal
 * Cria cobrança Asaas para uma consulta (PIX, boleto ou cartão)
 * e exibe o QR code PIX ao finalizar.
 */
import { useState } from 'react'
import { X, QrCode, Copy, CheckCircle, ArrowsClockwise } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Modal } from '@pvsmartinez/shared/ui'
import {
  useCreateAppointmentCharge,
  useSyncPaymentStatus,
  useTransferToProfessional,
  type CreateTransferInput,
} from '../../hooks/useAppointmentPayments'
import { useProfessionalBankAccount } from '../../hooks/useProfessionalBankAccount'
import { formatBRL } from '../../utils/currency'
import { formatDateTime } from '../../utils/date'
import type { Appointment, AppointmentPayment } from '../../types'
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, TRANSFER_STATUS_LABELS } from '../../types'

interface Props {
  appointment: Appointment
  existingPayment?: AppointmentPayment | null
  onClose: () => void
}

// ─── Payment method labels ────────────────────────────────────────────────────
const METHOD_LABELS: Record<string, string> = {
  PIX:         'PIX',
  BOLETO:      'Boleto',
  CREDIT_CARD: 'Cartão de Crédito',
}

export default function AppointmentPaymentModal({ appointment, existingPayment, onClose }: Props) {
  const createCharge = useCreateAppointmentCharge()
  const syncStatus   = useSyncPaymentStatus()
  const transfer     = useTransferToProfessional()

  // Bank account for the professional
  const { data: bankAccount } = useProfessionalBankAccount(appointment.professionalId)

  // Form state
  const [method, setMethod] = useState<'PIX' | 'BOLETO' | 'CREDIT_CARD'>('PIX')
  const [customAmount, setCustomAmount] = useState(
    appointment.chargeAmountCents != null
      ? (appointment.chargeAmountCents / 100).toFixed(2).replace('.', ',')
      : ''
  )

  // Post-creation state
  const [payment, setPayment]     = useState<AppointmentPayment | null>(existingPayment ?? null)
  const [pixPayload, setPixPayload] = useState<string | null>(null)
  const [pixQrCode, setPixQrCode]   = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)

  const amountCents = Math.round(parseFloat(customAmount.replace(',', '.')) * 100) || 0

  // ── Create charge ──────────────────────────────────────────────────────────
  async function handleCreateCharge() {
    if (amountCents <= 0) { toast.error('Informe um valor válido.'); return }
    if (!appointment.patient) { toast.error('Paciente não carregado.'); return }
    if (!appointment.patient.cpf) {
      toast.error('O paciente não tem CPF cadastrado. Edite o cadastro do paciente antes de gerar a cobrança.')
      return
    }
    try {
      const result = await createCharge.mutateAsync({
        clinicId:      appointment.clinicId,
        appointmentId: appointment.id,
        amountCents,
        paymentMethod: method,
        patient: {
          id:    appointment.patient.id,
          name:  appointment.patient.name,
          cpf:   appointment.patient.cpf,
          email: null,
          phone: appointment.patient.phone ?? null,
        },
        description: `Consulta — ${appointment.professional?.name ?? ''}`,
      })
      setPayment(result.payment)
      setPixPayload(result.pixPayload)
      setPixQrCode(result.pixQrCode)
      toast.success('Cobrança gerada!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar cobrança.')
    }
  }

  // ── Sync status ──────────────────────────────────────────────────────────
  async function handleSync() {
    if (!payment) return
    try {
      const status = await syncStatus.mutateAsync(payment)
      setPayment(p => p ? { ...p, status } : p)
      toast.success(`Status atualizado: ${PAYMENT_STATUS_LABELS[status]}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao sincronizar.')
    }
  }

  // ── Transfer to professional ──────────────────────────────────────────────
  async function handleTransfer() {
    if (!payment || !bankAccount) return
    const feeStr = appointment.professionalFeeCents != null
      ? (appointment.professionalFeeCents / 100).toFixed(2)
      : (amountCents / 100 * 0.7).toFixed(2) // fallback 70% se não definido

    const transferCents = Math.round(parseFloat(feeStr) * 100)
    if (transferCents <= 0) { toast.error('Valor de repasse inválido.'); return }

    const input: CreateTransferInput = {
      payment,
      professionalId: appointment.professionalId,
      transferAmountCents: transferCents,
      bankAccount: {
        bankCode:    bankAccount.bankCode,
        agency:      bankAccount.agency,
        agencyDigit: bankAccount.agencyDigit ?? undefined,
        account:     bankAccount.account,
        accountDigit: bankAccount.accountDigit ?? undefined,
        ownerName:   bankAccount.ownerName,
        ownerCpfCnpj: bankAccount.ownerCpfCnpj,
        accountType: bankAccount.accountType,
      },
    }

    try {
      await transfer.mutateAsync(input)
      setPayment(p => p ? { ...p, transferStatus: 'TRANSFERRED' } : p)
      toast.success('Repasse efetuado com sucesso!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao efetuar repasse.')
    }
  }

  function copyPix() {
    if (!pixPayload) return
    navigator.clipboard.writeText(pixPayload).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isReceived = payment?.status === 'RECEIVED' || payment?.status === 'CONFIRMED'
  const canTransfer = isReceived && bankAccount && payment?.transferStatus === 'PENDING'

  return (
    <Modal open={true} onClose={onClose} maxWidth="sm">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Pagamento da consulta</h2>
            <p className="text-xs text-gray-400">
              {appointment.patient?.name} · {appointment.professional?.name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Cobrança ainda não criada */}
          {!payment && (
            <>
              {/* Valor */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Valor (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Método */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Forma de pagamento</label>
                <div className="flex gap-2">
                  {(['PIX', 'BOLETO', 'CREDIT_CARD'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                        method === m
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCreateCharge}
                disabled={createCharge.isPending || amountCents <= 0}
                className="w-full py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {createCharge.isPending ? 'Gerando cobrança...' : 'Gerar cobrança'}
              </button>
            </>
          )}

          {/* Cobrança criada — mostrar status + QR */}
          {payment && (
            <>
              {/* Status badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${PAYMENT_STATUS_COLORS[payment.status]}`}>
                    {PAYMENT_STATUS_LABELS[payment.status]}
                  </span>
                  {payment.paymentMethod && (
                    <span className="text-xs text-gray-400">{METHOD_LABELS[payment.paymentMethod]}</span>
                  )}
                </div>
                <button onClick={handleSync} disabled={syncStatus.isPending}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                  <ArrowsClockwise size={13} className={syncStatus.isPending ? 'animate-spin' : ''} />
                  Atualizar
                </button>
              </div>

              {/* Valor cobrado + breakdown financeiro */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Paciente pagou</span>
                  <span className="font-semibold text-gray-800">{formatBRL(payment.amountCents)}</span>
                </div>
                {payment.transferAmountCents != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Repasse profissional</span>
                    <span className="text-orange-600">−{formatBRL(payment.transferAmountCents)}</span>
                  </div>
                )}
                {payment.transferAmountCents != null && (
                  <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-1.5">
                    <span className="text-gray-700 font-medium">Saldo clínica</span>
                    <span className="font-semibold text-green-700">
                      {formatBRL(payment.amountCents - payment.transferAmountCents)}
                    </span>
                  </div>
                )}
              </div>

              {/* QR Code PIX */}
              {pixQrCode && (
                <div className="flex flex-col items-center gap-3 bg-gray-50 rounded-xl p-4">
                  <QrCode size={20} className="text-gray-500" />
                  <img
                    src={`data:image/png;base64,${pixQrCode}`}
                    alt="QR Code PIX"
                    className="w-40 h-40 rounded-lg"
                  />
                  <button onClick={copyPix}
                    className="flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-700">
                    {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                    {copied ? 'Copiado!' : 'Copiar código PIX'}
                  </button>
                  {payment.pixExpiresAt && (
                    <p className="text-xs text-gray-400">
                      Expira em {formatDateTime(payment.pixExpiresAt)}
                    </p>
                  )}
                </div>
              )}

              {/* Repasse */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700">Repasse ao profissional</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    payment.transferStatus === 'TRANSFERRED'
                      ? 'bg-green-100 text-green-700'
                      : payment.transferStatus === 'FAILED'
                      ? 'bg-red-100 text-red-600'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {TRANSFER_STATUS_LABELS[payment.transferStatus]}
                  </span>
                </div>

                {!bankAccount && (
                  <p className="text-xs text-yellow-600 bg-yellow-50 rounded-lg px-3 py-2">
                    Profissional sem conta bancária cadastrada. Acesse Profissionais → ícone de banco.
                  </p>
                )}

                {canTransfer && (
                  <button onClick={handleTransfer} disabled={transfer.isPending}
                    className="w-full py-2 text-sm font-medium rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                    {transfer.isPending
                      ? 'Transferindo...'
                      : `Repassar ${formatBRL(appointment.professionalFeeCents ?? Math.round(payment.amountCents * 0.7))}`}
                  </button>
                )}

                {payment.transferStatus === 'TRANSFERRED' && payment.transferAmountCents && (
                  <p className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">
                    ✓ Repassado {formatBRL(payment.transferAmountCents)} em{' '}
                    {payment.transferredAt ? formatDateTime(payment.transferredAt) : '—'}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
    </Modal>
  )
}
