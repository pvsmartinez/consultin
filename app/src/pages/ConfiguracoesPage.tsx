import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Gear, CalendarBlank, Sliders, Clock, Door, CurrencyDollar, WhatsappLogo,
  Stethoscope, Bell, ClipboardText, UsersThree, Buildings, UsersFour,
  CheckCircle,
  GlobeHemisphereWest,
  ArrowRight,
  FileText,
  IdentificationCard,
  Package,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useClinic } from '../hooks/useClinic'
import { useClinicModules } from '../hooks/useClinicModules'
import type { ClinicModule } from '../hooks/useClinicModules'
import DadosTab from '../pages-v1/settings/DadosTab'
import DocumentosTab from '../pages-v1/settings/DocumentosTab'
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
import { trackOnboardingComplete } from '../lib/googleAds'
import { APP_ROUTES } from '../lib/appRoutes'
import { buildSettingsPath, type SettingsEntity, type SettingsTab } from '../lib/settingsNavigation'

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
    description: 'Profissionais, acessos e rotinas por pessoa.',
    icon: UsersFour,
  },
  {
    key: 'rooms',
    label: 'Salas',
    description: 'Espaços físicos e filtro por sala na agenda.',
    icon: Buildings,
  },
  {
    key: 'services',
    label: 'Tipos de consulta',
    description: 'Duração e valor padrão por atendimento.',
    icon: Stethoscope,
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    description: 'Lembretes, automações e caixa de entrada.',
    icon: WhatsappLogo,
  },
  {
    key: 'financial',
    label: 'Financeiro',
    description: 'Pagamentos, cobranças e fluxo de caixa.',
    icon: CurrencyDollar,
  },
  {
    key: 'insurance',
    label: 'Convênios',
    description: 'Particular, convênio, plano e regras de cadastro.',
    icon: IdentificationCard,
  },
  {
    key: 'inventory',
    label: 'Estoque',
    description: 'Entrada, baixa e alerta de materiais.',
    icon: Package,
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
    <div className={`rounded-2xl border px-4 py-4 transition-all ${
      active ? 'border-teal-200 bg-teal-50/60' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
          active ? 'bg-teal-100 text-[#006970]' : 'bg-gray-100 text-gray-500'
        }`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{module.label}</p>
              <p className="mt-1 text-xs text-gray-500">{module.description}</p>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              active ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-500'
            }`}>
              {active ? 'Ligado' : 'Opcional'}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggle}
            disabled={toggling}
            className={`mt-3 inline-flex min-h-10 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition ${
              active
                ? 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
                : 'bg-[#006970] text-white hover:bg-[#00535a]'
            } ${toggling ? 'opacity-50' : ''}`}
          >
            {toggling ? 'Salvando...' : active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Settings tabs ────────────────────────────────────────────────────────────

type Tab = 'dados' | 'documentos' | 'agenda' | 'servicos' | 'anamnese' | 'campos' | 'disponibilidade' | 'salas' | 'pagamento' | 'whatsapp' | 'notificacoes' | 'usuarios' | 'pagina-publica'
type TabGroupId = 'essencial' | 'cadastro' | 'operacao'

interface TabDef {
  id: Tab
  label: string
  icon: typeof Gear
  group: TabGroupId
  summary: string
  moduleRequired?: ClinicModule
}

const TABS: TabDef[] = [
  { id: 'dados',           label: 'Dados da clínica', icon: Gear, group: 'essencial', summary: 'Contato, endereço e identidade da clínica.' },
  { id: 'agenda',          label: 'Agenda', icon: CalendarBlank, group: 'essencial', summary: 'Regras centrais de duração, horários e operação.' },
  { id: 'disponibilidade', label: 'Horários', icon: Clock, group: 'essencial', summary: 'Disponibilidade da equipe e rotina semanal.' },
  { id: 'notificacoes',    label: 'Notificações', icon: Bell, group: 'essencial', summary: 'Avisos automáticos e comportamento de lembretes.' },
  { id: 'campos',          label: 'Formulários', icon: Sliders, group: 'cadastro', summary: 'Campos visíveis para pacientes e profissionais.' },
  { id: 'anamnese',        label: 'Anamnese', icon: ClipboardText, group: 'cadastro', summary: 'Estruture formulários clínicos por especialidade.' },
  { id: 'documentos',      label: 'Documentos', icon: FileText, group: 'cadastro', summary: 'Modelos e assinatura de documentos emitidos.' },
  { id: 'pagina-publica',  label: 'Página pública', icon: GlobeHemisphereWest, group: 'cadastro', summary: 'Perfil da clínica e experiência pública de agendamento.' },
  { id: 'usuarios',        label: 'Usuários e acesso', icon: UsersThree, group: 'operacao', summary: 'Convites, papéis e permissões da equipe.' },
  { id: 'servicos',        label: 'Tipos de consulta', icon: Stethoscope, group: 'operacao', summary: 'Estruture o catálogo de atendimentos.', moduleRequired: 'services' },
  { id: 'salas',           label: 'Salas', icon: Door, group: 'operacao', summary: 'Espaços físicos e distribuição da agenda.', moduleRequired: 'rooms' },
  { id: 'pagamento',       label: 'Pagamentos', icon: CurrencyDollar, group: 'operacao', summary: 'Cobrança, repasse e preferências financeiras.', moduleRequired: 'financial' },
  { id: 'whatsapp',        label: 'WhatsApp', icon: WhatsappLogo, group: 'operacao', summary: 'Canal de mensagens e automações com pacientes.', moduleRequired: 'whatsapp' },
]

const TAB_GROUPS: Array<{ id: TabGroupId; label: string }> = [
  { id: 'essencial', label: 'Base' },
  { id: 'cadastro', label: 'Cadastro' },
  { id: 'operacao', label: 'Operação' },
]

interface SetupItem {
  title: string
  hint: string
  tab: SettingsTab
  entity?: SettingsEntity
}

const SETUP_ITEMS: SetupItem[] = [
  {
    title: 'Dados da clínica',
    hint: 'Contato e endereço',
    tab: 'dados',
  },
  {
    title: 'Agenda da clínica',
    hint: 'Horários e duração',
    tab: 'agenda',
  },
  {
    title: 'Formulários',
    hint: 'Campos visíveis',
    tab: 'campos',
    entity: 'pacientes',
  },
  {
    title: 'Equipe e acessos',
    hint: 'Convites e permissões',
    tab: 'usuarios',
  },
]

function SettingsNavButton({
  tab,
  active,
  onSelect,
}: {
  tab: TabDef
  active: boolean
  onSelect: () => void
}) {
  const Icon = tab.icon

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
        active
          ? 'bg-[#006970] text-white shadow-sm'
          : 'bg-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
        active ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'
      }`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">{tab.label}</span>
      {active && <CheckCircle size={16} weight="fill" className="shrink-0 text-white" />}
    </button>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TAB_CONTENT: Record<Tab, React.ComponentType<any>> = {
  dados:           DadosTab,
  documentos:      DocumentosTab,
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
  const navigate = useNavigate()
  const { data: clinic, isLoading: clinicLoading, update } = useClinic()
  const {
    modules,
    hasRooms,
    hasStaff,
    hasWhatsApp,
    hasFinancial,
    hasServices,
    hasInsurance,
    hasInventory,
    enableModule,
    disableModule,
  } = useClinicModules()
  const [activeTab, setActiveTab] = useState<Tab>('dados')
  const [fieldEntity, setFieldEntity] = useState<SettingsEntity>('pacientes')
  const [toggling, setToggling] = useState<ClinicModule | null>(null)
  const [finishingSetup, setFinishingSetup] = useState(false)

  const setupRequested = new URLSearchParams(location.search).get('setup') === '1'

  function buildLocalSettingsPath(tab?: SettingsTab, entity?: SettingsEntity) {
    const basePath = buildSettingsPath(tab, entity)
    if (!setupRequested) return basePath

    const [pathname, queryString = ''] = basePath.split('?')
    const params = new URLSearchParams(queryString)
    params.set('setup', '1')
    const nextQuery = params.toString()
    return nextQuery ? `${pathname}?${nextQuery}` : pathname
  }

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
    insurance: hasInsurance,
    inventory: hasInventory,
  }

  async function handleModuleToggle(key: ClinicModule) {
    setToggling(key)
    try {
      if (moduleActiveMap[key]) {
        await disableModule(key)
      } else {
        await enableModule(key)
      }
    } catch {
      toast.error('Não foi possível atualizar esse módulo agora.')
    } finally {
      setToggling(null)
    }
  }

  // Only show tabs whose module is active (or has no module requirement)
  const visibleTabs = TABS.filter(t => !t.moduleRequired || moduleActiveMap[t.moduleRequired])
  const resolvedActiveTab = visibleTabs.some(tab => tab.id === activeTab) ? activeTab : 'dados'
  const activeTabMeta = TABS.find(tab => tab.id === resolvedActiveTab) ?? TABS[0]

  // If current tab becomes invisible (module disabled), go to dados
  useEffect(() => {
    if (!visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab('dados')
      navigate(buildLocalSettingsPath('dados'), { replace: true })
    }
  }, [activeTab, modules, navigate, visibleTabs])

  const TabComponent = TAB_CONTENT[resolvedActiveTab]
  const showSetupGuide = !!clinic && (!clinic.onboardingCompleted || setupRequested)
  const visibleTabsByGroup = TAB_GROUPS.map(group => ({
    ...group,
    tabs: visibleTabs.filter(tab => tab.group === group.id),
  })).filter(group => group.tabs.length > 0)

  function handleSelectTab(tab: Tab) {
    const nextEntity = tab === 'campos' ? fieldEntity : undefined
    setActiveTab(tab)
    navigate(buildLocalSettingsPath(tab, nextEntity), { replace: true })
  }

  async function handleFinishSetup() {
    if (!clinic || finishingSetup) return

    if (clinic.onboardingCompleted) {
      navigate(APP_ROUTES.staff.settings, { replace: true })
      return
    }

    setFinishingSetup(true)
    try {
      await update.mutateAsync({ onboardingCompleted: true })
      trackOnboardingComplete({ source: 'settings_setup_guide' })
      toast.success('Configuração inicial concluída.')
      navigate(APP_ROUTES.staff.settings, { replace: true })
    } catch {
      toast.error('Não foi possível concluir a configuração inicial.')
    } finally {
      setFinishingSetup(false)
    }
  }

  function handleOpenSetupItem(item: SetupItem) {
    setActiveTab(item.tab as Tab)
    if (item.entity) setFieldEntity(item.entity)
    navigate(buildLocalSettingsPath(item.tab, item.entity), { replace: true })
  }

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
      <section className="rounded-[28px] border border-gray-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,176,0.12),_transparent_42%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(247,250,252,0.98))] px-5 py-5 shadow-sm sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              Configurações
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Escolha uma área e ajuste só o que muda a rotina da clínica.
            </p>
          </div>
          <Link
            to={APP_ROUTES.staff.home}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
          >
            Voltar para a agenda
          </Link>
        </div>
      </section>

      {showSetupGuide && (
        <section className="rounded-[28px] border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-cyan-50 px-5 py-5 shadow-sm sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0ea5b0]">
                Comece pelo básico
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
                Quatro ajustes e a clínica já roda melhor.
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Use esses atalhos para acertar o essencial sem perder tempo.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleFinishSetup}
                disabled={finishingSetup}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#006970] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#00535a] disabled:opacity-50"
              >
                {clinic.onboardingCompleted ? 'Fechar guia' : finishingSetup ? 'Concluindo...' : 'Marcar como concluído'}
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {SETUP_ITEMS.map((item, index) => (
              <button
                key={`${item.tab}-${item.entity ?? 'none'}`}
                type="button"
                onClick={() => handleOpenSetupItem(item)}
                className="rounded-2xl border border-white bg-white/95 p-4 text-left shadow-sm transition hover:border-teal-200 hover:shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-800">
                      {index + 1}
                    </span>
                    <p className="mt-3 text-sm font-semibold text-gray-900">{item.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{item.hint}</p>
                  </div>
                  <ArrowRight size={18} className="mt-0.5 shrink-0 text-[#0ea5b0]" />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Módulos
            </h2>
            <p className="mt-1 text-sm text-gray-500">Ative só o que a clínica realmente vai usar.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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

      <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-gray-200 bg-white p-3 shadow-sm">
          <div className="border-b border-gray-100 px-2 pb-3 md:hidden">
            <label htmlFor="settings-tab-select" className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
              Seção
            </label>
            <select
              id="settings-tab-select"
              value={resolvedActiveTab}
              onChange={(e) => handleSelectTab(e.target.value as Tab)}
              className="min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
            >
              {visibleTabs.map(tab => (
                <option key={tab.id} value={tab.id}>{tab.label}</option>
              ))}
            </select>
            <p className="mt-3 text-sm text-gray-500">{activeTabMeta.summary}</p>
          </div>

          <div className="hidden space-y-4 md:block">
            {visibleTabsByGroup.map(group => (
              <div key={group.id}>
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.tabs.map(tab => (
                    <SettingsNavButton
                      key={tab.id}
                      tab={tab}
                      active={resolvedActiveTab === tab.id}
                      onSelect={() => handleSelectTab(tab.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-5 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-[#006970]">
                <activeTabMeta.icon size={20} />
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-gray-900">{activeTabMeta.label}</h2>
                <p className="mt-1 text-sm text-gray-500">{activeTabMeta.summary}</p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <TabComponent clinic={clinic} fieldEntity={resolvedActiveTab === 'campos' ? fieldEntity : undefined} />
          </div>
        </section>
      </section>
    </div>
  )
}
