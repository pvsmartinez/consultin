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
  ChartLineUp,
  WhatsappLogo,
  Clock,
  Warning,
  SignIn,
  UserCircle,
} from '@phosphor-icons/react'
import type { UserRole } from '../../types'
import { USER_ROLE_LABELS } from '../../types'
import { useAuthContext } from '../../contexts/AuthContext'
import { useClinic } from '../../hooks/useClinic'
import { useEnterClinic } from '../../hooks/useAdmin'
import { useMyProfessionalRecords } from '../../hooks/useAppointmentsMutations'

const navItems = [
  { to: '/dashboard',     icon: ChartBar,             label: 'Dashboard',      labelProfissional: 'Meu Painel',     permission: null },
  { to: '/agenda',        icon: CalendarBlank,         label: 'Agenda',         labelProfissional: 'Minha Agenda',   permission: null },
  { to: '/minha-disponibilidade', icon: Clock,           label: 'Disponibilidade', labelProfissional: 'Minha Disponibilidade', permission: 'canManageOwnAvailability' as const },
  { to: '/pacientes',     icon: Users,                 label: 'Pacientes',      labelProfissional: 'Pacientes',      permission: 'canViewPatients' as const },
  { to: '/profissionais', icon: UsersFour,             label: 'Profissionais',  labelProfissional: 'Profissionais',  permission: 'canManageProfessionals' as const },
  { to: '/financeiro',    icon: CurrencyCircleDollar,  label: 'Financeiro',     labelProfissional: 'Financeiro',     permission: 'canViewFinancial' as const },
  { to: '/relatorios',    icon: ChartLineUp,           label: 'Relatórios',     labelProfissional: 'Relatórios',     permission: 'canViewFinancial' as const },
  { to: '/whatsapp',      icon: WhatsappLogo,          label: 'Mensagens',      labelProfissional: 'Mensagens',      permission: 'canViewWhatsApp' as const },
  { to: '/configuracoes', icon: Gear,                  label: 'Configurações',  labelProfissional: 'Configurações',  permission: 'canManageSettings' as const },
]

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  admin:         'text-blue-600 bg-blue-50',
  receptionist:  'text-teal-600 bg-teal-50',
  professional:  'text-violet-600 bg-violet-50',
  patient:       'text-gray-600 bg-gray-100',
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
  const isTestMode = isSuperAdmin && !!profile?.clinicId

  function handleExitTestMode() {
    if (!profile) return
    enterClinic.mutate({ userId: profile.id, clinicId: null })
  }

  const visibleNav = navItems.filter(item =>
    item.permission == null || hasPermission(item.permission)
  )

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo + role badge */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <Stethoscope size={22} className="text-blue-600 flex-shrink-0" />
            <span className="font-semibold text-gray-800">Consultin</span>
          </div>
          {clinic?.name && (
            <p className="text-xs text-gray-500 truncate mb-1.5" title={clinic.name}>{clinic.name}</p>
          )}
          {role && ROLE_BADGE_COLORS[role] && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE_COLORS[role]}`}>
              {USER_ROLE_LABELS[role]}
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {visibleNav.map(({ to, icon: Icon, label, labelProfissional }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <Icon size={18} />
              {isProfessional ? labelProfissional : label}
            </NavLink>
          ))}
          {/* Extra item for admin/receptionist who also have a professional record */}
          {hasLinkedProfessional && (
            <NavLink
              to="/minha-agenda"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-violet-50 text-violet-700 font-medium' : 'text-violet-600 hover:bg-violet-50'
                }`
              }
            >
              <CalendarCheck size={18} />
              Minha Agenda
            </NavLink>
          )}
        </nav>

        {/* User + sign out */}
        <div className="p-3 border-t border-gray-200 space-y-1">
          {isSuperAdmin && (
            <NavLink to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-amber-50 text-amber-700 font-medium' : 'text-amber-600 hover:bg-amber-50'}`
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
                  isActive ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`
              }
            >
              {profile.avatarUrl
                ? <img src={profile.avatarUrl} alt="avatar" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                : <UserCircle size={18} className="text-gray-400 flex-shrink-0" />
              }
              <p className="text-xs font-medium text-gray-600 truncate">{profile.name}</p>
            </NavLink>
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition-colors"
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
          {children}
        </main>
      </div>
    </div>
  )
}
