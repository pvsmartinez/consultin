import { useState } from 'react'
import { format, addMonths, subMonths, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CaretLeft, CaretRight, CheckCircle, CurrencyCircleDollar } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useFinancial, useMarkPaid, PAYMENT_METHOD_LABELS } from '../hooks/useFinancial'
import type { AppointmentPaymentMethod } from '../hooks/useFinancial'
import { formatBRL } from '../utils/currency'
import { useClinic } from '../hooks/useClinic'
import Badge from '../components/ui/Badge'
import AppointmentPaymentModal from '../components/appointments/AppointmentPaymentModal'
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS } from '../types'
import type { Appointment } from '../types'

export default function FinanceiroPage() {
  const [month, setMonth] = useState(new Date())
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payingAmount, setPayingAmount] = useState('')
  const [payingMethod, setPayingMethod] = useState<AppointmentPaymentMethod>('pix')
  const [chargingAppointment, setChargingAppointment] = useState<Appointment | null>(null)

  const { data = [], isLoading } = useFinancial(month)
  const { data: clinic }         = useClinic()
  const markPaid = useMarkPaid()

  const totalCharged = data.reduce((s, r) => s + (r.chargeAmountCents ?? 0), 0)
  const totalReceived = data.reduce((s, r) => s + (r.paidAmountCents ?? 0), 0)
  const pending = data.filter(r => r.status !== 'completed' || r.paidAmountCents == null)

  const handleMarkPaid = async (id: string) => {
    const cents = Math.round(parseFloat(payingAmount.replace(',', '.')) * 100)
    if (isNaN(cents) || cents <= 0) {
      toast.error('Informe um valor válido.')
      return
    }
    try {
      await markPaid.mutateAsync({ id, paidAmountCents: cents, paymentMethod: payingMethod })
      toast.success('Pagamento registrado!')
      setPayingId(null)
      setPayingAmount('')
      setPayingMethod('pix')
    } catch (err) {
      toast.error('Erro ao registrar pagamento.')
    }
  }

  const monthLabel = format(month, "MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Financeiro</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth(m => subMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-500"
          >
            <CaretLeft size={16} />
          </button>
          <span className="text-sm font-medium text-gray-700 capitalize w-40 text-center">{monthLabel}</span>
          <button
            onClick={() => setMonth(m => addMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-500"
          >
            <CaretRight size={16} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Total a cobrar" value={formatBRL(totalCharged)} color="blue" />
        <KpiCard label="Total recebido" value={formatBRL(totalReceived)} color="green" />
        <KpiCard label="Pendente" value={formatBRL(totalCharged - totalReceived)} color={totalCharged - totalReceived > 0 ? 'red' : 'gray'} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <p className="text-center text-gray-400 text-sm py-12">Carregando...</p>
        ) : data.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-12">Nenhuma consulta neste mês.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paciente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Profissional</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pago</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Forma</th>
                <th className="px-4 py-3" />
                {clinic?.paymentsEnabled && (
                  <th className="text-left px-4 py-3 text-xs font-semibold text-indigo-500 uppercase tracking-wide">Asaas</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {format(parseISO(row.startsAt), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-gray-800 font-medium">
                    {row.patient?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {row.professional?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      label={APPOINTMENT_STATUS_LABELS[row.status]}
                      className={APPOINTMENT_STATUS_COLORS[row.status]}
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatBRL(row.chargeAmountCents)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.paidAmountCents != null ? (
                      <span className="text-green-600 font-medium">{formatBRL(row.paidAmountCents)}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {row.paymentMethod
                      ? PAYMENT_METHOD_LABELS[row.paymentMethod as AppointmentPaymentMethod] ?? row.paymentMethod
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    {payingId === row.id ? (
                      <div className="flex flex-col gap-1.5 items-end">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500 text-xs">R$</span>
                          <input
                            autoFocus
                            type="text"
                            inputMode="decimal"
                            value={payingAmount}
                            onChange={e => setPayingAmount(e.target.value)}
                            placeholder="0,00"
                            className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleMarkPaid(row.id)
                              if (e.key === 'Escape') { setPayingId(null); setPayingAmount('') }
                            }}
                          />
                          <button
                            onClick={() => handleMarkPaid(row.id)}
                            disabled={markPaid.isPending}
                            className="text-green-600 hover:text-green-700 disabled:opacity-50"
                          >
                            <CheckCircle size={18} />
                          </button>
                        </div>
                        <select
                          value={payingMethod}
                          onChange={e => setPayingMethod(e.target.value as AppointmentPaymentMethod)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                        >
                          {(Object.entries(PAYMENT_METHOD_LABELS) as [AppointmentPaymentMethod, string][]).map(
                            ([val, label]) => (
                              <option key={val} value={val}>{label}</option>
                            ),
                          )}
                        </select>
                      </div>
                    ) : row.paidAmountCents == null ? (
                      <button
                        onClick={() => {
                          setPayingId(row.id)
                          setPayingAmount(
                            row.chargeAmountCents != null
                              ? (row.chargeAmountCents / 100).toFixed(2).replace('.', ',')
                              : ''
                          )
                        }}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline whitespace-nowrap"
                      >
                        <CurrencyCircleDollar size={14} />
                        Registrar
                      </button>
                    ) : null}
                  </td>
                  {clinic?.paymentsEnabled && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setChargingAppointment(row)}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 whitespace-nowrap border border-indigo-200 rounded-lg px-2 py-1 hover:bg-indigo-50 transition-colors"
                      >
                        <CurrencyCircleDollar size={13} />
                        Cobrar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pending.length > 0 && (
        <p className="text-xs text-gray-400 mt-3">
          {pending.length} consulta{pending.length > 1 ? 's' : ''} com pagamento pendente.
        </p>
      )}

      {chargingAppointment && (
        <AppointmentPaymentModal
          appointment={chargingAppointment}
          onClose={() => setChargingAppointment(null)}
        />
      )}
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: string; color: 'blue' | 'green' | 'red' | 'gray' }) {
  const classes = {
    blue:  'bg-blue-50 border-blue-100',
    green: 'bg-green-50 border-green-100',
    red:   'bg-red-50 border-red-100',
    gray:  'bg-gray-50 border-gray-100',
  }[color]
  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-semibold text-gray-800">{value}</p>
    </div>
  )
}
