import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  CalendarBlank,
  CalendarCheck,
  Users,
  SignOut,
  UsersFour,
  Gear,
  CurrencyCircleDollar,
  WhatsappLogo,
  Clock,
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
  const { data: myProfRecords = [] } = useMyProfessionalRecords()
  const isProfessional = role === 'professional'
  const hasLinkedProfessional = !isProfessional && myProfRecords.length > 0
  const canSeeNotifications = role === 'admin' || role === 'receptionist'
  const navigate = useNavigate()
  const location = useLocation()
  const { unreadCount } = useClinicNotifications(navigate)
  const notifBadge = canSeeNotifications ? unreadCount : 0
  const [newApptOpen, setNewApptOpen] = useState(false)
  const canSchedule = role === 'admin' || role === 'receptionist'


  const visibleNav = navItems.filter(item => {
    if (isProfessional && item.labelProfissional === null) return false
    if (item.to === '/whatsapp' && !clinic?.whatsappEnabled) return false
    if (item.to === '/financeiro' && !clinic?.paymentsEnabled) return false
    return item.permission == null || hasPermission(item.permission)
  })

  const sideNavHeader = (
    <div className="p-6 pb-4">
      <div className="flex flex-col gap-1 mb-5">
        <span className="text-2xl font-bold text-[#0EA5B0] tracking-tight">Consultin</span>
        {clinic?.name && (
          <p className="text-xs text-gray-500 font-medium truncate" title={clinic.name}>{clinic.name}</p>
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

  const sideNavFooter = (
    <div className="p-4 space-y-1">
      {profile && (
        <NavLink
          to="/minha-conta"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive ? 'bg-white shadow-sm text-[#0ea5b0]' : 'text-gray-600 hover:bg-white/60 hover:text-[#0ea5b0]'
            }`
          }
        >
          <Avatar src={profile.avatarUrl} name={profile.name} size={28} />
          <p className="text-sm font-medium truncate">{profile.name}</p>
        </NavLink>
      )}
      {role === 'admin' && (
        <NavLink to="/assinatura"
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
  )

  return (
    <AppShell variant="responsive" className="bg-[#f8fafb]">
      {/* Mobile only: top bar (hidden on desktop via responsive variant) */}
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

