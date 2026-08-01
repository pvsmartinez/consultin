import { describe, it, expect } from 'vitest'
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_COLORS,
  SEX_LABELS,
  USER_ROLE_LABELS,
  ROLE_PERMISSIONS,
} from '../types'

describe('APPOINTMENT_STATUS_LABELS', () => {
  const expectedStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']

  it('has all expected status keys', () => {
    for (const s of expectedStatuses) {
      expect(APPOINTMENT_STATUS_LABELS).toHaveProperty(s)
    }
  })

  it('has pt-BR labels', () => {
    expect(APPOINTMENT_STATUS_LABELS.scheduled).toBe('Agendado')
    expect(APPOINTMENT_STATUS_LABELS.confirmed).toBe('Confirmado')
    expect(APPOINTMENT_STATUS_LABELS.completed).toBe('Realizado')
    expect(APPOINTMENT_STATUS_LABELS.cancelled).toBe('Cancelado')
    expect(APPOINTMENT_STATUS_LABELS.no_show).toBe('Não compareceu')
  })

  it('has no undefined values', () => {
    for (const [, v] of Object.entries(APPOINTMENT_STATUS_LABELS)) {
      expect(v).toBeTruthy()
    }
  })
})

describe('APPOINTMENT_STATUS_COLORS', () => {
  it('has color class for each status key', () => {
    for (const s of ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']) {
      expect(APPOINTMENT_STATUS_COLORS).toHaveProperty(s)
      expect(typeof APPOINTMENT_STATUS_COLORS[s as keyof typeof APPOINTMENT_STATUS_COLORS]).toBe('string')
    }
  })
})

describe('SEX_LABELS', () => {
  it('has M, F, O', () => {
    expect(SEX_LABELS).toHaveProperty('M')
    expect(SEX_LABELS).toHaveProperty('F')
    expect(SEX_LABELS).toHaveProperty('O')
  })

  it('has correct pt-BR labels', () => {
    expect(SEX_LABELS.M).toBe('Masculino')
    expect(SEX_LABELS.F).toBe('Feminino')
    expect(SEX_LABELS.O).toBe('Outro')
  })
})

describe('USER_ROLE_LABELS', () => {
  const roles = ['admin', 'receptionist', 'professional', 'patient']

  it('has all role keys', () => {
    for (const r of roles) {
      expect(USER_ROLE_LABELS).toHaveProperty(r)
    }
  })

  it('has non-empty string for each role', () => {
    for (const r of roles) {
      expect(USER_ROLE_LABELS[r as keyof typeof USER_ROLE_LABELS]).toBeTruthy()
    }
  })
})

describe('ROLE_PERMISSIONS', () => {
  it('has entries for all 4 roles', () => {
    expect(ROLE_PERMISSIONS).toHaveProperty('admin')
    expect(ROLE_PERMISSIONS).toHaveProperty('receptionist')
    expect(ROLE_PERMISSIONS).toHaveProperty('professional')
    expect(ROLE_PERMISSIONS).toHaveProperty('patient')
  })

  it('admin has all permissions true except canManageOwnAvailability', () => {
    const perms = ROLE_PERMISSIONS.admin
    for (const [k, v] of Object.entries(perms)) {
      if (k === 'canManageOwnAvailability') {
        expect(v).toBe(false)
      } else {
        expect(v).toBe(true)
      }
    }
  })

  it('patient has all permissions false', () => {
    const perms = ROLE_PERMISSIONS.patient
    for (const [, v] of Object.entries(perms)) {
      expect(v).toBe(false)
    }
  })

  it('receptionist can view and manage patients', () => {
    expect(ROLE_PERMISSIONS.receptionist.canViewPatients).toBe(true)
    expect(ROLE_PERMISSIONS.receptionist.canManagePatients).toBe(true)
  })

  it('receptionist cannot manage professionals or settings', () => {
    expect(ROLE_PERMISSIONS.receptionist.canManageProfessionals).toBe(false)
    expect(ROLE_PERMISSIONS.receptionist.canManageSettings).toBe(false)
  })

  it('professional can view patients but not manage them', () => {
    expect(ROLE_PERMISSIONS.professional.canViewPatients).toBe(true)
    expect(ROLE_PERMISSIONS.professional.canManagePatients).toBe(false)
  })

  it('inventory permission: admin and receptionist manage, professional and patient cannot', () => {
    expect(ROLE_PERMISSIONS.admin.canManageInventory).toBe(true)
    expect(ROLE_PERMISSIONS.receptionist.canManageInventory).toBe(true)
    expect(ROLE_PERMISSIONS.professional.canManageInventory).toBe(false)
    expect(ROLE_PERMISSIONS.patient.canManageInventory).toBe(false)
  })
})
