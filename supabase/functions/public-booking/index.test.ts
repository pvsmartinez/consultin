import {
  computeAvailableSlots,
  toUtcDate,
  validateSelectedSlot,
  parseDateKey,
  normalizePhone,
  matchesWeekParity,
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

// ─── parseDateKey ─────────────────────────────────────────────────────────────

Deno.test('parseDateKey accepts valid ISO date strings', () => {
  const result = parseDateKey('2026-04-27')
  if (result !== '2026-04-27') throw new Error(`Expected '2026-04-27', got ${result}`)
})

Deno.test('parseDateKey rejects malformed strings', () => {
  const bad = ['20260427', '2026/04/27', 'bad', '', '2026-13-01', '2026-04-00']
  for (const value of bad) {
    if (parseDateKey(value) !== null) throw new Error(`Expected null for '${value}'`)
  }
})

// ─── normalizePhone ───────────────────────────────────────────────────────────

Deno.test('normalizePhone strips all non-digits', () => {
  const cases: [string, string][] = [
    ['+55 (11) 98765-4321', '5511987654321'],
    ['(11)9876-5432', '1198765432'],
    ['11 98765 4321', '11987654321'],
    ['55119', '55119'],
  ]
  for (const [input, expected] of cases) {
    const got = normalizePhone(input)
    if (got !== expected) throw new Error(`normalizePhone('${input}'): expected '${expected}', got '${got}'`)
  }
})

// ─── matchesWeekParity ────────────────────────────────────────────────────────

// 2026-04-13 is a Monday. Week 16 of 2026 (even).
// 2026-04-20 is a Monday. Week 17 of 2026 (odd).
// These test dates are chosen so week number parity is deterministic.

Deno.test('matchesWeekParity null/every always matches', () => {
  const date = new Date('2026-04-13T12:00:00Z')
  if (!matchesWeekParity(null, date))   throw new Error('null parity should match')
  if (!matchesWeekParity('every', date)) throw new Error('every parity should match')
})

Deno.test('matchesWeekParity even/odd alternate by week number', () => {
  const evenWeekDate = new Date('2026-04-13T12:00:00Z') // week 16 = even
  const oddWeekDate  = new Date('2026-04-20T12:00:00Z') // week 17 = odd

  if (!matchesWeekParity('even', evenWeekDate)) throw new Error('week 16 should match even')
  if ( matchesWeekParity('odd',  evenWeekDate)) throw new Error('week 16 should not match odd')
  if (!matchesWeekParity('odd',  oddWeekDate))  throw new Error('week 17 should match odd')
  if ( matchesWeekParity('even', oddWeekDate))  throw new Error('week 17 should not match even')
})

Deno.test('matchesWeekParity monthly matches only on the configured day-of-month', () => {
  const date13 = new Date('2026-04-13T12:00:00Z') // day 13
  const date15 = new Date('2026-04-15T12:00:00Z') // day 15

  if (!matchesWeekParity('monthly:13', date13)) throw new Error('day 13 should match monthly:13')
  if ( matchesWeekParity('monthly:13', date15)) throw new Error('day 15 should not match monthly:13')
})

// ─── computeAvailableSlots — extra edge cases ─────────────────────────────────

Deno.test('computeAvailableSlots returns slots for multiple professionals independently', () => {
  const slots = computeAvailableSlots({
    professionals: [
      { id: 'prof-a', name: 'Dra. Ana', specialty: 'Odonto' },
      { id: 'prof-b', name: 'Dr. Bruno', specialty: 'Fisio' },
    ],
    availabilitySlots: [
      { professional_id: 'prof-a', weekday: 1, start_time: '08:00', end_time: '09:00', week_parity: null, active: true },
      { professional_id: 'prof-b', weekday: 1, start_time: '09:00', end_time: '10:00', week_parity: null, active: true },
    ],
    busyAppointments: [],
    slotDuration: 30,
    dateKey: '2026-04-13', // Monday
    now: new Date('2026-04-12T12:00:00.000Z'),
  })

  const profASlots = slots.filter((s) => s.professionalId === 'prof-a')
  const profBSlots = slots.filter((s) => s.professionalId === 'prof-b')

  if (profASlots.length !== 2) throw new Error(`Expected 2 slots for prof-a, got ${profASlots.length}`)
  if (profBSlots.length !== 2) throw new Error(`Expected 2 slots for prof-b, got ${profBSlots.length}`)
})

Deno.test('computeAvailableSlots filters out past slots (within 5-min buffer)', () => {
  // now = 2026-04-13T11:00:00Z (= 08:00 BRT). 08:00 slot is exactly at the buffer edge → excluded.
  const slots = computeAvailableSlots({
    professionals: [{ id: 'p', name: 'Dr. X', specialty: null }],
    availabilitySlots: [
      { professional_id: 'p', weekday: 1, start_time: '08:00', end_time: '09:00', week_parity: null, active: true },
    ],
    busyAppointments: [],
    slotDuration: 30,
    dateKey: '2026-04-13',
    now: new Date('2026-04-13T11:00:00.000Z'), // exactly at 08:00 BRT
  })

  // 08:00 slot start ≤ now + 5min → excluded. 08:30 slot start is 11:30Z > 11:05Z → included.
  if (slots.some((s) => s.displayTime === '08:00')) throw new Error('08:00 slot should be excluded (past)')
  if (!slots.some((s) => s.displayTime === '08:30')) throw new Error('08:30 slot should be available')
})

Deno.test('computeAvailableSlots respects maxSlots limit', () => {
  const slots = computeAvailableSlots({
    professionals: [{ id: 'p', name: 'Dr. X', specialty: null }],
    availabilitySlots: [
      { professional_id: 'p', weekday: 1, start_time: '08:00', end_time: '18:00', week_parity: null, active: true },
    ],
    busyAppointments: [],
    slotDuration: 30,
    dateKey: '2026-04-13',
    maxSlots: 3,
    now: new Date('2026-04-12T12:00:00.000Z'),
  })

  if (slots.length !== 3) throw new Error(`Expected 3 slots (maxSlots), got ${slots.length}`)
})

Deno.test('computeAvailableSlots skips a professional not in availability list', () => {
  const slots = computeAvailableSlots({
    professionals: [
      { id: 'prof-known', name: 'Dr. Known', specialty: null },
      { id: 'prof-unknown', name: 'Dr. Unknown', specialty: null },
    ],
    availabilitySlots: [
      { professional_id: 'prof-known', weekday: 1, start_time: '08:00', end_time: '08:30', week_parity: null, active: true },
      // prof-unknown has no matching professional in professionals[]
    ],
    busyAppointments: [],
    slotDuration: 30,
    dateKey: '2026-04-13',
    now: new Date('2026-04-12T12:00:00.000Z'),
  })

  if (slots.some((s) => s.professionalId === 'prof-unknown')) {
    throw new Error('prof-unknown should not appear — no matching availability row professional')
  }
  if (slots.length !== 1) throw new Error(`Expected 1 slot, got ${slots.length}`)
})
