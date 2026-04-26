import { useState, useRef } from 'react'
import { format, addMonths, subMonths, parseISO, isThisMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CaretLeft, CaretRight, CurrencyCircleDollar } from '@phosphor-icons/react'
import { useFinancial, PAYMENT_METHOD_LABELS } from '../hooks/useFinancial'
import type { AppointmentPaymentMethod } from '../hooks/useFinancial'
import { formatBRL } from '../utils/currency'
import { useClinic } from '../hooks/useClinic'
import { Badge } from '@pvsmartinez/shared/ui'
import AppointmentPaymentModal from '../components/appointments/AppointmentPaymentModal'
import PaymentRegistrationModal from '../components/appointments/PaymentRegistrationModal'
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_VARIANTS } from '../types'
import type { Appointment } from '../types'

type RegisteringRow = { id: string; patientName: string; chargeAmountCents: number | null } | null

export default function FinanceiroPage() {
  const [month, setMonth] = useState(new Date())
  const [registeringRow, setRegisteringRow] = useState<RegisteringRow>(null)
  const [chargingAppointment, setChargingAppointment] = useState<Appointment | null>(null)
  const monthInputRef = useRef<HTMLInputElement>(null)

  const { data = [], isLoading, isError } = useFinancial(month)
  const { data: clinic }         = useClinic()

  const totalCharged = data.reduce((s, r) => s + (r.chargeAmountCents ?? 0), 0)
  const totalReceived = data.reduce((s, r) => s + (r.paidAmountCents ?? 0), 0)
  const pending = data.filter(r => r.status === 'completed' && r.paidAmountCents == null)

  const monthLabel = format(month, "MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="space-y-6">
      {/* v2 Hero */}
      <section className="rounded-[28px] bg-white/90 border border-gray-200/80 shadow-sm px-4 py-5 sm:px-6 sm:py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0ea5b0] mb-2">Gestão clínica</p>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">Financeiro</h1>
        <p className="text-sm text-gray-500">Cobranças, pagamentos e fluxo de caixa da clínica.</p>
      </section>

      <div>
        {/* Month nav + tab bar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setMonth(m => subMonths(m, 1))}
              className="rounded-lg p-2.5 text-gray-500 transition hover:bg-gray-100"
            >
              <CaretLeft size={16} />
            </button>
            <button
              onClick={() => monthInputRef.current?.showPicker?.()}
              className="min-h-11 flex-1 rounded-lg px-3 py-2.5 text-center text-sm font-medium capitalize text-gray-700 transition-colors hover:bg-gray-100 sm:w-40 sm:flex-none"
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
              className="rounded-lg p-2.5 text-gray-500 transition hover:bg-gray-100"
            >
              <CaretRight size={16} />
            </button>
            {!isThisMonth(month) && (
              <button
                onClick={() => setMonth(new Date())}
                className="min-h-10 rounded-xl border border-teal-200 px-3 py-2 text-sm text-[#006970] transition-colors hover:bg-teal-50 hover:text-[#004f55]"
              >
                Mês atual
              </button>
            )}
          </div>
        </div>
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
              ) : isError ? (
                <p className="text-center text-red-400 text-sm py-12">Erro ao carregar dados. Tente novamente.</p>
              ) : data.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-12">Nenhuma consulta neste mês.</p>
              ) : (
                <>
                <div className="sm:hidden divide-y divide-gray-100">
                  {data.map(row => (
                    <div key={row.id} className="space-y-3 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{row.patient?.name ?? '—'}</p>
                          <p className="mt-1 text-xs text-gray-500">{format(parseISO(row.startsAt), 'dd/MM HH:mm')}</p>
                          <p className="mt-1 text-xs text-gray-500">Profissional: {row.professional?.name ?? '—'}</p>
                        </div>
                        <Badge variant={APPOINTMENT_STATUS_VARIANTS[row.status]}>
                          {APPOINTMENT_STATUS_LABELS[row.status]}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[#f8fafb] p-3 text-sm">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">Valor</p>
                          <p className="mt-1 font-semibold text-gray-800">{formatBRL(row.chargeAmountCents)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">Pago</p>
                          <p className="mt-1 font-semibold text-gray-800">
                            {row.paidAmountCents != null ? formatBRL(row.paidAmountCents) : '—'}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">Forma</p>
                          <p className="mt-1 text-sm text-gray-700">
                            {row.paymentMethod
                              ? PAYMENT_METHOD_LABELS[row.paymentMethod as AppointmentPaymentMethod] ?? row.paymentMethod
                              : '—'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        {row.paidAmountCents == null && (
                          <button
                            onClick={() => setRegisteringRow({
                              id: row.id,
                              patientName: row.patient?.name ?? 'Paciente',
                              chargeAmountCents: row.chargeAmountCents,
                            })}
                            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-teal-200 px-4 py-2.5 text-sm text-[#006970] transition-colors hover:bg-teal-50"
                          >
                            <CurrencyCircleDollar size={15} />
                            Registrar pagamento
                          </button>
                        )}
                        {clinic?.paymentsEnabled && (
                          <button
                            onClick={() => setChargingAppointment(row)}
                            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 px-4 py-2.5 text-sm text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                          >
                            <CurrencyCircleDollar size={15} />
                            Cobrar via Asaas
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paciente</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Profissional</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Status</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Pago</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Forma</th>
                        <th className="px-4 py-3" />
                        {clinic?.paymentsEnabled && (
                          <th className="text-left px-4 py-3 text-xs font-semibold text-indigo-500 uppercase tracking-wide hidden lg:table-cell">Asaas</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.map(row => (
                        <tr key={row.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                            {format(parseISO(row.startsAt), 'dd/MM HH:mm')}
                          </td>
                          <td className="px-4 py-3 text-gray-800 font-medium">
                            {row.patient?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                            {row.professional?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <Badge variant={APPOINTMENT_STATUS_VARIANTS[row.status]}>
                              {APPOINTMENT_STATUS_LABELS[row.status]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">
                            {formatBRL(row.chargeAmountCents)}
                          </td>
                          <td className="px-4 py-3 text-right hidden sm:table-cell">
                            {row.paidAmountCents != null ? (
                              <span className="text-green-600 font-medium">{formatBRL(row.paidAmountCents)}</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">
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
                                className="flex items-center gap-1 text-xs text-[#006970] hover:underline whitespace-nowrap"
                              >
                                <CurrencyCircleDollar size={14} />
                                Registrar
                              </button>
                            ) : null}
                          </td>
                          {clinic?.paymentsEnabled && (
                            <td className="px-4 py-3 hidden lg:table-cell">
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
                </div>
                </>
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
      </div>
    </div>
  )
}


function KpiCard({ label, value, color }: { label: string; value: string; color: 'blue' | 'green' | 'red' | 'gray' }) {
  const classes = {
    blue:  'bg-teal-50 border-teal-100',
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
