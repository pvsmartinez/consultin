import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { PageLoader } from '../components/ui/PageLoader'
import { APP_ROUTES } from '../lib/appRoutes'

const ClinicSetupWizardPage = lazy(() => import('../pages-v1/ClinicSetupWizardPage'))

export default function OnboardingRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path={APP_ROUTES.onboarding.wizard} element={<ClinicSetupWizardPage />} />
        <Route path="*" element={<Navigate to={APP_ROUTES.onboarding.wizard} replace />} />
      </Routes>
    </Suspense>
  )
}
