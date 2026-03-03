import { NavLink, Navigate } from 'react-router-dom'
import { Stethoscope, SignOut, CalendarBlank, User, CalendarPlus, Phone, MapPin } from '@phosphor-icons/react'
import { useAuthContext } from '../../contexts/AuthContext'
import { useClinic } from '../../hooks/useClinic'

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

  if (loading) return null
  if (!role) return <Navigate to="/login" replace />
  if (role !== 'patient') return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Stethoscope size={20} className="text-blue-600" />
          <span className="font-semibold text-gray-800 text-sm">{clinic?.name ?? 'Consultin'}</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-blue-600 bg-blue-50 ml-1">
            Paciente
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <NavLink
            to="/minhas-consultas"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition ${
                isActive ? 'text-blue-600 font-medium bg-blue-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            <CalendarBlank size={14} /> <span className="hidden sm:inline">Consultas</span>
          </NavLink>
          <NavLink
            to="/agendar"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition ${
                isActive ? 'text-green-600 font-medium bg-green-50' : 'text-green-600 hover:bg-green-50'
              }`
            }
          >
            <CalendarPlus size={14} /> <span className="hidden sm:inline">Agendar</span>
          </NavLink>
          <NavLink
            to="/meu-perfil"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition ${
                isActive ? 'text-blue-600 font-medium bg-blue-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            <User size={14} /> <span className="hidden sm:inline">Meu Perfil</span>
          </NavLink>
          <span className="text-xs text-gray-400 hidden sm:inline mx-1">{profile?.name?.split(' ')[0]}</span>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition"
          >
            <SignOut size={15} />
            Sair
          </button>
        </div>
      </header>

      {/* Page */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        {children}
      </main>

      {/* Footer — clinic contact info */}
      {(clinic?.phone || clinic?.address || clinic?.email) && (
        <footer className="border-t border-gray-200 bg-white mt-8 py-5 px-4">
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
