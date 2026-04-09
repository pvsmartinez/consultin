import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuthContext } from './contexts/AuthContext'
import { useClinic } from './hooks/useClinic'
import { useProfessionals } from './hooks/useProfessionals'
import { usePatients } from './hooks/usePatients'
import { FullScreenLoader, PageLoader } from './components/ui/PageLoader'

/**
 * Fires background queries the moment staff login completes so that pages
 * open instantly from cache instead of starting a fetch on first mount.
 * Returns nothing — pure side-effect component.
 */
function DataPrefetcher() {
  useProfessionals()
  usePatients()
  return null
}

// ─── Eager imports — rendered outside of route transitions ───────────────────
// These must be sync: they cover auth states that appear before any route shell.
import NovaSenhaPage    from './pages-v1/NovaSenhaPage'    // recoveryMode intercept
import OnboardingPage   from './pages-v1/OnboardingPage'   // !profile gate
import AppLayout        from './components/layout/AppLayout'
import PatientPortalLayout from './components/layout/PatientPortalLayout'
import ErrorBoundary    from './components/ErrorBoundary'

// ─── Lazy route bundles ───────────────────────────────────────────────────────
// Each import() becomes a separate JS chunk — only fetched when that "world"
// first activates, dramatically reducing the initial bundle.
const PublicRoutes      = lazy(() => import('./routes/PublicRoutes'))
const OnboardingRoutes  = lazy(() => import('./routes/OnboardingRoutes'))
const PatientRoutes     = lazy(() => import('./routes/PatientRoutes'))
const StaffRoutes       = lazy(() => import('./routes/StaffRoutes'))

function App() {
  const { session, profile, role, isSuperAdmin, loading, recoveryMode } = useAuthContext()
  const { data: clinic } = useClinic()

  // ── Auth loading ────────────────────────────────────────────────────────────
  if (loading) return <FullScreenLoader />

  // ── Password-reset flow (email link) ───────────────────────────────────────
  // Must intercept before route rendering so the hash token is consumed first.
  if (recoveryMode) return <NovaSenhaPage />

  // ── Unauthenticated ─────────────────────────────────────────────────────────
  if (!session) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<FullScreenLoader />}>
          <PublicRoutes />
        </Suspense>
      </ErrorBoundary>
    )
  }

  // ── Signed-in but profile not yet created (first OAuth login) ───────────────
  if (!profile) return <OnboardingPage />

  // ── Patient portal ──────────────────────────────────────────────────────────
  if (role === 'patient') {
    return (
      <ErrorBoundary>
        <PatientPortalLayout>
          <Suspense fallback={<PageLoader />}>
            <PatientRoutes />
          </Suspense>
        </PatientPortalLayout>
      </ErrorBoundary>
    )
  }

  // ── Clinic setup wizard (admin of a brand-new clinic) ───────────────────────
  if (role === 'admin' && !isSuperAdmin && clinic && !clinic.onboardingCompleted) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<FullScreenLoader />}>
          <OnboardingRoutes />
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
      <DataPrefetcher />
      <Routes>
        <Route path="*" element={
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <StaffRoutes />
            </Suspense>
          </AppLayout>
        } />
      </Routes>
    </>
  )
}

export default App
