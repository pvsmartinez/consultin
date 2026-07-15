import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthContext } from './contexts/AuthContext'
import { FullScreenLoader, PageLoader } from './components/ui/PageLoader'

// ─── Small eager imports ─────────────────────────────────────────────────────
// ErrorBoundary and loaders are needed while the auth/public worlds are being
// selected. Route shells and auth-only screens stay lazy so public visitors do
// not download the authenticated application before they need it.
import ErrorBoundary    from './components/ErrorBoundary'
import { EMAIL_VERIFICATION_PATH } from './lib/emailVerification'
import { APP_ROUTES, isProtectedAppPath } from './lib/appRoutes'

const NovaSenhaPage       = lazy(() => import('./pages-v1/NovaSenhaPage'))
const OnboardingPage      = lazy(() => import('./pages-v1/OnboardingPage'))
const AppLayout           = lazy(() => import('./components/layout/AppLayout'))
const PatientPortalLayout = lazy(() => import('./components/layout/PatientPortalLayout'))

// ─── Lazy route bundles ───────────────────────────────────────────────────────
// Each import() becomes a separate JS chunk — only fetched when that "world"
// first activates, dramatically reducing the initial bundle.
const PublicRoutes      = lazy(() => import('./routes/PublicRoutes'))
const PatientRoutes     = lazy(() => import('./routes/PatientRoutes'))
const StaffRoutes       = lazy(() => import('./routes/StaffRoutes'))

function App() {
  const location = useLocation()
  const { session, profile, role, isSuperAdmin, loading, recoveryMode } = useAuthContext()
  const isPublicProfileRoute = location.pathname.startsWith('/p/')
  const isStandalonePublicRoute = isPublicProfileRoute || location.pathname === EMAIL_VERIFICATION_PATH

  // ── Auth loading ────────────────────────────────────────────────────────────
  if (loading) return <FullScreenLoader />

  // ── Password-reset flow (email link) ───────────────────────────────────────
  // Must intercept before route rendering so the hash token is consumed first.
  if (recoveryMode) {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <NovaSenhaPage />
      </Suspense>
    )
  }

  if (isStandalonePublicRoute) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<FullScreenLoader />}>
          <PublicRoutes />
        </Suspense>
      </ErrorBoundary>
    )
  }

  // ── Unauthenticated ─────────────────────────────────────────────────────────
  if (!session) {
    if (isProtectedAppPath(location.pathname)) {
      return <Navigate to={APP_ROUTES.public.login} replace />
    }

    return (
      <ErrorBoundary>
        <Suspense fallback={<FullScreenLoader />}>
          <PublicRoutes />
        </Suspense>
      </ErrorBoundary>
    )
  }

  // ── Signed-in but profile not yet created (first OAuth login) ───────────────
  if (!profile) {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <OnboardingPage />
      </Suspense>
    )
  }

  // ── Patient portal ──────────────────────────────────────────────────────────
  if (role === 'patient') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<FullScreenLoader />}>
          <PatientPortalLayout>
            <Suspense fallback={<PageLoader />}>
              <PatientRoutes />
            </Suspense>
          </PatientPortalLayout>
        </Suspense>
      </ErrorBoundary>
    )
  }

  // ── SuperAdmin sem clínica → usa admin.pmatz.com ────────────────────────────
  if (isSuperAdmin && !profile.clinicId) {
    window.location.replace('https://admin.pmatz.com')
    return <FullScreenLoader />
  }

  // ── Staff / admin (sidebar layout) ─────────────────────────────────────────
  return (
    <>
      <Routes>
        <Route path="*" element={
          <Suspense fallback={<FullScreenLoader />}>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <StaffRoutes />
              </Suspense>
            </AppLayout>
          </Suspense>
        } />
      </Routes>
    </>
  )
}

export default App
