import { describe, it, expect } from 'vitest'
import { APP_ROUTES, isProtectedAppPath } from '../lib/appRoutes'

describe('isProtectedAppPath', () => {
  it('matches authenticated app routes', () => {
    expect(isProtectedAppPath(APP_ROUTES.staff.home)).toBe(true)
    expect(isProtectedAppPath('/pacientes/123')).toBe(true)
    expect(isProtectedAppPath(APP_ROUTES.patient.appointments)).toBe(true)
    expect(isProtectedAppPath(APP_ROUTES.onboarding.wizard)).toBe(true)
  })

  it('does not classify public or marketing routes as protected', () => {
    expect(isProtectedAppPath(APP_ROUTES.public.home)).toBe(false)
    expect(isProtectedAppPath(APP_ROUTES.public.login)).toBe(false)
    expect(isProtectedAppPath(APP_ROUTES.public.clinicSignup)).toBe(false)
    expect(isProtectedAppPath(APP_ROUTES.public.emailVerified)).toBe(false)
    expect(isProtectedAppPath('/p/clinica-exemplo')).toBe(false)
    expect(isProtectedAppPath('/agenda-medica-online')).toBe(false)
  })
})
