import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import PublicAnalyticsTracker from '../components/analytics/PublicAnalyticsTracker'
import { PageLoader } from '../components/ui/PageLoader'

const LandingPage         = lazy(() => import('../pages-v1/LandingPage'))
const LoginPage           = lazy(() => import('../pages-v1/LoginPage'))
const CadastroClinicaPage = lazy(() => import('../pages-v1/CadastroClinicaPage'))
const PublicNotFoundPage  = lazy(() => import('../pages-v1/PublicNotFoundPage'))

export default function PublicRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <PublicAnalyticsTracker />
      <Routes>
        <Route path="/"                  element={<LandingPage />} />
        <Route path="/login"             element={<LoginPage />} />
        <Route path="/cadastro-clinica"  element={<CadastroClinicaPage />} />
        <Route path="*"                  element={<PublicNotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
