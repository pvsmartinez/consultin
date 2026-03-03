import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  CalendarBlank,
  CalendarCheck,
  Users,
  ChartBar,
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
  UserCircle,
  Plus,
  Armchair,
} from '@phosphor-icons/react'
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
  { to: '/dashboard',         icon: ChartBar,             label: 'Dashboard',        labelProfissional: 'Meu Painel',     permission: null },
  { to: '/sala-de-espera',    icon: Armchair,             label: 'Sala de espera',   labelProfissional: null,             permission: 'canViewPatients' as const },
  { to: '/agenda',            icon: CalendarBlank,         label: 'Agenda',           labelProfissional: 'Minha Agenda',   permission: null },
  { to: '/minha-disponibilidade', icon: Clock,           label: 'Meus Horários',   labelProfissional: 'Meus Horários',         permission: 'canManageOwnAvailability' as const },
  { to: '/pacientes',     icon: Users,                 label: 'Pacientes',      labelProfissional: 'Pacientes',      permission: 'canViewPatients' as const },
  { to: '/profissionais', icon: UsersFour,             label: 'Profissionais',  labelProfissional: 'Profissionais',  permission: 'canManageProfessionals' as const },
  { to: '/financeiro',    icon: CurrencyCircleDollar,  label: 'Financeiro',     labelProfissional: 'Financeiro',     permission: 'canViewFinancial' as const },
  { to: '/whatsapp',      icon: WhatsappLogo,          label: 'Mensagens',      labelProfissional: 'Mensagens',      permission: 'canViewWhatsApp' as const },
  { to: '/configuracoes', icon: Gear,                  label: 'Configurações',  labelProfissional: 'Configurações',  permission: 'canManageSettings' as const },
]

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  admin:         'text-teal-300 bg-teal-900/60',
  receptionist:  'text-cyan-300 bg-cyan-900/60',
  professional:  'text-violet-300 bg-violet-900/60',
  patient:       'text-gray-300 bg-gray-700',
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
  // admin/receptionist who also has a professional record gets an extra "Minha Agenda" link
  const hasLinkedProfessional = !isProfessional && myProfRecords.length > 0
  // Only admin/receptionist have RLS access to clinic_notifications
  const canSeeNotifications = role === 'admin' || role === 'receptionist'
  const { unreadCount } = useClinicNotifications()
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
    return item.permission == null || hasPermission(item.permission)
  })

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-950 border-r border-gray-800 flex flex-col">
        {/* Logo + role badge */}
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
        </div>

        {/* Nova consulta CTA */}
        {canSchedule && (
          <div className="px-3 pb-2">
            <button
              onClick={() => setNewApptOpen(true)}
              className="flex items-center justify-center gap-2 w-full bg-teal-500 hover:bg-teal-400 text-white text-sm font-medium px-3 py-2.5 rounded-lg transition-colors shadow-sm shadow-teal-900/40"
            >
              <Plus size={16} weight="bold" />
              Nova consulta
            </button>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {visibleNav.map(({ to, icon: Icon, label, labelProfissional }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive
                  ? 'bg-teal-500/15 text-teal-300 font-medium'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`
              }
            >
              <Icon size={18} />
              <span className="flex-1">{isProfessional ? labelProfissional : label}</span>
              {to === '/whatsapp' && notifBadge > 0 && (
                <span className="min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
          {/* Minha Agenda — only for admin/receptionist with a linked professional record */}
          {hasLinkedProfessional && (
            <NavLink
              to="/minha-agenda"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-teal-500/15 text-teal-300 font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`
              }
            >
              <CalendarCheck size={18} />
              <span className="flex-1">Minha Agenda</span>
            </NavLink>
          )}
        </nav>

        {/* User + sign out */}
        <div className="p-3 border-t border-gray-800 space-y-1">
          {isSuperAdmin && (
            <NavLink to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-amber-500/15 text-amber-300 font-medium' : 'text-amber-400 hover:bg-amber-500/10'}`
              }>
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
              {profile.avatarUrl
                ? <img src={profile.avatarUrl} alt="avatar" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                : <UserCircle size={18} className="text-gray-500 flex-shrink-0" />
              }
              <p className="text-xs font-medium text-gray-300 truncate">{profile.name}</p>
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
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Test mode banner */}
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
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-200 border border-amber-700/50 hover:border-amber-500 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-40">
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

      {/* Global new appointment modal */}
      <AppointmentModal
        open={newApptOpen}
        onClose={() => setNewApptOpen(false)}
      />
    </div>
  )
}
