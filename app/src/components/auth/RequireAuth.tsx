import { Navigate } from 'react-router-dom'
import { useAuthContext } from '../../contexts/AuthContext'
import { APP_ROUTES } from '../../lib/appRoutes'
import type { UserRole } from '../../types'

interface RequireAuthProps {
  children: React.ReactNode
  /** If provided, only these roles can access this route */
  roles?: UserRole[]
  /** Permission key to check (alternative to roles) */
  permission?: string
  /** Where to redirect if unauthorized. Defaults to /acesso-negado */
  redirectTo?: string
}

/**
 * Wraps a route to require authentication and optionally a specific role/permission.
 *
 * Usage:
 *   <RequireAuth>               → any logged-in user
 *   <RequireAuth roles={['admin', 'receptionist']}> → only those roles
 *   <RequireAuth permission="canManagePatients">     → permission-based
 */
export default function RequireAuth({ children, roles, permission, redirectTo = '/acesso-negado' }: RequireAuthProps) {
  const { session, role, loading, hasPermission } = useAuthContext()

  if (loading) return null

  if (!session) return <Navigate to={APP_ROUTES.public.login} replace />

  if (roles && role && !roles.includes(role)) {
    return <Navigate to={redirectTo} replace />
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
