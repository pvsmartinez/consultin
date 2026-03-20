import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import PublicAnalyticsTracker from '../components/analytics/PublicAnalyticsTracker'
import { PageLoader } from '../components/ui/PageLoader'

const LandingPage         = lazy(() => import('../pages/LandingPage'))
const LoginPage           = lazy(() => import('../pages/LoginPage'))
const CadastroClinicaPage = lazy(() => import('../pages/CadastroClinicaPage'))

export default function PublicRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <PublicAnalyticsTracker />
      <Routes>
        <Route path="/"                  element={<LandingPage />} />
        <Route path="/login"             element={<LoginPage />} />
        <Route path="/cadastro-clinica"  element={<CadastroClinicaPage />} />
        {/* Anything else → landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
