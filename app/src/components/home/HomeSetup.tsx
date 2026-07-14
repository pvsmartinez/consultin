import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CalendarPlus,
  CheckCircle,
  Circle,
  CurrencyDollar,
  DoorOpen,
  Storefront,
  UsersThree,
  WhatsappLogo,
} from '@phosphor-icons/react'
import { buildSettingsPath } from '../../lib/settingsNavigation'
import type { ClinicModule } from '../../hooks/useClinicModules'
import type { Clinic } from '../../types'
import { CardEyebrow, HomeCard } from './HomeShared'

interface SetupStep {
  key: string
  title: string
  desc: string
  done: boolean
  action: () => void
}

interface ModuleChip {
  key: ClinicModule
  label: string
  icon: typeof WhatsappLogo
  active: boolean
}

/**
 * First-run "getting started" home for a fresh clinic. Replaces the old module-toggle
 * dump: setup lives in a checklist, optional modules become discreet chips.
 */
export default function HomeSetup({
  clinic,
  activeProfessionals,
  roomsCount,
  hasAnyAppointment,
  hasWhatsApp,
  hasFinancial,
  hasInventory,
  enableModule,
  disableModule,
  onNewAppointment,
}: {
  clinic?: Clinic
  activeProfessionals: number
  roomsCount: number
  hasAnyAppointment: boolean
  hasWhatsApp: boolean
  hasFinancial: boolean
  hasInventory: boolean
  enableModule: (m: ClinicModule) => Promise<void>
  disableModule: (m: ClinicModule) => Promise<void>
  onNewAppointment: () => void
}) {
  const navigate = useNavigate()
  const [toggling, setToggling] = useState<ClinicModule | null>(null)

  const dataDone = !!clinic?.name && !!(clinic?.phone || clinic?.email || clinic?.address)
  const hoursDone = !!clinic?.workingHours && Object.keys(clinic.workingHours).length > 0

  const steps: SetupStep[] = [
    {
      key: 'dados',
      title: 'Dados da clínica',
      desc: 'Nome, contato e endereço exibidos para a equipe.',
      done: dataDone,
      action: () => navigate(buildSettingsPath('dados')),
    },
    {
      key: 'agenda',
      title: 'Horário de funcionamento',
      desc: 'Defina os dias e horários em que a clínica atende.',
      done: hoursDone,
      action: () => navigate(buildSettingsPath('agenda')),
    },
    {
      key: 'profissionais',
      title: 'Adicionar profissionais',
      desc: 'Cadastre quem atende e defina os acessos.',
      done: activeProfessionals > 0,
      action: () => navigate(buildSettingsPath('usuarios')),
    },
    {
      key: 'salas',
      title: 'Cadastrar salas',
      desc: 'Consultórios, cadeiras ou boxes de atendimento.',
      done: roomsCount > 0,
      action: () => navigate(buildSettingsPath('salas')),
    },
    {
      key: 'consulta',
      title: 'Marcar a primeira consulta',
      desc: 'Teste a agenda com um paciente real.',
      done: hasAnyAppointment,
      action: onNewAppointment,
    },
  ]

  const doneCount = steps.filter(s => s.done).length
  const pct = Math.round((doneCount / steps.length) * 100)

  const chips: ModuleChip[] = [
    { key: 'whatsapp', label: 'WhatsApp', icon: WhatsappLogo, active: hasWhatsApp },
    { key: 'financial', label: 'Financeiro', icon: CurrencyDollar, active: hasFinancial },
    { key: 'inventory', label: 'Estoque', icon: Storefront, active: hasInventory },
  ]

  const stepIcon = (key: string, done: boolean) => {
    if (done) return <CheckCircle size={22} weight="fill" className="text-emerald-500" />
    const map: Record<string, typeof UsersThree> = {
      dados: Circle,
      agenda: Circle,
      profissionais: UsersThree,
      salas: DoorOpen,
      consulta: CalendarPlus,
    }
    const Icon = map[key] ?? Circle
    return <Icon size={22} weight="duotone" className="text-gray-300" />
  }

  const toggleModule = async (m: ClinicModule, active: boolean) => {
    setToggling(m)
    try {
      if (active) await disableModule(m)
      else await enableModule(m)
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-gray-500">
        Faltam poucos passos para começar a operar
        {clinic?.name ? ` a ${clinic.name}` : ' a clínica'}.
      </p>

      <HomeCard>
        <div className="flex items-center justify-between">
          <CardEyebrow>Progresso da configuração</CardEyebrow>
          <span className="text-sm font-semibold text-[#0b7b83]">
            {doneCount} de {steps.length} · {pct}%
          </span>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#eef4f4]">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #0ea5b0 0%, #006970 100%)',
            }}
          />
        </div>

        <div className="mt-5 space-y-2.5">
          {steps.map(step => (
            <div
              key={step.key}
              className={`flex items-center gap-3.5 rounded-2xl border p-4 ${
                step.done ? 'border-emerald-100 bg-emerald-50/40' : 'border-gray-100 bg-[#fbfcfc]'
              }`}
            >
              <div className="shrink-0">{stepIcon(step.key, step.done)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                <p className="truncate text-xs text-gray-500">{step.desc}</p>
              </div>
              {step.done ? (
                <span className="shrink-0 text-xs font-semibold text-emerald-600">Concluído</span>
              ) : (
                <button
                  type="button"
                  onClick={step.action}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-[#0ea5b0]/40 hover:text-[#0ea5b0]"
                >
                  Configurar <ArrowRight size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </HomeCard>

      <HomeCard>
        <CardEyebrow>Recursos opcionais</CardEyebrow>
        <p className="mt-1.5 text-sm text-gray-500">
          Ligue quando precisar. Também disponível em Configurações.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {chips.map(chip => {
            const Icon = chip.icon
            const busy = toggling === chip.key
            return (
              <button
                key={chip.key}
                type="button"
                disabled={busy}
                onClick={() => toggleModule(chip.key, chip.active)}
                className={`inline-flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                  chip.active
                    ? 'border-[#bfe6e5] bg-teal-50/60 text-[#006970]'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-[#0ea5b0]/40'
                }`}
              >
                <Icon
                  size={18}
                  weight="duotone"
                  className={chip.active ? 'text-[#0ea5b0]' : 'text-gray-400'}
                />
                {chip.label}
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    chip.active ? 'bg-[#0ea5b0] text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {chip.active ? 'Ativo' : 'Ativar'}
                </span>
              </button>
            )
          })}
        </div>
      </HomeCard>
    </div>
  )
}
