import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UpgradeModal from '../components/billing/UpgradeModal'
import { HomeCard, HomeGreeting, NextAppointmentCard } from '../components/home/HomeShared'
import HomePainel from '../components/home/HomePainel'
import HomeProfissional from '../components/home/HomeProfissional'
import HomeSetup from '../components/home/HomeSetup'
import { useAuthContext } from '../contexts/AuthContext'
import { useClinic } from '../hooks/useClinic'
import { useClinicModules } from '../hooks/useClinicModules'
import { useClinicQuota } from '../hooks/useClinicQuota'
import { useHomeData } from '../hooks/useHomeData'
import { useProfessionals } from '../hooks/useProfessionals'
import { useRooms } from '../hooks/useRooms'
import { APP_ROUTES } from '../lib/appRoutes'
import { todayBR } from '../utils/date'

const AppointmentModal = lazy(() => import('../components/appointments/AppointmentModal'))

export default function HomePage() {
  const navigate = useNavigate()
  const { role, profile, hasPermission } = useAuthContext()
  const { data: clinic, isLoading: clinicLoading } = useClinic()
  const {
    hasWhatsApp,
    hasFinancial,
    hasInventory,
    enableModule,
    disableModule,
  } = useClinicModules()
  const { data: professionals = [] } = useProfessionals()
  const { data: rooms = [] } = useRooms()
  const quota = useClinicQuota(clinic)
  const home = useHomeData()

  const [modalOpen, setModalOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  const canManageSettings = hasPermission('canManageSettings')
  const canManageAgenda = hasPermission('canManageAgenda')
  const canViewPatients = hasPermission('canViewPatients')
  const canViewFinancial = hasPermission('canViewFinancial')

  const activeProfessionals = professionals.filter(p => p.active).length
  const roomsCount = rooms.length
  const hoursConfigured =
    !!clinic?.workingHours && Object.keys(clinic.workingHours).length > 0
  const hasAnyAppointment = home.weekCounts.some(d => d.count > 0)

  // A fresh clinic an admin can still set up: no working hours OR no professionals yet.
  const needsSetup = !!clinic && canManageSettings && (!hoursConfigured || activeProfessionals === 0)

  const openNewAppointment = () => {
    if (quota.subscriptionRequired || quota.exceeded) {
      setUpgradeOpen(true)
      return
    }
    setModalOpen(true)
  }

  const hero = (
    <NextAppointmentCard
      data={home}
      canManageAgenda={canManageAgenda}
      canViewPatients={canViewPatients}
      onNewAppointment={openNewAppointment}
    />
  )

  const renderContent = () => {
    if (clinicLoading || home.loading) {
      return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
          <div className="h-64 animate-pulse rounded-[28px] bg-gray-100" />
          <div className="h-64 animate-pulse rounded-[28px] bg-gray-100" />
        </div>
      )
    }

    if (needsSetup) {
      return (
        <HomeSetup
          clinic={clinic}
          activeProfessionals={activeProfessionals}
          roomsCount={roomsCount}
          hasAnyAppointment={hasAnyAppointment}
          hasWhatsApp={hasWhatsApp}
          hasFinancial={hasFinancial}
          hasInventory={hasInventory}
          enableModule={enableModule}
          disableModule={disableModule}
          onNewAppointment={openNewAppointment}
        />
      )
    }

    if (role === 'professional') {
      if (home.personalViewUnavailable) {
        return (
          <HomeCard>
            <h2 className="text-xl font-semibold text-gray-900">Sua agenda pessoal</h2>
            <p className="mt-2 text-sm text-gray-600">
              Seu usuário ainda não está vinculado a um profissional desta clínica. Fale com a
              administração para liberar sua agenda.
            </p>
            <button
              type="button"
              onClick={() => navigate(APP_ROUTES.staff.myAgenda)}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-3 text-sm font-medium text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
            >
              Abrir agenda
            </button>
          </HomeCard>
        )
      }
      return <HomeProfissional data={home} heroSlot={hero} />
    }

    return (
      <HomePainel
        data={home}
        canViewFinancial={canViewFinancial}
        hasFinancial={hasFinancial}
        heroSlot={hero}
      />
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <HomeGreeting name={profile?.name} />
      {renderContent()}

      {modalOpen && (
        <Suspense fallback={null}>
          <AppointmentModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            initialDate={todayBR()}
          />
        </Suspense>
      )}
      {upgradeOpen && <UpgradeModal quota={quota} onClose={() => setUpgradeOpen(false)} />}
    </div>
  )
}
