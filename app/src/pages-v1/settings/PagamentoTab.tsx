import { useState } from 'react'
import { toast } from 'sonner'
import { useClinic } from '../../hooks/useClinic'
import { PAYMENT_METHOD_OPTIONS, PAYMENT_TIMING_LABELS } from '../../types'
import type { Clinic } from '../../types'

export default function PagamentoTab({ clinic }: { clinic: Clinic }) {
  const formKey = [
    clinic.id,
    clinic.acceptedPaymentMethods.join(','),
    clinic.paymentTiming,
    String(clinic.cancellationHours),
  ].join('|')

  return <PagamentoTabForm key={formKey} clinic={clinic} />
}

function PagamentoTabForm({ clinic }: { clinic: Clinic }) {
  const { update } = useClinic()

  const [methods, setMethods]   = useState<string[]>(clinic.acceptedPaymentMethods)
  const [timing, setTiming]     = useState<Clinic['paymentTiming']>(clinic.paymentTiming)
  const [cancelH, setCancelH]   = useState<string>(String(clinic.cancellationHours))
  const [saving, setSaving]     = useState(false)

  function toggleMethod(value: string) {
    setMethods(prev =>
      prev.includes(value) ? prev.filter(m => m !== value) : [...prev, value]
    )
  }

  async function save() {
    if (methods.length === 0) { toast.error('Selecione ao menos uma forma de pagamento'); return }
    const parsedCancelH = parseInt(cancelH, 10)
    setSaving(true)
    try {
      await update.mutateAsync({
        acceptedPaymentMethods: methods,
        paymentTiming:         timing,
        cancellationHours:     isNaN(parsedCancelH) ? 24 : parsedCancelH,
      })
      toast.success('Regras de pagamento salvas')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Accepted payment methods */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Formas de pagamento aceitas
        </label>
        <p className="text-xs text-gray-400 mb-3">
          Essas opções aparecerão no registro de recebimento de cada consulta.
        </p>
        <div className="space-y-2">
          {PAYMENT_METHOD_OPTIONS.map(opt => (
            <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={methods.includes(opt.value)}
                onChange={() => toggleMethod(opt.value)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Payment timing */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Quando o pagamento é realizado?
        </label>
        <div className="space-y-2">
          {Object.entries(PAYMENT_TIMING_LABELS).map(([value, label]) => (
            <label key={value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="paymentTiming"
                checked={timing === value}
                onChange={() => setTiming(value as Clinic['paymentTiming'])}
                className="border-gray-300"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Cancellation policy */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Política de cancelamento pelo paciente
        </label>
        <p className="text-xs text-gray-400 mb-3">
          Quantas horas antes da consulta o paciente pode cancelar pelo portal.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={0}
            value={cancelH}
            onChange={e => setCancelH(e.target.value)}
            className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
          />
          <span className="text-sm text-gray-500">horas antes da consulta</span>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {parseInt(cancelH) === 0 && 'Cancelamento sempre permitido.'}
          {parseInt(cancelH) === -1 && 'Cancelamento pelo portal nunca permitido.'}
          {parseInt(cancelH) > 0 && `Paciente pode cancelar até ${cancelH}h antes. Após esse prazo, deverá ligar para a clínica.`}
        </p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 text-sm text-white rounded-xl disabled:opacity-40 transition-all active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
        >
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}
