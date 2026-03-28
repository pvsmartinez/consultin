import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Gear, CalendarBlank, Sliders, Clock, Door, CurrencyDollar, WhatsappLogo, Stethoscope, Bell, UsersThree } from '@phosphor-icons/react'
import { useClinic } from '../hooks/useClinic'
import DadosTab from './settings/DadosTab'
import AgendaTab from './settings/AgendaTab'
import CamposTab from './settings/CamposTab'
import DisponibilidadeTab from './settings/DisponibilidadeTab'
import SalasTab from './settings/SalasTab'
import ServicosTab from './settings/ServicosTab'
import PagamentoTab from './settings/PagamentoTab'
import WhatsAppTab from './settings/WhatsAppTab'
import NotificacoesTab from './settings/NotificacoesTab'
import UsuariosTab from './settings/UsuariosTab'

type Tab = 'dados' | 'agenda' | 'servicos' | 'pagamento' | 'campos' | 'disponibilidade' | 'salas' | 'anamnese' | 'whatsapp' | 'notificacoes' | 'usuarios'

type TabGroup = {
  label: string
  tabs: { id: Tab; label: string; icon: typeof Gear }[]
}

// Navigation groups
const TAB_GROUPS: TabGroup[] = [
  {
    label: 'Clínica',
    tabs: [
      { id: 'dados',           label: 'Dados da clínica', icon: Gear         },
      { id: 'agenda',          label: 'Agenda',           icon: CalendarBlank },
      { id: 'disponibilidade', label: 'Horários',         icon: Clock         },
      { id: 'notificacoes',    label: 'Notificações',     icon: Bell          },
    ],
  },
  {
    label: 'Atendimento',
    tabs: [
      { id: 'servicos',  label: 'Serviços',         icon: Stethoscope    },
      { id: 'salas',     label: 'Salas / Espaços',  icon: Door           },
      { id: 'pagamento', label: 'Pagamentos',        icon: CurrencyDollar },
    ],
  },
  {
    label: 'Cadastros',
    tabs: [
      { id: 'campos',   label: 'Campos e formulários', icon: Sliders     },
      { id: 'usuarios', label: 'Usuários e acesso',     icon: UsersThree  },
    ],
  },
  {
    label: 'Integrações',
    tabs: [
      { id: 'whatsapp', label: 'WhatsApp', icon: WhatsappLogo },
    ],
  },
]

const TAB_LABELS: Record<Tab, string> = {
  dados: 'Dados da clínica',
  agenda: 'Agenda',
  servicos: 'Serviços',
  pagamento: 'Pagamentos',
  campos: 'Campos e formulários',
  disponibilidade: 'Horários',
  salas: 'Salas e espaços',
  anamnese: 'Anamnese',
  whatsapp: 'WhatsApp',
  notificacoes: 'Notificações',
  usuarios: 'Usuários e acesso',
}

export default function SettingsPage() {
  const location = useLocation()
  const [tab, setTab] = useState<Tab>(() => {
    const state = location.state as { tab?: Tab } | null
    return state?.tab ?? 'dados'
  })
  const { data: clinic, isLoading } = useClinic()

  // React to navigation with state (e.g. from PatientsPage "Personalizar campos" button)
  useEffect(() => {
    const state = location.state as { tab?: Tab } | null
    if (state?.tab) setTab(state.tab)
  }, [location.state])

  if (isLoading) return <div className="text-sm text-gray-400 py-8 text-center">Carregando...</div>
  if (!clinic) return null

  function selectTab(id: Tab) { setTab(id) }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white/90 border border-gray-200/80 shadow-sm px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0ea5b0] mb-2">Operação clínica</p>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">Configurações</h1>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-50 text-[#006970] border border-teal-100">
                {TAB_LABELS[tab]}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-2 max-w-2xl">
              Centralize regras da agenda, cadastros, equipe, integrações e preferências da clínica.
            </p>
          </div>

          <div className="rounded-2xl bg-[#f8fafb] px-4 py-3 border border-gray-100 min-w-[220px]">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Clínica ativa</p>
            <p className="text-base font-semibold text-gray-900 truncate">{clinic.name}</p>
          </div>
        </div>
      </section>

      <div className="flex gap-6 items-start">
        {/* Vertical nav with groups */}
        <nav className="w-64 flex-shrink-0 space-y-4 rounded-[24px] bg-white border border-gray-200 shadow-sm p-4">
          {TAB_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1">{group.label}</p>
              <div className="space-y-0.5">
                {group.tabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => selectTab(t.id)}
                    className={`flex items-center gap-2.5 px-3 py-2 w-full text-sm rounded-lg transition-colors text-left ${
                      tab === t.id
                        ? 'bg-teal-50 text-[#006970] font-semibold'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-[#0ea5b0]'
                    }`}
                  >
                    <t.icon size={16} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0 max-w-4xl rounded-[24px] bg-white border border-gray-200 shadow-sm p-6">
          {tab === 'dados'           && <DadosTab clinic={clinic} />}
          {tab === 'agenda'          && <AgendaTab clinic={clinic} />}
          {tab === 'servicos'        && <ServicosTab />}
          {tab === 'salas'           && <SalasTab />}
          {tab === 'pagamento'       && <PagamentoTab clinic={clinic} />}
          {tab === 'campos'          && <CamposTab clinic={clinic} />}
          {tab === 'usuarios'        && <UsuariosTab />}
          {tab === 'disponibilidade' && <DisponibilidadeTab />}
          {tab === 'whatsapp'        && <WhatsAppTab clinic={clinic} />}
          {tab === 'notificacoes'    && <NotificacoesTab />}
        </div>
      </div>
    </div>
  )
}
