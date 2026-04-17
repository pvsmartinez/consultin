import { NavLink, Navigate, useLocation } from 'react-router-dom'
import { Stethoscope, SignOut, CalendarBlank, User, CalendarPlus, Phone, MapPin, Buildings } from '@phosphor-icons/react'
import { useAuthContext } from '../../contexts/AuthContext'
import { useClinic } from '../../hooks/useClinic'
import { useMyPatientClinics } from '../../hooks/usePatients'

interface PatientPortalLayoutProps {
  children: React.ReactNode
}

/**
 * Simplified layout for the patient role.
 * Shows: appointments, schedule new, and own profile.
 */
export default function PatientPortalLayout({ children }: PatientPortalLayoutProps) {
  const { role, profile, signOut, loading } = useAuthContext()
  const { data: clinic } = useClinic()
  const { data: patientClinics = [] } = useMyPatientClinics()
  const location = useLocation()
  const hasMultipleClinics = patientClinics.length > 1

  const navItems = [
    { to: '/minhas-consultas', label: 'Consultas', icon: CalendarBlank },
    { to: '/agendar', label: 'Agendar', icon: CalendarPlus },
    { to: '/meu-perfil', label: 'Perfil', icon: User },
    ...(hasMultipleClinics ? [{ to: '/minhas-clinicas', label: 'Clínicas', icon: Buildings }] : []),
  ]

  if (loading) return null
  if (!role) return <Navigate to="/login" replace />
  if (role !== 'patient') return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-dvh bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <Stethoscope size={20} className="shrink-0 text-blue-600" />
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold text-gray-800">{clinic?.name ?? 'Consultin'}</span>
              <span className="mt-0.5 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                Paciente
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-1 sm:flex">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition ${
                    isActive ? 'bg-blue-50 font-medium text-blue-600' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`
                }
              >
                <Icon size={14} /> <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <span className="mx-1 hidden text-xs text-gray-400 sm:inline">{profile?.name?.split(' ')[0]}</span>
          <button
            onClick={signOut}
            className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <SignOut size={15} />
            <span className="hidden sm:inline">Sair</span>
          </button>
          </div>
        </div>
      </header>

      {/* Page */}
      <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-24 sm:py-8 sm:pb-8">
        {children}
      </main>

      <nav className={`fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur sm:hidden ${hasMultipleClinics ? 'grid-cols-4' : 'grid-cols-3'} grid`}>
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to || location.pathname.startsWith(`${to}/`)
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 px-2 py-3 text-[11px] font-medium transition-colors ${
                active ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              <Icon size={20} weight={active ? 'fill' : 'duotone'} />
              <span className="truncate">{label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Footer — clinic contact info */}
      {(clinic?.phone || clinic?.address || clinic?.email) && (
        <footer className="mt-8 border-t border-gray-200 bg-white px-4 py-5 pb-24 sm:pb-5">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3 text-xs text-gray-400">
            <span className="font-medium text-gray-500">{clinic?.name}</span>
            {(clinic?.address || clinic?.city) && (
              <span className="flex items-center gap-1">
                <MapPin size={12} />
                {[clinic.address, clinic.city, clinic.state].filter(Boolean).join(', ')}
              </span>
            )}
            {clinic?.phone && (
              <a href={`tel:${clinic.phone}`} className="flex items-center gap-1 hover:text-blue-500 transition">
                <Phone size={12} />
                {clinic.phone}
              </a>
            )}
          </div>
        </footer>
      )}
    </div>
  )
}
