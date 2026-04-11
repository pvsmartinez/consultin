import { Navigate } from 'react-router-dom'
import { useClinicModules } from '../../hooks/useClinicModules'
import type { ClinicModule } from '../../hooks/useClinicModules'

interface RequireModuleProps {
  children: React.ReactNode
  module: ClinicModule
  redirectTo?: string
}

/**
 * Wraps a route to require a clinic module to be enabled.
 * If the module is disabled, redirects to /agenda (or a custom path).
 *
 * Usage:
 *   <RequireModule module="financial"><FinanceiroPage /></RequireModule>
 */
export default function RequireModule({ children, module, redirectTo = '/agenda' }: RequireModuleProps) {
  const modules = useClinicModules()
  const moduleFlags: Record<ClinicModule, boolean> = {
    rooms:     modules.hasRooms,
    staff:     modules.hasStaff,
    whatsapp:  modules.hasWhatsApp,
    financial: modules.hasFinancial,
    services:  modules.hasServices,
  }
  if (!moduleFlags[module]) return <Navigate to={redirectTo} replace />
  return <>{children}</>
}
