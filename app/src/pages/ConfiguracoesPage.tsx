import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import type { Clinic } from '../types'
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

interface ModuleDef {
  key: ClinicModule
  label: string
  description: string
  bestFor: string
  outcome: string
  icon: typeof Buildings
}

const MODULES: ModuleDef[] = [
  {
    key: 'staff',
    label: 'Equipe',
    description: 'Organize profissionais, acessos e regras individuais da rotina.',
    bestFor: 'Vale ativar quando a clínica tem mais de um profissional ou precisa separar permissões.',
    outcome: 'Você passa a controlar convites, disponibilidade por pessoa e responsabilidade em cada atendimento.',
    icon: UsersFour,
  },
  {
    key: 'rooms',
    label: 'Salas',
    description: 'Distribua a agenda por consultório, cadeira, box ou sala.',
    bestFor: 'Faz sentido quando o espaço físico limita o atendimento e precisa evitar conflito de uso.',
    outcome: 'A agenda ganha organização por ambiente e a equipe enxerga onde cada atendimento acontece.',
    icon: Buildings,
  },
  {
    key: 'services',
    label: 'Tipos de consulta',
    description: 'Defina atendimentos com nome, duração e valor padrão.',
    bestFor: 'Use quando retorno, avaliação e procedimentos seguem regras diferentes.',
    outcome: 'O time agenda com mais consistência e reduz erros de duração ou cobrança.',
    icon: Stethoscope,
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    description: 'Conecte lembretes, automações e conversa com pacientes.',
    bestFor: 'Ative se a clínica confirma consultas ou atende pacientes pelo WhatsApp no dia a dia.',
    outcome: 'Você centraliza comunicação recorrente sem depender de envios manuais.',
    icon: WhatsappLogo,
  },
  {
    key: 'financial',
    label: 'Financeiro',
    description: 'Acompanhe cobranças, recebimentos e preferências de pagamento.',
    bestFor: 'Ideal para clínicas que querem controlar o financeiro dentro do Consultin.',
    outcome: 'A clínica ganha visibilidade do que entrou, do que falta cobrar e de como cada atendimento foi pago.',
    icon: CurrencyDollar,
  },
  {
    key: 'insurance',
    label: 'Convênios',
    description: 'Estruture atendimento particular, plano e convênio no mesmo fluxo.',
    bestFor: 'Recomendado quando a clínica mistura repasses, carteirinhas ou regras por operadora.',
    outcome: 'O cadastro e a operação passam a respeitar o tipo de cobertura de cada paciente.',
    icon: IdentificationCard,
  },
  {
    key: 'inventory',
    label: 'Estoque',
    description: 'Controle entrada, baixa e alerta de materiais da clínica.',
    bestFor: 'Útil para clínicas com insumos, kits ou materiais de reposição frequente.',
    outcome: 'A equipe evita falta de material e acompanha consumo sem planilhas paralelas.',
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
        <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
          active ? 'bg-teal-100 text-[#006970]' : 'bg-gray-100 text-gray-500'
        }`}>
          <Icon size={18} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{module.label}</p>
              <p className="mt-1 text-sm text-gray-600">{module.description}</p>
            </div>

            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              active ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-500'
            }`}>
              {active ? 'Ligado' : 'Opcional'}
            </span>
          </div>

          <dl className="mt-3 space-y-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                Quando ativar
              </dt>
              <dd className="mt-1 text-sm text-gray-600">{module.bestFor}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                O que muda
              </dt>
              <dd className="mt-1 text-sm text-gray-600">{module.outcome}</dd>
            </div>
          </dl>

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

type Tab =
  | 'modulos'
  | 'dados'
  | 'documentos'
  | 'agenda'
  | 'servicos'
  | 'anamnese'
  | 'campos'
  | 'disponibilidade'
  | 'salas'
  | 'pagamento'
  | 'whatsapp'
  | 'notificacoes'
  | 'usuarios'
  | 'pagina-publica'

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
  { id: 'modulos',         label: 'Módulos', icon: Gear, group: 'essencial', summary: 'Defina o que a clínica realmente usa antes de abrir novas áreas.' },
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
      className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition ${
        active
          ? 'bg-[#006970] text-white shadow-sm'
          : 'bg-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
        active ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'
      }`}>
        <Icon size={18} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{tab.label}</span>
        <span className={`mt-1 block text-xs leading-5 ${
          active ? 'text-white/80' : 'text-gray-500'
        }`}>
          {tab.summary}
        </span>
      </span>

      {active && <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-white" />}
    </button>
  )
}

type SettingsContentTab = Exclude<Tab, 'modulos'>

interface TabComponentProps {
  clinic: Clinic
  fieldEntity?: SettingsEntity
}

const TAB_CONTENT: Record<SettingsContentTab, React.ComponentType<TabComponentProps>> = {
  dados: DadosTab,
  documentos: DocumentosTab,
  agenda: AgendaTab,
  disponibilidade: DisponibilidadeTab,
  notificacoes: NotificacoesTab,
  servicos: ServicosTab,
  anamnese: AnamnesisTab,
  salas: SalasTab,
  pagamento: PagamentoTab,
  campos: CamposTab,
  usuarios: UsuariosTab,
  'pagina-publica': PaginaPublicaTab,
  whatsapp: WhatsAppTab,
}

function SetupGuide({
  clinic,
  finishingSetup,
  onFinish,
  onOpenItem,
}: {
  clinic: Clinic
  finishingSetup: boolean
  onFinish: () => void
  onOpenItem: (item: SetupItem) => void
}) {
  return (
    <section className="rounded-[24px] border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0ea5b0]">
            Comece pelo básico
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-gray-900">
            Quatro ajustes e a clínica já roda melhor.
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Use esses atalhos para acertar o essencial sem perder tempo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onFinish}
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
            onClick={() => onOpenItem(item)}
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
  )
}

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
  const [activeTab, setActiveTab] = useState<Tab>('modulos')
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
    rooms: hasRooms,
    staff: hasStaff,
    services: hasServices,
    whatsapp: hasWhatsApp,
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

  const visibleTabs = TABS.filter(t => !t.moduleRequired || moduleActiveMap[t.moduleRequired])
  const resolvedActiveTab = visibleTabs.some(tab => tab.id === activeTab) ? activeTab : 'modulos'
  const activeTabMeta = TABS.find(tab => tab.id === resolvedActiveTab) ?? TABS[0]

  useEffect(() => {
    if (!visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab('modulos')
      navigate(buildLocalSettingsPath('modulos'), { replace: true })
    }
  }, [activeTab, modules, navigate, visibleTabs])

  const TabComponent = resolvedActiveTab === 'modulos' ? null : TAB_CONTENT[resolvedActiveTab]
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
        <p className="mt-1 text-xs text-amber-700">Recarregue a página e tente novamente.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-[28px] border border-gray-200 bg-white p-3 shadow-sm xl:sticky xl:top-6 xl:flex xl:max-h-[calc(100dvh-3rem)] xl:flex-col xl:overflow-hidden">
        <div className="border-b border-gray-100 px-3 pb-4 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0ea5b0]">
            Configurações
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-gray-900">
            Menu e detalhes da clínica
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Escolha uma área no menu para ajustar só o que realmente muda a operação.
          </p>
        </div>

        <div className="border-b border-gray-100 px-2 pb-3 pt-4 md:hidden">
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

        <div className="hidden space-y-4 px-2 pt-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto md:block">
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
      </aside>

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

        <div className="space-y-5 p-4 sm:p-6">
          {showSetupGuide && resolvedActiveTab === 'modulos' && (
            <SetupGuide
              clinic={clinic}
              finishingSetup={finishingSetup}
              onFinish={handleFinishSetup}
              onOpenItem={handleOpenSetupItem}
            />
          )}

          {resolvedActiveTab === 'modulos' ? (
            <section className="space-y-4">
              <div className="max-w-2xl">
                <h3 className="text-lg font-semibold text-gray-900">
                  Ative só os blocos que fazem sentido para a clínica.
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Os módulos definem quais áreas aparecem no sistema. Comece por aqui para deixar o Consultin mais enxuto e entender melhor o que cada parte entrega.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
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
          ) : (
            TabComponent && (
              <TabComponent
                clinic={clinic}
                fieldEntity={resolvedActiveTab === 'campos' ? fieldEntity : undefined}
              />
            )
          )}
        </div>
      </section>
    </div>
  )
}
