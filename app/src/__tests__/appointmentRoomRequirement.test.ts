import { describe, it, expect } from 'vitest'
import { getAppointmentRoomRequirement } from '../utils/appointmentRoomRequirement'

describe('getAppointmentRoomRequirement', () => {
  it('does not require room when clinic has no rooms', () => {
    expect(getAppointmentRoomRequirement([])).toEqual({
      hasRegisteredRooms: false,
      hasSelectableRooms: false,
      requiresRoomSelection: false,
    })
  })

  it('requires room when clinic has active rooms', () => {
    expect(getAppointmentRoomRequirement([
      { active: true },
      { active: true },
    ])).toEqual({
      hasRegisteredRooms: true,
      hasSelectableRooms: true,
      requiresRoomSelection: true,
    })
  })

  it('still requires room when clinic has rooms cadastradas but none active', () => {
    expect(getAppointmentRoomRequirement([
      { active: false },
    ])).toEqual({
      hasRegisteredRooms: true,
      hasSelectableRooms: false,
      requiresRoomSelection: true,
    })
  })
})