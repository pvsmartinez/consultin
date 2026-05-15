import { lazy, Suspense, useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  House,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  ChartBar,
  Users,
  UsersFour,
  Buildings,
  Gear,
  WhatsappLogo,
  SignOut,
  Plus,
  CreditCard,
  CurrencyDollar,
  Package,
  List,
  X,
} from '@phosphor-icons/react'
import { Avatar, Button } from '@pvsmartinez/shared/ui'
import { toast } from 'sonner'
import ErrorBoundary from '../ErrorBoundary'
import type { UserRole } from '../../types'
import { USER_ROLE_LABELS } from '../../types'
import { useAuthContext } from '../../contexts/AuthContext'
import { useClinic } from '../../hooks/useClinic'
import { useClinicModules } from '../../hooks/useClinicModules'
import { useClinicNotifications } from '../../hooks/useClinicNotifications'
import { isEmailVerificationPending, sendEmailVerificationLink } from '../../lib/emailVerification'
import { APP_ROUTES } from '../../lib/appRoutes'

const AppointmentModal = lazy(() => import('../appointments/AppointmentModal'))

const DESKTOP_SIDEBAR_STORAGE_KEY = 'consultin:desktop-sidebar-collapsed'

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  admin:        'text-teal-700 bg-teal-100',
  receptionist: 'text-cyan-700 bg-cyan-100',
  professional: 'text-violet-700 bg-violet-100',
  patient:      'text-gray-600 bg-gray-100',
}

interface AppLayoutProps {
  children: React.ReactNode
}

type NavIcon = typeof CalendarBlank

interface NavigationItem {
  to: string
  icon: NavIcon
  label: string
}

const isRouteActive = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`)

const renderNavIcon = (Icon: NavIcon, active: boolean, size = 20) => (
  <Icon size={size} weight={active ? 'fill' : 'duotone'} />
)

const getInitialDesktopSidebarCollapsed = () => {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY) === '1'
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { signOut, hasPermission, profile, role, session } = useAuthContext()
  const { data: clinic } = useClinic()
  const { hasRooms, hasStaff, hasWhatsApp, hasFinancial, hasInventory } = useClinicModules()
  const navigate = useNavigate()
  const location = useLocation()
  const { unreadCount } = useClinicNotifications(navigate)

  const isProfessional = role === 'professional'
  const canSchedule = role === 'admin' || role === 'receptionist'
  const canSeeNotifications = role === 'admin' || role === 'receptionist'
  const notifBadge = canSeeNotifications ? unreadCount : 0
  const emailVerificationPending = isEmailVerificationPending(session)

  const [newApptOpen, setNewApptOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sendingVerification, setSendingVerification] = useState(false)
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(getInitialDesktopSidebarCollapsed)

  useEffect(() => {
    window.localStorage.setItem(
      DESKTOP_SIDEBAR_STORAGE_KEY,
      desktopSidebarCollapsed ? '1' : '0',
    )
  }, [desktopSidebarCollapsed])

  async function handleResendVerification() {
    if (!session?.user.email || sendingVerification) return
    setSendingVerification(true)
    try {
      const { error } = await sendEmailVerificationLink(session.user.email)
      if (error) throw error
      toast.success('E-mail de validação reenviado.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao reenviar e-mail de validação.')
    } finally {
      setSendingVerification(false)
    }
  }

  // ── Build navigation ───────────────────────────────────────────────────────
  // Base: Home + Agenda + Pacientes always visible
  // Conditional: Equipe, Salas, WhatsApp driven by active modules + permissions
  // Settings always visible to admins
  const operationalItems = [
    { to: APP_ROUTES.staff.home, icon: House, label: 'Home', show: true },
    { to: isProfessional ? APP_ROUTES.staff.myAgenda : APP_ROUTES.staff.agenda, icon: CalendarBlank, label: isProfessional ? 'Minha Agenda' : 'Agenda', show: true },
    { to: APP_ROUTES.staff.patients, icon: Users, label: 'Pacientes', show: hasPermission('canViewPatients') },
    { to: APP_ROUTES.staff.team, icon: UsersFour, label: 'Equipe', show: hasStaff && hasPermission('canManageProfessionals') },
    { to: APP_ROUTES.staff.rooms, icon: Buildings, label: 'Salas', show: hasRooms },
    { to: APP_ROUTES.staff.inventory, icon: Package, label: 'Estoque', show: hasInventory && hasPermission('canManageAgenda') },
    { to: APP_ROUTES.staff.financial, icon: CurrencyDollar, label: 'Financeiro', show: hasFinancial && hasPermission('canViewFinancial') },
    { to: APP_ROUTES.staff.whatsapp, icon: WhatsappLogo, label: 'Mensagens', show: hasWhatsApp && hasPermission('canViewWhatsApp') },
  ].filter(item => item.show)

  const adminItems = [
    { to: APP_ROUTES.staff.reports, icon: ChartBar, label: 'Relatórios', show: hasFinancial && hasPermission('canViewFinancial') },
  ].filter(item => item.show)

  const settingsItem = { to: APP_ROUTES.staff.settings, icon: Gear, label: 'Configurações', show: hasPermission('canManageSettings') }

  // Top 4 visible items for bottom tab bar (mobile)
  const bottomItems = [...operationalItems, ...(settingsItem.show ? [settingsItem] : [])].slice(0, 4)
  const mobileMenuItems: NavigationItem[] = [...operationalItems, ...adminItems, ...(settingsItem.show ? [settingsItem] : [])]

  function handleMobileNavigate(to: string) {
    navigate(to)
    setMobileMenuOpen(false)
  }

  return (
    <div className="min-h-dvh bg-[#f8fafb] md:flex md:h-screen md:overflow-hidden">
      <aside
        className={`hidden md:flex md:flex-shrink-0 md:flex-col md:border-r md:bg-[#f2f4f5] md:transition-[width] md:duration-200 ${
          desktopSidebarCollapsed ? 'md:w-20' : 'md:w-56'
        }`}
      >
        <div className="shrink-0 p-4 pb-3">
          <div className={`flex ${desktopSidebarCollapsed ? 'justify-center' : 'items-start justify-between gap-3'}`}>
            <div className={`min-w-0 ${desktopSidebarCollapsed ? 'hidden' : 'flex-1'}`}>
              <div className="mb-5 flex flex-col gap-1">
                <span className="text-2xl font-bold tracking-tight text-[#0EA5B0]">Consultin</span>
                {clinic?.name && (
                  <p className="truncate text-xs font-medium text-gray-500" title={clinic.name}>
                    {clinic.name}
                  </p>
                )}
              </div>

              {role && ROLE_BADGE_COLORS[role] && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROLE_BADGE_COLORS[role]}`}>
                  {USER_ROLE_LABELS[role]}
                </span>
              )}
            </div>

            {desktopSidebarCollapsed && (
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-lg font-bold tracking-tight text-[#0EA5B0] shadow-sm">
                C
              </span>
            )}

            <button
              type="button"
              onClick={() => setDesktopSidebarCollapsed(prev => !prev)}
              aria-label={desktopSidebarCollapsed ? 'Expandir menu lateral' : 'Minimizar menu lateral'}
              title={desktopSidebarCollapsed ? 'Expandir menu lateral' : 'Minimizar menu lateral'}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:border-[#0ea5b0]/40 hover:text-[#0ea5b0]"
            >
              {desktopSidebarCollapsed ? <CaretRight size={18} /> : <CaretLeft size={18} />}
            </button>
          </div>

          {canSchedule && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="primary"
                size="sm"
                className={desktopSidebarCollapsed ? 'h-10 w-10 justify-center rounded-xl px-0' : 'w-full justify-center'}
                style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
                leftIcon={<Plus size={14} weight="bold" />}
                onClick={() => setNewApptOpen(true)}
                title="Nova consulta"
                aria-label="Nova consulta"
              >
                {desktopSidebarCollapsed ? '' : 'Nova consulta'}
              </Button>
            </div>
          )}
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-2">
          {operationalItems.map(({ to, icon, label }) => {
            const active = isRouteActive(location.pathname, to)
            return (
              <NavLink
                key={to}
                to={to}
                title={desktopSidebarCollapsed ? label : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-white text-[#0ea5b0] shadow-sm'
                    : 'text-gray-600 hover:bg-white/70 hover:text-[#0ea5b0]'
                } ${desktopSidebarCollapsed ? 'justify-center px-2' : ''}`}
              >
                <span className="relative flex items-center justify-center">
                  {renderNavIcon(icon, active)}
                  {to === APP_ROUTES.staff.whatsapp && notifBadge > 0 && desktopSidebarCollapsed && (
                    <span className="absolute -right-2 -top-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white">
                      {notifBadge > 99 ? '99+' : notifBadge}
                    </span>
                  )}
                </span>
                {!desktopSidebarCollapsed && <span className="flex-1 truncate">{label}</span>}
                {to === APP_ROUTES.staff.whatsapp && notifBadge > 0 && !desktopSidebarCollapsed && (
                  <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {notifBadge > 99 ? '99+' : notifBadge}
                  </span>
                )}
              </NavLink>
            )
          })}

          {adminItems.length > 0 && (
            <div className="px-1 pt-4 pb-2">
              <div className="border-t border-gray-200 pt-4">
                {!desktopSidebarCollapsed && (
                  <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-400">
                    Administrativo
                  </p>
                )}
              </div>
            </div>
          )}

          {adminItems.map(({ to, icon, label }) => {
            const active = isRouteActive(location.pathname, to)
            return (
              <NavLink
                key={to}
                to={to}
                title={desktopSidebarCollapsed ? label : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-white text-[#0ea5b0] shadow-sm'
                    : 'text-gray-600 hover:bg-white/70 hover:text-[#0ea5b0]'
                } ${desktopSidebarCollapsed ? 'justify-center px-2' : ''}`}
              >
                {renderNavIcon(icon, active)}
                {!desktopSidebarCollapsed && <span className="flex-1 truncate">{label}</span>}
              </NavLink>
            )
          })}

          {settingsItem.show && (
            <NavLink
              to={settingsItem.to}
              title={desktopSidebarCollapsed ? settingsItem.label : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                isRouteActive(location.pathname, settingsItem.to)
                  ? 'bg-white text-[#0ea5b0] shadow-sm'
                  : 'text-gray-600 hover:bg-white/70 hover:text-[#0ea5b0]'
              } ${desktopSidebarCollapsed ? 'justify-center px-2' : ''}`}
            >
              {renderNavIcon(settingsItem.icon, isRouteActive(location.pathname, settingsItem.to))}
              {!desktopSidebarCollapsed && <span className="flex-1 truncate">{settingsItem.label}</span>}
            </NavLink>
          )}
        </nav>

        <div className="shrink-0 border-t border-gray-100 p-4">
          {profile && (
            <NavLink
              to={APP_ROUTES.staff.account}
              title={desktopSidebarCollapsed ? 'Minha conta' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                isRouteActive(location.pathname, APP_ROUTES.staff.account)
                  ? 'bg-white text-[#0ea5b0] shadow-sm'
                  : 'text-gray-600 hover:bg-white/70 hover:text-[#0ea5b0]'
              } ${desktopSidebarCollapsed ? 'justify-center px-2' : ''}`}
            >
              <Avatar src={profile.avatarUrl} name={profile.name} size={28} />
              {!desktopSidebarCollapsed && <p className="truncate text-sm font-medium">{profile.name}</p>}
            </NavLink>
          )}

          {role === 'admin' && (
            <NavLink
              to={APP_ROUTES.staff.subscription}
              title={desktopSidebarCollapsed ? 'Meu plano' : undefined}
              className={`mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors ${
                isRouteActive(location.pathname, APP_ROUTES.staff.subscription)
                  ? 'bg-white text-[#0ea5b0] shadow-sm'
                  : 'text-gray-500 hover:bg-white/70 hover:text-[#0ea5b0]'
              } ${desktopSidebarCollapsed ? 'justify-center px-2' : ''}`}
            >
              <CreditCard size={15} />
              {!desktopSidebarCollapsed && 'Meu plano'}
            </NavLink>
          )}

          <button
            type="button"
            onClick={signOut}
            title={desktopSidebarCollapsed ? 'Sair' : undefined}
            className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/70 hover:text-gray-700 ${
              desktopSidebarCollapsed ? 'justify-center px-2' : ''
            }`}
          >
            <SignOut size={18} />
            {!desktopSidebarCollapsed && 'Sair'}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-gray-100 bg-[#f8fafb]/95 backdrop-blur md:hidden">
          <div className="flex h-16 items-center justify-between gap-3 px-4">
            <div className="min-w-0">
              <span className="text-sm font-bold tracking-tight text-[#0EA5B0]">Consultin</span>
              {clinic?.name && (
                <p className="mt-0.5 truncate text-[10px] leading-none text-gray-500">{clinic.name}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {canSchedule && (
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus size={12} weight="bold" />}
                  onClick={() => setNewApptOpen(true)}
                >
                  Nova
                </Button>
              )}

              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Abrir menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:border-[#0ea5b0]/40 hover:text-[#0ea5b0]"
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-6">
          {emailVerificationPending && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 md:px-5 md:py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-900">Falta só validar seu e-mail</p>
                  <p className="mt-1 text-sm text-amber-800">
                    Você já pode usar o Consultin normalmente. Para confirmar que esse e-mail é seu,
                    clique no link que enviamos para <strong>{session?.user.email}</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={sendingVerification}
                  className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
                >
                  {sendingVerification ? 'Reenviando...' : 'Reenviar e-mail'}
                </button>
              </div>
            </div>
          )}
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden">
          <div className="grid grid-cols-4">
            {bottomItems.map(({ to, icon, label }) => {
              const active = isRouteActive(location.pathname, to)
              return (
                <button
                  key={to}
                  type="button"
                  onClick={() => navigate(to)}
                  className={`flex min-w-0 flex-col items-center justify-center gap-1 px-2 py-3 text-[11px] font-medium transition-colors ${
                    active ? 'text-[#006970]' : 'text-gray-500'
                  }`}
                >
                  {renderNavIcon(icon, active, 21)}
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
          />

          <div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">Menu</p>
                {clinic?.name && (
                  <p className="mt-1 truncate text-xs text-gray-500">{clinic.name}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Fechar menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-1">
                {mobileMenuItems.map(({ to, icon, label }) => (
                  <button
                    key={to}
                    type="button"
                    onClick={() => handleMobileNavigate(to)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition-colors ${
                      isRouteActive(location.pathname, to)
                        ? 'bg-teal-50 text-[#006970]'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {renderNavIcon(icon, isRouteActive(location.pathname, to))}
                    <span className="flex-1">{label}</span>
                    {to === '/whatsapp' && notifBadge > 0 && (
                      <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {notifBadge > 99 ? '99+' : notifBadge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-6 border-t border-gray-100 pt-4">
                {profile && (
                  <button
                    type="button"
                    onClick={() => handleMobileNavigate('/minha-conta')}
                    className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <Avatar src={profile.avatarUrl} name={profile.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900">{profile.name}</p>
                      <p className="truncate text-xs text-gray-500">Minha conta</p>
                    </div>
                  </button>
                )}

                {role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => handleMobileNavigate('/assinatura')}
                    className="mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <CreditCard size={18} />
                    <span>Meu plano</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={signOut}
                  className="mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
                >
                  <SignOut size={18} />
                  <span>Sair</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {newApptOpen && (
        <Suspense fallback={null}>
          <AppointmentModal
            open={newApptOpen}
            onClose={() => setNewApptOpen(false)}
          />
        </Suspense>
      )}
    </div>
  )
}
