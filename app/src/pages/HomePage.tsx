import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Buildings,
  CalendarBlank,
  CheckCircle,
  CurrencyDollar,
  Gear,
  House,
  Plus,
  UsersFour,
  WhatsappLogo,
} from '@phosphor-icons/react'
import AppointmentModal from '../components/appointments/AppointmentModal'
import UpgradeModal from '../components/billing/UpgradeModal'
import { useAuthContext } from '../contexts/AuthContext'
import { useClinic } from '../hooks/useClinic'
import { useClinicModules } from '../hooks/useClinicModules'
import { useClinicQuota } from '../hooks/useClinicQuota'
import { useProfessionals } from '../hooks/useProfessionals'
import { useCreateRoom, useRooms } from '../hooks/useRooms'
import { APP_ROUTES } from '../lib/appRoutes'
import { buildSettingsPath, type SettingsTab } from '../lib/settingsNavigation'

const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export default function HomePage() {
  const navigate = useNavigate()
  const { role, session, profile, hasPermission } = useAuthContext()
  const { data: clinic } = useClinic()
  const {
    modules,
    hasRooms,
    hasStaff,
    hasWhatsApp,
    hasFinancial,
    enableModule,
    disableModule,
  } = useClinicModules()
  const { data: rooms = [] } = useRooms()
  const createRoom = useCreateRoom()
  const { data: professionals = [], create: createProfessional } = useProfessionals()
  const quota = useClinicQuota(clinic)

  const [modalOpen, setModalOpen] = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [togglingModule, setTogglingModule] = useState<string | null>(null)

  const canSchedule = role === 'admin' || role === 'receptionist'
  const canManageSettings = hasPermission('canManageSettings')

  const todayStatus = useMemo(() => {
    const today = new Date()
    const dayKey = DAY_ORDER[today.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6]
    const todayHours = clinic?.workingHours?.[dayKey]
    return todayHours
      ? `Hoje: ${todayHours.start}–${todayHours.end}`
      : 'Hoje sem horário configurado'
  }, [clinic?.workingHours])

  const activeRooms = rooms.filter(room => room.active).length
  const activeProfessionals = professionals.filter(professional => professional.active).length

  function openNewAppointmentModal() {
    if (quota.subscriptionRequired || quota.exceeded) {
      setUpgradeModalOpen(true)
      return
    }

    setModalOpen(true)
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.9fr)]">
        <section className="rounded-[28px] border border-[#bfe6e5] bg-[linear-gradient(135deg,#f4fffe_0%,#ebfbfb_45%,#f8fbff_100%)] p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0ea5b0] shadow-sm">
                <House size={28} weight="duotone" />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#0b7b83]">Home</p>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                    {clinic?.name ? `Operação da ${clinic.name}` : 'Centro de operação da clínica'}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                    A agenda agora fica sempre no calendário. Use esta Home para abrir a operação do dia,
                    disparar ações rápidas e ligar módulos quando precisar.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Agenda</p>
                <p className="mt-2 text-lg font-semibold text-gray-900">{todayStatus}</p>
                <p className="mt-1 text-sm text-gray-500">Abra o calendário completo mesmo quando não houver nenhuma consulta.</p>
              </div>

              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Estrutura</p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {activeProfessionals} profissional{activeProfessionals === 1 ? '' : 'is'} · {activeRooms} sala{activeRooms === 1 ? '' : 's'}
                </p>
                <p className="mt-1 text-sm text-gray-500">Resumo rápido do que está ativo para o time operar hoje.</p>
              </div>

              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Módulos</p>
                <p className="mt-2 text-lg font-semibold text-gray-900">{modules.length} ativo{modules.length === 1 ? '' : 's'}</p>
                <p className="mt-1 text-sm text-gray-500">Equipe, salas, WhatsApp e financeiro podem ser ajustados daqui.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate(APP_ROUTES.staff.agenda)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-sm transition-transform active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
              >
                <CalendarBlank size={16} /> Abrir agenda
              </button>

              {canSchedule && (
                <button
                  type="button"
                  onClick={openNewAppointmentModal}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition-colors hover:border-[#0ea5b0]/40 hover:text-[#0ea5b0]"
                >
                  <Plus size={16} /> Nova consulta
                </button>
              )}

              {canManageSettings && (
                <button
                  type="button"
                  onClick={() => navigate(buildSettingsPath('agenda'))}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition-colors hover:border-[#0ea5b0]/40 hover:text-[#0ea5b0]"
                >
                  <Gear size={16} /> Configurar horários
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm sm:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Ajustes rápidos</p>
            <h2 className="mt-2 text-xl font-semibold text-gray-900">Onde mexer sem procurar menu</h2>
          </div>

          <div className="mt-5 space-y-3">
            {([
              {
                label: 'Dados da clínica',
                desc: 'Nome, contato, endereço e informações exibidas para a equipe.',
                tab: 'dados' as SettingsTab,
              },
              {
                label: 'Regras da agenda',
                desc: 'Horários, duração padrão e comportamento operacional da clínica.',
                tab: 'agenda' as SettingsTab,
              },
              {
                label: 'Equipe e acesso',
                desc: 'Usuários, convites, permissões e profissionais vinculados.',
                tab: 'usuarios' as SettingsTab,
              },
            ]).map(item => (
              <button
                key={item.tab}
                type="button"
                onClick={() => navigate(buildSettingsPath(item.tab))}
                className="flex w-full items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-[#fbfcfc] p-4 text-left transition-colors hover:border-[#0ea5b0]/35 hover:bg-[#f6fdfd]"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="mt-1 text-sm leading-6 text-gray-500">{item.desc}</p>
                </div>
                <ArrowRight size={18} className="mt-0.5 shrink-0 text-gray-400" />
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm sm:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Módulos</p>
          <h2 className="mt-2 text-xl font-semibold text-gray-900">Extras disponíveis</h2>
          <p className="mt-1 text-sm text-gray-500">
            Ligue recursos quando a clínica precisar. Os ativos continuam acessíveis pelos menus próprios.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {([
            { key: 'staff' as const, label: 'Equipe', desc: 'Múltiplos profissionais e horários individuais.', icon: UsersFour, active: hasStaff, tab: 'usuarios' as SettingsTab },
            { key: 'rooms' as const, label: 'Salas', desc: 'Gerencie consultórios, cadeiras, boxes e filtros por espaço.', icon: Buildings, active: hasRooms, tab: 'salas' as SettingsTab },
            { key: 'whatsapp' as const, label: 'WhatsApp', desc: 'Lembretes automáticos, confirmações e caixa de mensagens.', icon: WhatsappLogo, active: hasWhatsApp, tab: 'whatsapp' as SettingsTab },
            { key: 'financial' as const, label: 'Financeiro', desc: 'Cobranças, pagamentos e fluxo de caixa da clínica.', icon: CurrencyDollar, active: hasFinancial, tab: 'pagamento' as SettingsTab },
          ]).map(({ key, label, desc, icon: Icon, active, tab }) => (
            <button
              key={key}
              type="button"
              disabled={togglingModule === key}
              onClick={async () => {
                setTogglingModule(key)

                if (active) {
                  await disableModule(key)
                  setTogglingModule(null)
                  return
                }

                await enableModule(key)

                if (key === 'rooms' && rooms.length === 0) {
                  await createRoom.mutateAsync({ name: 'Sala 1', color: '#6366f1' })
                }

                if (key === 'staff' && professionals.length === 0) {
                  await createProfessional.mutateAsync({
                    name: profile?.name ?? session?.user.email ?? 'Profissional',
                    email: session?.user.email ?? null,
                    userId: session?.user.id ?? null,
                    specialty: null,
                    councilId: null,
                    phone: null,
                    active: true,
                    customFields: {},
                  })
                }

                setTogglingModule(null)
                navigate(buildSettingsPath(tab))
              }}
              className={`rounded-2xl border p-4 text-left transition-all ${
                active
                  ? 'border-teal-200 bg-teal-50/50'
                  : 'border-gray-200 bg-white hover:border-teal-200 hover:bg-teal-50/20'
              } disabled:opacity-60`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  active ? 'bg-teal-100 text-[#006970]' : 'bg-gray-100 text-gray-400'
                }`}>
                  <Icon size={18} />
                </div>

                {active ? (
                  <CheckCircle size={18} weight="fill" className="text-[#0ea5b0]" />
                ) : (
                  <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                    Ativar
                  </span>
                )}
              </div>

              <p className="text-sm font-semibold text-gray-800">{label}</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-400">{desc}</p>
            </button>
          ))}
        </div>
      </section>

      <AppointmentModal open={modalOpen} onClose={() => setModalOpen(false)} />

      {upgradeModalOpen && (
        <UpgradeModal quota={quota} onClose={() => setUpgradeModalOpen(false)} />
      )}
    </div>
  )
}