import { describe, expect, it } from 'vitest'
import { fillMissingRoomSelections } from '../utils/agendaRoomSelections'

describe('fillMissingRoomSelections', () => {
  it('keeps the current reference when every appointment already has a selection', () => {
    const current = { 'appointment-1': 'room-1', 'appointment-2': 'room-1' }

    const result = fillMissingRoomSelections(
      current,
      [{ id: 'appointment-1' }, { id: 'appointment-2' }],
      'room-1',
    )

    expect(result).toBe(current)
  })

  it('fills only missing selections with the default room', () => {
    const current = { 'appointment-1': 'room-2' }

    expect(fillMissingRoomSelections(
      current,
      [{ id: 'appointment-1' }, { id: 'appointment-2' }],
      'room-1',
    )).toEqual({ 'appointment-1': 'room-2', 'appointment-2': 'room-1' })
  })
})
