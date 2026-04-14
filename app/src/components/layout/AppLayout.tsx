import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  CalendarBlank,
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
} from '@phosphor-icons/react'
import { AppShell, SideNav, NavItem, Avatar, Button, TopBar, BottomTabBar, TabItem } from '@pvsmartinez/shared/ui'
import AppointmentModal from '../appointments/AppointmentModal'
import ErrorBoundary from '../ErrorBoundary'
import type { UserRole } from '../../types'
import { USER_ROLE_LABELS } from '../../types'
import { useAuthContext } from '../../contexts/AuthContext'
import { useClinic } from '../../hooks/useClinic'
import { useClinicModules } from '../../hooks/useClinicModules'
import { useClinicNotifications } from '../../hooks/useClinicNotifications'

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  admin:        'text-teal-700 bg-teal-100',
  receptionist: 'text-cyan-700 bg-cyan-100',
  professional: 'text-violet-700 bg-violet-100',
  patient:      'text-gray-600 bg-gray-100',
}

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { signOut, hasPermission, profile, role } = useAuthContext()
  const { data: clinic } = useClinic()
  const { hasRooms, hasStaff, hasWhatsApp, hasFinancial } = useClinicModules()
  const navigate = useNavigate()
  const location = useLocation()
  const { unreadCount } = useClinicNotifications(navigate)

  const isProfessional = role === 'professional'
  const canSchedule = role === 'admin' || role === 'receptionist'
  const canSeeNotifications = role === 'admin' || role === 'receptionist'
  const notifBadge = canSeeNotifications ? unreadCount : 0

  const [newApptOpen, setNewApptOpen] = useState(false)

  // ── Build navigation ───────────────────────────────────────────────────────
  // Base: Agenda + Pacientes always visible
  // Conditional: Equipe, Salas, WhatsApp driven by active modules + permissions
  // Settings always visible to admins
  const operationalItems = [
    { to: '/agenda',         icon: CalendarBlank,   label: 'Agenda',       show: true },
    { to: '/pacientes',      icon: Users,           label: 'Pacientes',    show: hasPermission('canViewPatients') },
    { to: '/equipe',         icon: UsersFour,       label: 'Equipe',       show: hasStaff && hasPermission('canManageProfessionals') },
    { to: '/salas',          icon: Buildings,       label: 'Salas',        show: hasRooms },
    { to: '/financeiro',     icon: CurrencyDollar,  label: 'Financeiro',   show: hasFinancial && hasPermission('canViewFinancial') },
    { to: '/whatsapp',       icon: WhatsappLogo,    label: 'Mensagens',    show: hasWhatsApp && hasPermission('canViewWhatsApp') },
  ].filter(item => item.show)

  const adminItems = [
    { to: '/relatorios',     icon: ChartBar,        label: 'Relatórios',   show: hasFinancial && hasPermission('canViewFinancial') },
  ].filter(item => item.show)

  const settingsItem = { to: '/configuracoes', icon: Gear, label: 'Configurações', show: hasPermission('canManageSettings') }

  // Top 4 visible items for bottom tab bar (mobile)
  const bottomItems = [...operationalItems, ...(settingsItem.show ? [settingsItem] : [])].slice(0, 4)

  // ── Sidebar header ─────────────────────────────────────────────────────────
  const sideNavHeader = (
    <div className="p-6 pb-4">
      <div className="flex flex-col gap-1 mb-5">
        <span className="text-2xl font-bold text-[#0EA5B0] tracking-tight">Consultin</span>
        {clinic?.name && (
          <p className="text-xs text-gray-500 font-medium truncate" title={clinic.name}>
            {clinic.name}
          </p>
        )}
      </div>
      {role && ROLE_BADGE_COLORS[role] && (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE_COLORS[role]}`}>
          {USER_ROLE_LABELS[role]}
        </span>
      )}
      {canSchedule && (
        <div className="mt-4">
          <Button
            variant="primary"
            size="sm"
            className="w-full justify-center"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
            leftIcon={<Plus size={14} weight="bold" />}
            onClick={() => setNewApptOpen(true)}
          >
            Nova consulta
          </Button>
        </div>
      )}
    </div>
  )

  // ── Sidebar footer ─────────────────────────────────────────────────────────
  const sideNavFooter = (
    <div className="p-4 space-y-1">
      {/* Settings — always last in the nav, before footer actions */}
      {settingsItem.show && (
        <NavItem to={settingsItem.to} icon={settingsItem.icon} label={settingsItem.label} />
      )}

      <div className="pt-2 border-t border-gray-100 mt-2 space-y-1">
        {profile && (
          <NavLink
            to="/minha-conta"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-white shadow-sm text-[#0ea5b0]'
                  : 'text-gray-600 hover:bg-white/60 hover:text-[#0ea5b0]'
              }`
            }
          >
            <Avatar src={profile.avatarUrl} name={profile.name} size={28} />
            <p className="text-sm font-medium truncate">{profile.name}</p>
          </NavLink>
        )}

        {role === 'admin' && (
          <NavLink
            to="/assinatura"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                isActive ? 'text-[#0ea5b0] bg-white shadow-sm' : 'text-gray-500 hover:bg-white/60 hover:text-[#0ea5b0]'
              }`
            }
          >
            <CreditCard size={15} />
            Meu plano
          </NavLink>
        )}

        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-gray-400 hover:bg-white/60 hover:text-gray-700 transition-colors"
        >
          <SignOut size={18} />
          Sair
        </button>
      </div>
    </div>
  )

  return (
    <AppShell variant="responsive" className="bg-[#f8fafb]">
      {/* Mobile top bar */}
      <TopBar
        left={
          <div className="flex items-center gap-2">
            <div className="min-w-0">
              <span className="font-bold text-sm text-[#0EA5B0] tracking-tight">Consultin</span>
              {clinic?.name && (
                <p className="text-[10px] text-gray-500 leading-none mt-0.5 truncate max-w-[160px]">
                  {clinic.name}
                </p>
              )}
            </div>
          </div>
        }
        right={
          canSchedule ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus size={12} weight="bold" />}
              onClick={() => setNewApptOpen(true)}
            >
              Nova
            </Button>
          ) : undefined
        }
      />

      {/* Sidebar */}
      <SideNav header={sideNavHeader} footer={sideNavFooter}>
        {operationalItems.map(({ to, icon, label }) => (
          <NavItem
            key={to}
            to={to}
            icon={icon}
            label={isProfessional && to === '/agenda' ? 'Minha Agenda' : label}
            badge={to === '/whatsapp' ? notifBadge : undefined}
          />
        ))}

        {adminItems.length > 0 && (
          <div className="px-4 pt-4 pb-2">
            <div className="border-t border-gray-200 pt-4">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-400">
                Administrativo
              </p>
            </div>
          </div>
        )}

        {adminItems.map(({ to, icon, label }) => (
          <NavItem
            key={to}
            to={to}
            icon={icon}
            label={label}
          />
        ))}
      </SideNav>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <main className="flex-1 overflow-auto p-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <BottomTabBar>
        {bottomItems.map(({ to, icon, label }) => (
          <TabItem
            key={to}
            icon={icon}
            label={label}
            isActive={location.pathname.startsWith(to)}
            onClick={() => navigate(to)}
          />
        ))}
      </BottomTabBar>

      <AppointmentModal
        open={newApptOpen}
        onClose={() => setNewApptOpen(false)}
      />
    </AppShell>
  )
}
