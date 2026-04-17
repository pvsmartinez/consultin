import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import PublicAnalyticsTracker from '../components/analytics/PublicAnalyticsTracker'
import { PageLoader } from '../components/ui/PageLoader'
import { APP_ROUTES } from '../lib/appRoutes'

const LandingPage         = lazy(() => import('../pages-v1/LandingPage'))
const LoginPage           = lazy(() => import('../pages-v1/LoginPage'))
const CadastroClinicaPage = lazy(() => import('../pages-v1/CadastroClinicaPage'))
const BemVindoPage        = lazy(() => import('../pages-v1/BemVindoPage'))
const EmailVerificationPage = lazy(() => import('../pages-v1/EmailVerificationPage'))
const ClinicPublicPage    = lazy(() => import('../pages-v1/ClinicPublicPage'))
const PublicBookingPage   = lazy(() => import('../pages-v1/PublicBookingPage'))
const PublicNotFoundPage  = lazy(() => import('../pages-v1/PublicNotFoundPage'))

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
