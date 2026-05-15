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

  const parsedCancelH = parseInt(cancelH, 10)

  function applyCancelPreset(value: number) {
    setCancelH(String(value))
  }

  function getCancellationSummary() {
    if (parsedCancelH === 0) return 'Cancelamento sempre permitido.'
    if (parsedCancelH === -1) return 'Cancelamento pelo portal desativado.'
    if (Number.isNaN(parsedCancelH)) return 'Defina quantas horas antes o paciente pode cancelar.'
    if (parsedCancelH > 0) return `Paciente pode cancelar até ${parsedCancelH}h antes.`
    return 'Use 0 para liberar sempre ou -1 para bloquear no portal.'
  }

  async function save() {
    if (methods.length === 0) { toast.error('Selecione ao menos uma forma de pagamento'); return }
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
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(247,250,252,0.98))] px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold text-gray-900">Regras de pagamento</h2>
        <p className="mt-1 text-sm text-gray-500">Defina como a clínica cobra e como o paciente pode cancelar.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
            {methods.length} forma{methods.length !== 1 ? 's' : ''} ativa{methods.length !== 1 ? 's' : ''}
          </span>
          <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {PAYMENT_TIMING_LABELS[timing]}
          </span>
          <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {getCancellationSummary()}
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <label className="block text-sm font-medium text-gray-800 mb-3">
          Formas de pagamento aceitas
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {PAYMENT_METHOD_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition cursor-pointer ${
                methods.includes(opt.value)
                  ? 'border-teal-200 bg-teal-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={methods.includes(opt.value)}
                onChange={() => toggleMethod(opt.value)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <label className="block text-sm font-medium text-gray-800 mb-3">
          Momento da cobrança
        </label>
        <div className="space-y-2">
          {Object.entries(PAYMENT_TIMING_LABELS).map(([value, label]) => (
            <label
              key={value}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition cursor-pointer ${
                timing === value
                  ? 'border-teal-200 bg-teal-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="paymentTiming"
                checked={timing === value}
                onChange={() => setTiming(value as Clinic['paymentTiming'])}
                className="border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <label className="block text-sm font-medium text-gray-800 mb-3">
          Cancelamento pelo paciente
        </label>
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            { value: 0, label: 'Sempre' },
            { value: 24, label: '24h' },
            { value: 48, label: '48h' },
            { value: -1, label: 'Bloquear' },
          ].map(preset => (
            <button
              key={preset.value}
              type="button"
              onClick={() => applyCancelPreset(preset.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                parsedCancelH === preset.value
                  ? 'bg-[#006970] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
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
        <p className="mt-2 text-sm text-gray-500">{getCancellationSummary()}</p>
      </section>

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
