import { useState } from 'react'
import { Gear, CalendarBlank, Sliders, Clock, Door, CurrencyDollar, WhatsappLogo, ClipboardText, Stethoscope, CaretDown, CaretRight, Bell } from '@phosphor-icons/react'
import { useClinic } from '../hooks/useClinic'
import DadosTab from './settings/DadosTab'
import AgendaTab from './settings/AgendaTab'
import CamposTab from './settings/CamposTab'
import DisponibilidadeTab from './settings/DisponibilidadeTab'
import SalasTab from './settings/SalasTab'
import ServicosTab from './settings/ServicosTab'
import PagamentoTab from './settings/PagamentoTab'
import WhatsAppTab from './settings/WhatsAppTab'
import AnamnesisTab from './settings/AnamnesisTab'
import NotificacoesTab from './settings/NotificacoesTab'

type Tab = 'dados' | 'agenda' | 'servicos' | 'pagamento' | 'campos' | 'disponibilidade' | 'salas' | 'anamnese' | 'whatsapp' | 'notificacoes'

type TabGroup = {
  label: string
  tabs: { id: Tab; label: string; icon: typeof Gear }[]
}

// Default groups — shown to every user on first open
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
      { id: 'servicos',  label: 'Serviços',   icon: Stethoscope   },
      { id: 'pagamento', label: 'Pagamentos', icon: CurrencyDollar },
    ],
  },
  {
    label: 'Integrações',
    tabs: [
      { id: 'whatsapp', label: 'WhatsApp', icon: WhatsappLogo },
    ],
  },
]

// Advanced tabs — hidden by default, for power users
const ADVANCED_TABS: TabGroup = {
  label: 'Avançado',
  tabs: [
    { id: 'salas',    label: 'Salas / Espaços',       icon: Door          },
    { id: 'campos',   label: 'Campos personalizados',  icon: Sliders       },
    { id: 'anamnese', label: 'Anamnese',               icon: ClipboardText },
  ],
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('dados')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { data: clinic, isLoading } = useClinic()

  if (isLoading) return <div className="text-sm text-gray-400 py-8 text-center">Carregando...</div>
  if (!clinic) return null

  // If the active tab is inside ADVANCED_TABS and advanced is collapsed, expand it
  const isAdvancedTab = ADVANCED_TABS.tabs.some(t => t.id === tab)

  function selectTab(id: Tab) {
    if (ADVANCED_TABS.tabs.some(t => t.id === id)) setShowAdvanced(true)
    setTab(id)
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-800 mb-6">Configurações</h1>

      <div className="flex gap-8 items-start">
        {/* Vertical nav with groups */}
        <nav className="w-44 flex-shrink-0 space-y-4">
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

          {/* Advanced — collapsed by default */}
          <div>
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-1.5 w-full px-3 mb-1 group"
            >
              {(showAdvanced || isAdvancedTab)
                ? <CaretDown size={10} className="text-gray-400" />
                : <CaretRight size={10} className="text-gray-400" />
              }
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest group-hover:text-gray-600 transition-colors">
                Avançado
              </p>
            </button>
            {(showAdvanced || isAdvancedTab) && (
              <div className="space-y-0.5">
                {ADVANCED_TABS.tabs.map(t => (
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
            )}
          </div>
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0 max-w-xl">
          {tab === 'dados'           && <DadosTab clinic={clinic} />}
          {tab === 'agenda'          && <AgendaTab clinic={clinic} />}
          {tab === 'servicos'        && <ServicosTab />}
          {tab === 'salas'           && <SalasTab />}
          {tab === 'pagamento'       && <PagamentoTab clinic={clinic} />}
          {tab === 'campos'          && <CamposTab clinic={clinic} />}
          {tab === 'disponibilidade' && <DisponibilidadeTab />}
          {tab === 'anamnese'        && <AnamnesisTab clinic={clinic} />}
          {tab === 'whatsapp'        && <WhatsAppTab clinic={clinic} />}
          {tab === 'notificacoes'    && <NotificacoesTab />}
        </div>
      </div>
    </div>
  )
}
