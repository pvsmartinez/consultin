import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { PageLoader } from '../components/ui/PageLoader'

const MyAppointmentsPage = lazy(() => import('../pages-v1/MyAppointmentsPage'))
const AgendarConsultaPage = lazy(() => import('../pages-v1/AgendarConsultaPage'))
const MeuPerfilPage      = lazy(() => import('../pages-v1/MeuPerfilPage'))
const AccessDeniedPage   = lazy(() => import('../pages-v1/AccessDeniedPage'))

export default function PatientRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/minhas-consultas" replace />} />
        <Route path="/minhas-consultas" element={<MyAppointmentsPage />} />
        <Route path="/agendar" element={<AgendarConsultaPage />} />
        <Route path="/meu-perfil" element={<MeuPerfilPage />} />
        <Route path="/acesso-negado" element={<AccessDeniedPage />} />
        <Route path="*" element={<Navigate to="/minhas-consultas" replace />} />
      </Routes>
    </Suspense>
  )
}
