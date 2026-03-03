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
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 focus:outline-none">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-base font-semibold text-gray-800">
              Registrar pagamento
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-400 hover:text-gray-600">
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
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
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
                  className="flex-1 text-sm focus:outline-none"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {(Object.entries(PAYMENT_METHOD_LABELS) as [AppointmentPaymentMethod, string][]).map(
                  ([val, label]) => <option key={val} value={val}>{label}</option>
                )}
              </select>
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <Dialog.Close asChild>
              <button className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
            </Dialog.Close>
            <button
              onClick={handleConfirm}
              disabled={markPaid.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
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
