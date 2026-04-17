import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Gear, CalendarBlank, Sliders, Clock, Door, CurrencyDollar, WhatsappLogo,
  Stethoscope, Bell, ClipboardText, UsersThree, Buildings, UsersFour, ToggleRight, ToggleLeft,
  CheckCircle,
  GlobeHemisphereWest,
} from '@phosphor-icons/react'
import { useClinic } from '../hooks/useClinic'
import { useClinicModules } from '../hooks/useClinicModules'
import type { ClinicModule } from '../hooks/useClinicModules'
import DadosTab from '../pages-v1/settings/DadosTab'
import AgendaTab from '../pages-v1/settings/AgendaTab'
import CamposTab from '../pages-v1/settings/CamposTab'
import DisponibilidadeTab from '../pages-v1/settings/DisponibilidadeTab'
import SalasTab from '../pages-v1/settings/SalasTab'
import ServicosTab from '../pages-v1/settings/ServicosTab'
import PagamentoTab from '../pages-v1/settings/PagamentoTab'
import WhatsAppTab from '../pages-v1/settings/WhatsAppTab'
import NotificacoesTab from '../pages-v1/settings/NotificacoesTab'
import UsuariosTab from '../pages-v1/settings/UsuariosTab'
import AnamnesisTab from '../pages-v1/settings/AnamnesisTab'
import PaginaPublicaTab from '../pages-v1/settings/PaginaPublicaTab'
import type { SettingsEntity } from '../lib/settingsNavigation'

// ─── Module cards ─────────────────────────────────────────────────────────────

interface ModuleDef {
  key: ClinicModule
  label: string
  description: string
  icon: typeof Buildings
}

const MODULES: ModuleDef[] = [
  {
    key: 'staff',
    label: 'Equipe',
    description: 'Múltiplos profissionais, controle de acesso e horários individuais.',
    icon: UsersFour,
  },
  {
    key: 'rooms',
    label: 'Salas',
    description: 'Gerencie salas e espaços físicos. A agenda passa a filtrar por sala.',
    icon: Buildings,
  },
  {
    key: 'services',
    label: 'Tipos de consulta',
    description: 'Cadastre tipos de atendimento com duração e valor padrão.',
    icon: Stethoscope,
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    description: 'Notificações automáticas, lembretes e caixa de entrada de mensagens.',
    icon: WhatsappLogo,
  },
  {
    key: 'financial',
    label: 'Financeiro',
    description: 'Controle de pagamentos, cobranças e fluxo de caixa da clínica.',
    icon: CurrencyDollar,
  },
]

function ModuleCard({
  module,
  active,
  onToggle,
  toggling,
}: {
  module: ModuleDef
  active: boolean
  onToggle: () => void
  toggling: boolean
}) {
  const Icon = module.icon
  return (
    <div className={`rounded-2xl border p-5 flex items-start gap-4 transition-all ${
      active ? 'border-teal-200 bg-teal-50/40' : 'border-gray-200 bg-white'
    }`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
        active ? 'bg-teal-100 text-[#006970]' : 'bg-gray-100 text-gray-400'
      }`}>
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-gray-800">{module.label}</p>
          <button
            onClick={onToggle}
            disabled={toggling}
            className={`flex-shrink-0 transition-opacity ${toggling ? 'opacity-50' : ''}`}
            title={active ? 'Desativar módulo' : 'Ativar módulo'}
          >
            {active
              ? <ToggleRight size={28} className="text-[#0ea5b0]" weight="fill" />
              : <ToggleLeft size={28} className="text-gray-300" weight="fill" />
            }
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">{module.description}</p>
        {active && (
          <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-medium text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
            <CheckCircle size={10} weight="fill" />
            Ativo
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Settings tabs ────────────────────────────────────────────────────────────

type Tab = 'dados' | 'agenda' | 'servicos' | 'anamnese' | 'campos' | 'disponibilidade' | 'salas' | 'pagamento' | 'whatsapp' | 'notificacoes' | 'usuarios' | 'pagina-publica'

interface TabDef {
  id: Tab
  label: string
  icon: typeof Gear
  moduleRequired?: ClinicModule
}

const TABS: TabDef[] = [
  { id: 'dados',           label: 'Dados da clínica', icon: Gear },
  { id: 'agenda',          label: 'Agenda',            icon: CalendarBlank },
  { id: 'disponibilidade', label: 'Horários',          icon: Clock },
  { id: 'notificacoes',    label: 'Notificações',      icon: Bell },
  { id: 'servicos',        label: 'Tipos de consulta', icon: Stethoscope,  moduleRequired: 'services' },
  { id: 'salas',           label: 'Salas',             icon: Door,         moduleRequired: 'rooms' },
  { id: 'pagamento',       label: 'Pagamentos',        icon: CurrencyDollar, moduleRequired: 'financial' },
  { id: 'campos',          label: 'Formulários',       icon: Sliders },
  { id: 'anamnese',        label: 'Anamnese',          icon: ClipboardText },
  { id: 'usuarios',        label: 'Usuários e acesso', icon: UsersThree },
  { id: 'pagina-publica',  label: 'Página pública',    icon: GlobeHemisphereWest },
  { id: 'whatsapp',        label: 'WhatsApp',          icon: WhatsappLogo, moduleRequired: 'whatsapp' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TAB_CONTENT: Record<Tab, React.ComponentType<any>> = {
  dados:           DadosTab,
  agenda:          AgendaTab,
  disponibilidade: DisponibilidadeTab,
  notificacoes:    NotificacoesTab,
  servicos:        ServicosTab,
  anamnese:        AnamnesisTab,
  salas:           SalasTab,
  pagamento:       PagamentoTab,
  campos:          CamposTab,
  usuarios:        UsuariosTab,
  'pagina-publica': PaginaPublicaTab,
  whatsapp:        WhatsAppTab,
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfiguracoesPage() {
  const location = useLocation()
  const { data: clinic, isLoading: clinicLoading } = useClinic()
  const { modules, hasRooms, hasStaff, hasWhatsApp, hasFinancial, hasServices, enableModule, disableModule } = useClinicModules()
  const [activeTab, setActiveTab] = useState<Tab>('dados')
  const [fieldEntity, setFieldEntity] = useState<SettingsEntity>('pacientes')
  const [toggling, setToggling] = useState<ClinicModule | null>(null)

  // Support ?tab=xxx&entity=yyy or state.tab navigation from other pages
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tabParam = params.get('tab') ?? (location.state as { tab?: string } | null)?.tab
    const entityParam = params.get('entity') ?? (location.state as { entity?: string } | null)?.entity

    if (tabParam && TABS.some(t => t.id === tabParam)) {
      setActiveTab(tabParam as Tab)
    }
    if (entityParam === 'pacientes' || entityParam === 'profissionais') {
      setFieldEntity(entityParam)
    }
  }, [location.search, location.state])

  const moduleActiveMap: Record<ClinicModule, boolean> = {
    rooms:     hasRooms,
    staff:     hasStaff,
    services:  hasServices,
    whatsapp:  hasWhatsApp,
    financial: hasFinancial,
  }

  async function handleModuleToggle(key: ClinicModule) {
    setToggling(key)
    if (moduleActiveMap[key]) {
      await disableModule(key)
    } else {
      await enableModule(key)
    }
    setToggling(null)
  }

  // Only show tabs whose module is active (or has no module requirement)
  const visibleTabs = TABS.filter(t => !t.moduleRequired || moduleActiveMap[t.moduleRequired])

  // If current tab becomes invisible (module disabled), go to dados
  useEffect(() => {
    if (!visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab('dados')
    }
  }, [activeTab, modules, visibleTabs])

  const TabComponent = TAB_CONTENT[activeTab]

  if (clinicLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-400">
        Carregando configurações...
      </div>
    )
  }

  if (!clinic) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
        <p className="text-sm font-medium text-amber-900">Não foi possível carregar a clínica.</p>
        <p className="text-xs text-amber-700 mt-1">Recarregue a página e tente novamente.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="rounded-[28px] bg-white/90 border border-gray-200/80 shadow-sm px-6 py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0ea5b0] mb-2">
          Configurações
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">Configurações da clínica</h1>
        <p className="text-sm text-gray-500">
          Configure sua agenda, ative módulos adicionais e personalize a experiência.
        </p>
      </section>

      {/* Modules section */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 px-1">
          Módulos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {MODULES.map(m => (
            <ModuleCard
              key={m.key}
              module={m}
              active={moduleActiveMap[m.key]}
              onToggle={() => handleModuleToggle(m.key)}
              toggling={toggling === m.key}
            />
          ))}
        </div>
      </section>

      {/* Settings tabs */}
      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-gray-100 px-2 pt-2 gap-1">
          {visibleTabs.map(tab => {
            const TabIcon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-t-lg whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  isActive
                    ? 'border-[#0ea5b0] text-[#006970] bg-teal-50/60'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <TabIcon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="p-6">
          <TabComponent clinic={clinic} fieldEntity={activeTab === 'campos' ? fieldEntity : undefined} />
        </div>
      </section>
    </div>
  )
}
