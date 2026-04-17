/**
 * PaymentRegistrationModal
 * Modal simples para registrar pagamento manual de uma consulta.
 * Substitui o formulário inline na tabela do FinanceiroPage.
 */
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, CheckCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useMarkPaid, PAYMENT_METHOD_LABELS } from '../../hooks/useFinancial'
import type { AppointmentPaymentMethod } from '../../hooks/useFinancial'
import { formatBRL } from '../../utils/currency'

interface Props {
  open: boolean
  onClose: () => void
  appointmentId: string
  patientName: string
  chargeAmountCents: number | null
}

export default function PaymentRegistrationModal({
  open, onClose, appointmentId, patientName, chargeAmountCents,
}: Props) {
  const markPaid = useMarkPaid()

  const defaultAmount = chargeAmountCents != null
    ? (chargeAmountCents / 100).toFixed(2).replace('.', ',')
    : ''

  const [amount, setAmount]   = useState(defaultAmount)
  const [method, setMethod]   = useState<AppointmentPaymentMethod>('pix')

  async function handleConfirm() {
    const cents = Math.round(parseFloat(amount.replace(',', '.')) * 100)
    if (isNaN(cents) || cents <= 0) {
      toast.error('Informe um valor válido.')
      return
    }
    try {
      await markPaid.mutateAsync({ id: appointmentId, paidAmountCents: cents, paymentMethod: method })
      toast.success('Pagamento registrado!')
      onClose()
    } catch {
      toast.error('Erro ao registrar pagamento.')
    }
  }

  // Reset form when modal opens
  function handleOpenChange(v: boolean) {
    if (v) {
      setAmount(defaultAmount)
      setMethod('pix')
    } else {
      onClose()
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-1rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-4 shadow-xl focus:outline-none max-h-[90dvh] overflow-y-auto sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Dialog.Title className="text-base font-semibold text-gray-800">
              Registrar pagamento
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <p className="text-sm text-gray-500 mb-5">
            Paciente: <span className="font-medium text-gray-800">{patientName}</span>
            {chargeAmountCents != null && (
              <span className="block text-xs mt-0.5">Valor cobrado: {formatBRL(chargeAmountCents)}</span>
            )}
          </p>

          <div className="space-y-4">
            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor recebido (R$)
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#0ea5b0]">
                <span className="text-gray-400 text-sm">R$</span>
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
                  placeholder="0,00"
                  className="flex-1 text-base focus:outline-none"
                />
              </div>
            </div>

            {/* Payment method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Forma de pagamento
              </label>
              <select
                value={method}
                onChange={e => setMethod(e.target.value as AppointmentPaymentMethod)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
              >
                {(Object.entries(PAYMENT_METHOD_LABELS) as [AppointmentPaymentMethod, string][]).map(
                  ([val, label]) => <option key={val} value={val}>{label}</option>
                )}
              </select>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Dialog.Close asChild>
              <button className="flex-1 min-h-11 rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50">
                Cancelar
              </button>
            </Dialog.Close>
            <button
              onClick={handleConfirm}
              disabled={markPaid.isPending}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle size={16} />
              {markPaid.isPending ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
