import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import PublicAnalyticsTracker from '../components/analytics/PublicAnalyticsTracker'
import { PageLoader } from '../components/ui/PageLoader'
import { APP_ROUTES } from '../lib/appRoutes'

const LandingPage         = lazy(() => import('../pages/LandingPage'))
const LoginPage           = lazy(() => import('../pages/LoginPage'))
const CadastroClinicaPage = lazy(() => import('../pages/CadastroClinicaPage'))
const BemVindoPage        = lazy(() => import('../pages/BemVindoPage'))
const EmailVerificationPage = lazy(() => import('../pages/EmailVerificationPage'))
const ClinicPublicPage    = lazy(() => import('../pages/ClinicPublicPage'))
const PublicBookingPage   = lazy(() => import('../pages/PublicBookingPage'))
const PublicNotFoundPage  = lazy(() => import('../pages/PublicNotFoundPage'))

export default function PublicRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <PublicAnalyticsTracker />
      <Routes>
        <Route path={APP_ROUTES.public.home}                 element={<LandingPage />} />
        <Route path={APP_ROUTES.public.login}                element={<LoginPage />} />
        <Route path={APP_ROUTES.public.clinicSignup}         element={<CadastroClinicaPage />} />
        <Route path={APP_ROUTES.public.welcome}              element={<BemVindoPage />} />
        <Route path={APP_ROUTES.public.emailVerified}        element={<EmailVerificationPage />} />
        <Route path={APP_ROUTES.public.clinicPublicBooking}  element={<PublicBookingPage />} />
        <Route path={APP_ROUTES.public.clinicPublicProfile}  element={<ClinicPublicPage />} />
        <Route path="*"                  element={<PublicNotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
