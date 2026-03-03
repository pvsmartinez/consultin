import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuthContext } from './contexts/AuthContext'
import { useClinic } from './hooks/useClinic'
import { FullScreenLoader, PageLoader } from './components/ui/PageLoader'

// ─── Eager imports — rendered outside of route transitions ───────────────────
// These must be sync: they cover auth states that appear before any route shell.
import NovaSenhaPage    from './pages/NovaSenhaPage'    // recoveryMode intercept
import OnboardingPage   from './pages/OnboardingPage'   // !profile gate
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
// AdminPage is standalone (own full-screen layout) — isolated chunk
const AdminPage         = lazy(() => import('./pages/AdminPage'))

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

  // ── Staff / admin (sidebar layout) ─────────────────────────────────────────
  // AdminPage is outside AppLayout — it has its own full-screen dark shell.
  // All other staff routes live inside AppLayout with the sidebar.
  return (
    <Routes>
      {isSuperAdmin && (
        <Route path="/admin" element={
          <Suspense fallback={<FullScreenLoader />}>
            <AdminPage />
          </Suspense>
        } />
      )}
      <Route path="*" element={
        <AppLayout>
          <Suspense fallback={<PageLoader />}>
            <StaffRoutes />
          </Suspense>
        </AppLayout>
      } />
    </Routes>
  )
}

export default App
