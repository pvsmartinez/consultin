import {
  computeAvailableSlots,
  toUtcDate,
  validateSelectedSlot,
} from './index.ts'

Deno.test('computeAvailableSlots uses Sao Paulo local time and filters busy overlaps', () => {
  const slots = computeAvailableSlots({
    professionals: [{ id: 'professional-1', name: 'Dra. Ana', specialty: 'Odonto' }],
    availabilitySlots: [{
      professional_id: 'professional-1',
      weekday: 1,
      start_time: '08:00',
      end_time: '10:00',
      week_parity: null,
      active: true,
    }],
    busyAppointments: [{
      professional_id: 'professional-1',
      starts_at: toUtcDate('2026-04-13', '08:30').toISOString(),
      ends_at: toUtcDate('2026-04-13', '09:00').toISOString(),
    }],
    slotDuration: 30,
    dateKey: '2026-04-13',
    now: new Date('2026-04-12T12:00:00.000Z'),
  })

  if (slots.length !== 3) {
    throw new Error(`Expected 3 available slots, got ${slots.length}`)
  }

  if (slots[0].startsAt !== '2026-04-13T11:00:00.000Z') {
    throw new Error(`Expected first slot at 11:00Z, got ${slots[0].startsAt}`)
  }

  if (slots.some((slot) => slot.startsAt === '2026-04-13T11:30:00.000Z')) {
    throw new Error('Busy slot at 08:30 BRT should not be available')
  }

  if (slots[0].displayTime !== '08:00') {
    throw new Error(`Expected displayTime 08:00, got ${slots[0].displayTime}`)
  }
})

Deno.test('validateSelectedSlot rejects forged duration and accepts the canonical slot', () => {
  const availableSlots = computeAvailableSlots({
    professionals: [{ id: 'professional-1', name: 'Dra. Ana', specialty: null }],
    availabilitySlots: [{
      professional_id: 'professional-1',
      weekday: 1,
      start_time: '08:00',
      end_time: '09:00',
      week_parity: null,
      active: true,
    }],
    busyAppointments: [],
    slotDuration: 30,
    dateKey: '2026-04-13',
    now: new Date('2026-04-12T12:00:00.000Z'),
  })

  const firstSlot = availableSlots[0]
  const forged = validateSelectedSlot({
    availableSlots,
    professionalId: 'professional-1',
    requestedStartsAtIso: firstSlot.startsAt,
    requestedEndsAtIso: '2026-04-13T12:30:00.000Z',
  })

  if (forged.error !== 'invalid_duration') {
    throw new Error(`Expected invalid_duration, got ${forged.error}`)
  }

  const valid = validateSelectedSlot({
    availableSlots,
    professionalId: 'professional-1',
    requestedStartsAtIso: firstSlot.startsAt,
    requestedEndsAtIso: firstSlot.endsAt,
  })

  if (valid.error !== null || !valid.selectedSlot) {
    throw new Error('Expected the canonical slot to be accepted')
  }
})