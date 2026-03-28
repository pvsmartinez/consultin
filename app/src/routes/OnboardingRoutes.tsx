import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { PageLoader } from '../components/ui/PageLoader'

const ClinicSetupWizardPage = lazy(() => import('../pages-v1/ClinicSetupWizardPage'))

export default function OnboardingRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/onboarding" element={<ClinicSetupWizardPage />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    </Suspense>
  )
}
