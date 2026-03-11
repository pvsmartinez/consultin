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
    <div>
      <h1 className="text-lg font-semibold text-gray-800 mb-6">Configurações</h1>

      <div className="flex gap-8 items-start">
        {/* Vertical nav with groups */}
        <nav className="w-48 flex-shrink-0 space-y-4">
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
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
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
        <div className="flex-1 min-w-0 max-w-xl">
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
