import { useState, useRef } from 'react'
import { format, addMonths, subMonths, parseISO, isThisMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CaretLeft, CaretRight, CurrencyCircleDollar } from '@phosphor-icons/react'
import { useFinancial, PAYMENT_METHOD_LABELS } from '../hooks/useFinancial'
import type { AppointmentPaymentMethod } from '../hooks/useFinancial'
import { formatBRL } from '../utils/currency'
import { useClinic } from '../hooks/useClinic'
import Badge from '../components/ui/Badge'
import AppointmentPaymentModal from '../components/appointments/AppointmentPaymentModal'
import PaymentRegistrationModal from '../components/appointments/PaymentRegistrationModal'
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS } from '../types'
import type { Appointment } from '../types'
import RelatoriosPage from './RelatoriosPage'

type FinTab = 'lancamentos' | 'relatorios'

type RegisteringRow = { id: string; patientName: string; chargeAmountCents: number | null } | null

export default function FinanceiroPage() {
  const [finTab, setFinTab] = useState<FinTab>('lancamentos')
  const [month, setMonth] = useState(new Date())
  const [registeringRow, setRegisteringRow] = useState<RegisteringRow>(null)
  const [chargingAppointment, setChargingAppointment] = useState<Appointment | null>(null)
  const monthInputRef = useRef<HTMLInputElement>(null)

  const { data = [], isLoading } = useFinancial(month)
  const { data: clinic }         = useClinic()

  const totalCharged = data.reduce((s, r) => s + (r.chargeAmountCents ?? 0), 0)
  const totalReceived = data.reduce((s, r) => s + (r.paidAmountCents ?? 0), 0)
  // Só consultas já realizadas sem pagamento registrado
  const pending = data.filter(r => r.status === 'completed' && r.paidAmountCents == null)

  const monthLabel = format(month, "MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-800">Financeiro</h1>
        {finTab === 'lancamentos' && (
          <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth(m => subMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-500"
          >
            <CaretLeft size={16} />
          </button>
          <button
            onClick={() => monthInputRef.current?.showPicker?.()}
            className="text-sm font-medium text-gray-700 capitalize w-40 text-center hover:bg-gray-100 rounded-lg px-2 py-1 transition-colors"
            title="Selecionar mês"
          >
            {monthLabel}
          </button>
          {/* Hidden month input for native picker */}
          <input
            ref={monthInputRef}
            type="month"
            value={format(month, 'yyyy-MM')}
            onChange={e => {
              if (e.target.value) {
                const [y, m] = e.target.value.split('-').map(Number)
                setMonth(new Date(y, m - 1, 1))
              }
            }}
            className="sr-only"
            tabIndex={-1}
          />
          <button
            onClick={() => setMonth(m => addMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-500"
          >
            <CaretRight size={16} />
          </button>
          {!isThisMonth(month) && (
            <button
              onClick={() => setMonth(new Date())}
              className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50 transition-colors"
            >
              Mês atual
            </button>
          )}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {(['lancamentos', 'relatorios'] as FinTab[]).map(t => (
          <button
            key={t}
            onClick={() => setFinTab(t)}
            className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
              finTab === t ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'lancamentos' ? 'Lançamentos' : 'Relatórios'}
          </button>
        ))}
      </div>

      {finTab === 'relatorios' && <RelatoriosPage />}
      {finTab === 'lancamentos' && (
      <>
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
                    {row.paidAmountCents == null ? (
                      <button
                        onClick={() => setRegisteringRow({
                          id: row.id,
                          patientName: row.patient?.name ?? 'Paciente',
                          chargeAmountCents: row.chargeAmountCents,
                        })}
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

      {registeringRow && (
        <PaymentRegistrationModal
          open={!!registeringRow}
          onClose={() => setRegisteringRow(null)}
          appointmentId={registeringRow.id}
          patientName={registeringRow.patientName}
          chargeAmountCents={registeringRow.chargeAmountCents}
        />
      )}
      </>
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
