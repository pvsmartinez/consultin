import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { PageLoader } from '../components/ui/PageLoader'
import { useMyPatientClinics } from '../hooks/usePatients'
import { APP_ROUTES } from '../lib/appRoutes'

const MyAppointmentsPage = lazy(() => import('../pages-v1/MyAppointmentsPage'))
const AgendarConsultaPage = lazy(() => import('../pages-v1/AgendarConsultaPage'))
const MeuPerfilPage      = lazy(() => import('../pages-v1/MeuPerfilPage'))
const PatientClinicsPage = lazy(() => import('../pages-v1/PatientClinicsPage'))
const AccessDeniedPage   = lazy(() => import('../pages-v1/AccessDeniedPage'))

function PatientHomeRedirect() {
  const { data: clinics = [], isLoading } = useMyPatientClinics()
  if (isLoading) return <PageLoader />
  return <Navigate to={clinics.length > 1 ? APP_ROUTES.patient.clinics : APP_ROUTES.patient.appointments} replace />
}

export default function PatientRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<PatientHomeRedirect />} />
        <Route path={APP_ROUTES.patient.clinics} element={<PatientClinicsPage />} />
        <Route path={APP_ROUTES.patient.appointments} element={<MyAppointmentsPage />} />
        <Route path={APP_ROUTES.patient.booking} element={<AgendarConsultaPage />} />
        <Route path={APP_ROUTES.patient.profile} element={<MeuPerfilPage />} />
        <Route path={APP_ROUTES.staff.accessDenied} element={<AccessDeniedPage />} />
        <Route path="*" element={<Navigate to={APP_ROUTES.patient.appointments} replace />} />
      </Routes>
    </Suspense>
  )
}
