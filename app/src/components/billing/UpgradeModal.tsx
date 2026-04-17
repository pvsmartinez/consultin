/**
 * UpgradeModal — shown when clinic hits appointment quota or trial expired
 */
import { X, CheckCircle } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import type { ClinicQuota } from '../../hooks/useClinicQuota'
import { TIER_PRICES } from '../../hooks/useClinicQuota'

const PLANS = [
  {
    tier: 'basic' as const,
    name: 'Básico',
    limit: 'Até 40 consultas/mês',
    perks: ['Agenda completa', 'Prontuários', 'Gestão de pacientes', 'Acesso ao suporte'],
    highlight: false,
  },
  {
    tier: 'professional' as const,
    name: 'Profissional',
    limit: 'Até 100 consultas/mês',
    perks: ['Tudo do Básico', 'Financeiro + repasses', 'WhatsApp IA', 'Acesso ao suporte'],
    highlight: true,
  },
  {
    tier: 'unlimited' as const,
    name: 'Ilimitado',
    limit: 'Consultas ilimitadas',
    perks: ['Tudo do Profissional', 'Multi-profissional', 'Relatórios avançados', 'Acesso ao suporte'],
    highlight: false,
  },
]

interface Props {
  quota: ClinicQuota
  onClose: () => void
}

export default function UpgradeModal({ quota, onClose }: Props) {
  const navigate = useNavigate()

  function goToSubscription() {
    onClose()
    navigate('/assinatura')
  }

  const title = quota.subscriptionRequired
    ? 'Período de teste encerrado'
    : 'Limite de consultas atingido'

  const subtitle = quota.subscriptionRequired
    ? 'Seu período de teste gratuito expirou. Assine um plano para continuar agendando consultas.'
    : `Você atingiu ${quota.used} consultas este mês (limite do plano). Faça upgrade para continuar.`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 p-4 sm:p-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-sm">{subtitle}</p>
          </div>
          <button onClick={onClose} className="ml-4 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:p-6">
          {PLANS.map(plan => (
            <div
              key={plan.tier}
              className={`relative rounded-xl border p-4 flex flex-col gap-3 ${
                plan.highlight
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold bg-indigo-600 text-white px-2.5 py-0.5 rounded-full whitespace-nowrap">
                  Mais popular
                </span>
              )}
              <div>
                <p className={`text-sm font-semibold ${plan.highlight ? 'text-indigo-900' : 'text-gray-800'}`}>
                  {plan.name}
                </p>
                <p className={`text-xs mt-0.5 ${plan.highlight ? 'text-indigo-600' : 'text-gray-500'}`}>
                  {plan.limit}
                </p>
              </div>
              <div className="flex items-end gap-1">
                <span className={`text-2xl font-bold ${plan.highlight ? 'text-indigo-700' : 'text-gray-800'}`}>
                  R$&nbsp;{TIER_PRICES[plan.tier]}
                </span>
                <span className="text-xs text-gray-400 mb-1">/mês</span>
              </div>
              <ul className="space-y-1.5 flex-1">
                {plan.perks.map(perk => (
                  <li key={perk} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <CheckCircle size={13} className="text-teal-500 shrink-0" weight="fill" />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:items-center sm:px-6 sm:pb-6">
          <button
            onClick={goToSubscription}
            className="min-h-11 w-full rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 sm:w-auto"
          >
            Assinar agora
          </button>
          <button
            onClick={onClose}
            className="min-h-11 rounded-lg px-4 py-2.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
