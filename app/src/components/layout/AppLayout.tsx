import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  CalendarBlank,
  CalendarCheck,
  Users,
  Stethoscope,
  SignOut,
  UsersFour,
  Gear,
  Shield,
  CurrencyCircleDollar,
  WhatsappLogo,
  Clock,
  Warning,
  SignIn,
  Plus,
  CreditCard,
  Sun,
} from '@phosphor-icons/react'
import { AppShell, SideNav, NavItem, NavGroup, Avatar, Button, TopBar, BottomTabBar, TabItem } from '@pvsmartinez/shared/ui'
import AppointmentModal from '../appointments/AppointmentModal'
import type { UserRole } from '../../types'
import { USER_ROLE_LABELS } from '../../types'
import { useAuthContext } from '../../contexts/AuthContext'
import { useClinic } from '../../hooks/useClinic'
import { useEnterClinic } from '../../hooks/useAdmin'
import { useMyProfessionalRecords } from '../../hooks/useAppointmentsMutations'
import { useClinicNotifications } from '../../hooks/useClinicNotifications'
import ErrorBoundary from '../ErrorBoundary'

const navItems = [
  { to: '/hoje',                  icon: Sun,                 label: 'Hoje',            labelProfissional: 'Hoje',           permission: null },
  { to: '/agenda',                icon: CalendarBlank,        label: 'Agenda',          labelProfissional: 'Minha Agenda',   permission: null },
  { to: '/minha-disponibilidade', icon: Clock,                label: 'Meus Horários',   labelProfissional: 'Meus Horários',  permission: 'canManageOwnAvailability' as const },
  { to: '/pacientes',             icon: Users,                label: 'Pacientes',       labelProfissional: 'Pacientes',      permission: 'canViewPatients' as const },
  { to: '/equipe',                icon: UsersFour,            label: 'Equipe',          labelProfissional: 'Equipe',         permission: 'canManageProfessionals' as const },
  { to: '/financeiro',            icon: CurrencyCircleDollar, label: 'Financeiro',      labelProfissional: 'Financeiro',     permission: 'canViewFinancial' as const },
  { to: '/whatsapp',              icon: WhatsappLogo,         label: 'Mensagens',       labelProfissional: 'Mensagens',      permission: 'canViewWhatsApp' as const },
  { to: '/configuracoes',         icon: Gear,                 label: 'Configurações',   labelProfissional: 'Configurações',  permission: 'canManageSettings' as const },
]

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  admin:        'text-teal-300 bg-teal-900/60',
  receptionist: 'text-cyan-300 bg-cyan-900/60',
  professional: 'text-violet-300 bg-violet-900/60',
  patient:      'text-gray-300 bg-gray-700',
}

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { signOut, hasPermission, profile, role, isSuperAdmin } = useAuthContext()
  const { data: clinic } = useClinic()
  const enterClinic = useEnterClinic()
  const { data: myProfRecords = [] } = useMyProfessionalRecords()
  const isProfessional = role === 'professional'
  const hasLinkedProfessional = !isProfessional && myProfRecords.length > 0
  const canSeeNotifications = role === 'admin' || role === 'receptionist'
  const navigate = useNavigate()
  const location = useLocation()
  const { unreadCount } = useClinicNotifications(navigate)
  const notifBadge = canSeeNotifications ? unreadCount : 0
  const isTestMode = isSuperAdmin && !!profile?.clinicId
  const [newApptOpen, setNewApptOpen] = useState(false)
  const canSchedule = role === 'admin' || role === 'receptionist'

  function handleExitTestMode() {
    if (!profile) return
    enterClinic.mutate({ userId: profile.id, clinicId: null })
  }

  const visibleNav = navItems.filter(item => {
    if (isProfessional && item.labelProfissional === null) return false
    if (item.to === '/whatsapp' && !clinic?.whatsappEnabled) return false
    if (item.to === '/financeiro' && !clinic?.paymentsEnabled) return false
    return item.permission == null || hasPermission(item.permission)
  })

  const sideNavHeader = (
    <div className="p-4 border-b border-gray-800">
      <div className="flex items-center gap-2 mb-1">
        <Stethoscope size={22} className="text-teal-400 flex-shrink-0" />
        <span className="font-semibold text-white tracking-tight">Consultin</span>
      </div>
      {clinic?.name && (
        <p className="text-xs text-gray-400 truncate mb-1.5" title={clinic.name}>{clinic.name}</p>
      )}
      {role && ROLE_BADGE_COLORS[role] && (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE_COLORS[role]}`}>
          {USER_ROLE_LABELS[role]}
        </span>
      )}
      {canSchedule && (
        <div className="mt-3">
          <Button
            variant="primary"
            size="sm"
            className="w-full justify-center"
            leftIcon={<Plus size={14} weight="bold" />}
            onClick={() => setNewApptOpen(true)}
          >
            Nova consulta
          </Button>
        </div>
      )}
    </div>
  )

  const sideNavFooter = (
    <div className="p-3 space-y-1">
      {isSuperAdmin && (
        <NavLink to="/admin"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive ? 'bg-amber-500/15 text-amber-300 font-medium' : 'text-amber-400 hover:bg-amber-500/10'
            }`
          }
        >
          <Shield size={18} />
          Admin
        </NavLink>
      )}
      {profile && (
        <NavLink
          to="/minha-conta"
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
              isActive ? 'bg-white/10' : 'hover:bg-white/5'
            }`
          }
        >
          <Avatar src={profile.avatarUrl} name={profile.name} size={24} />
          <p className="text-xs font-medium text-gray-300 truncate">{profile.name}</p>
        </NavLink>
      )}
      {role === 'admin' && (
        <NavLink to="/assinatura"
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              isActive ? 'text-indigo-300 bg-indigo-500/10' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
            }`
          }
        >
          <CreditCard size={14} />
          Meu plano
        </NavLink>
      )}
      <button
        onClick={signOut}
        className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-colors"
      >
        <SignOut size={18} />
        Sair
      </button>
    </div>
  )

  return (
    <AppShell variant="responsive" className="bg-slate-50">
      {/* Mobile only: top bar (hidden on desktop via responsive variant) */}
      <TopBar
        left={
          <div className="flex items-center gap-2">
            <Stethoscope size={18} className="text-teal-400 flex-shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-sm text-white">Consultin</span>
              {clinic?.name && (
                <p className="text-[10px] text-gray-400 leading-none mt-0.5 truncate max-w-[160px]">
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

      <SideNav header={sideNavHeader} footer={sideNavFooter}>
        {visibleNav.map(({ to, icon, label, labelProfissional }) => (
          <NavItem
            key={to}
            to={to}
            icon={icon}
            label={isProfessional ? labelProfissional : label}
            badge={to === '/whatsapp' ? notifBadge : undefined}
          />
        ))}
        {hasLinkedProfessional && (
          <>
            <NavGroup />
            <NavItem to="/minha-agenda" icon={CalendarCheck} label="Minha Agenda" />
          </>
        )}
      </SideNav>

      {/* Content: banner (optional) + scrollable main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {isTestMode && (
          <div className="flex items-center justify-between px-6 py-2 bg-amber-500/10 border-b border-amber-500/30 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Warning size={15} className="text-amber-400" />
              <span className="text-xs text-amber-300 font-medium">
                Modo teste — {clinic?.name ?? 'clínica'}
              </span>
            </div>
            <button
              onClick={handleExitTestMode}
              disabled={enterClinic.isPending}
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-200 border border-amber-700/50 hover:border-amber-500 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-40"
            >
              <SignIn size={13} className="rotate-180" />
              Sair da clínica
            </button>
          </div>
        )}
        <main className="flex-1 overflow-auto p-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile only: bottom tab bar (hidden on desktop via responsive variant) */}
      <BottomTabBar>
        {visibleNav.slice(0, 4).map(({ to, icon, label, labelProfissional }) => (
          <TabItem
            key={to}
            icon={icon}
            label={isProfessional ? labelProfissional : label}
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

