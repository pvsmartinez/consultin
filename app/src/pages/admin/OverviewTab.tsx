import { ArrowClockwise } from '@phosphor-icons/react'
import { useAdminOverview } from '../../hooks/useAdmin'
import { formatNumber } from '../../utils/currency'

export default function OverviewTab() {
  const { data: ov, isLoading, refetch, isFetching } = useAdminOverview()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">Visão geral do sistema</h2>
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40">
          <ArrowClockwise size={13} className={isFetching ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 text-center py-12">Carregando estatísticas…</div>
      ) : ov ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Clínicas',    value: ov.totalClinics,      color: 'text-blue-400' },
              { label: 'Usuários',    value: ov.totalUsers,         color: 'text-purple-400' },
              { label: 'Pacientes',   value: ov.totalPatients,      color: 'text-green-400' },
              { label: 'Consultas',   value: ov.totalAppointments,  color: 'text-amber-400' },
            ].map(k => (
              <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                <p className={`text-2xl font-bold ${k.color}`}>{formatNumber(k.value)}</p>
              </div>
            ))}
          </div>

          {/* Per-clinic breakdown */}
          <div>
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Por clínica</h3>
            {ov.perClinic.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-8">Nenhuma clínica cadastrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-800">
                      <th className="text-left pb-2 font-medium">Clínica</th>
                      <th className="text-right pb-2 font-medium">Pacientes</th>
                      <th className="text-right pb-2 font-medium">Profissionais</th>
                      <th className="text-right pb-2 font-medium">Consultas (mês)</th>
                      <th className="text-right pb-2 font-medium">Consultas (total)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {ov.perClinic.map(c => (
                      <tr key={c.clinicId} className="hover:bg-gray-900/50 transition-colors">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-gray-200">{c.clinicName}</p>
                          <p className="text-xs text-gray-600 font-mono">{c.clinicId}</p>
                        </td>
                        <td className="py-3 text-right text-gray-300">{c.patients}</td>
                        <td className="py-3 text-right text-gray-300">{c.professionals}</td>
                        <td className="py-3 text-right">
                          <span className={`font-medium ${c.appointmentsThisMonth > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                            {c.appointmentsThisMonth}
                          </span>
                        </td>
                        <td className="py-3 text-right text-gray-300">{c.appointmentsTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
