import { describe, it, expect } from 'vitest'
import { visibleTimeWindow } from '../pages/AgendaPage'

/** Build an appointment at a local-time HH:MM on a fixed day, lasting `minutes`. */
function appt(time: string, minutes = 30) {
  const [h, m] = time.split(':').map(Number)
  const start = new Date(2026, 7, 4, h, m, 0, 0)
  const end = new Date(start.getTime() + minutes * 60_000)
  return { startsAt: start.toISOString(), endsAt: end.toISOString() }
}

describe('visibleTimeWindow', () => {
  it('keeps the configured hours when everything fits inside them', () => {
    expect(visibleTimeWindow('09:00', '18:00', [appt('10:00'), appt('17:00')]))
      .toEqual({ slotMin: '09:00', slotMax: '18:00' })
  })

  it('grows downward so an early appointment is not clamped to the top edge', () => {
    expect(visibleTimeWindow('09:00', '18:00', [appt('08:30')]))
      .toEqual({ slotMin: '08:00', slotMax: '18:00' })
  })

  it('grows upward so a late appointment is not clamped to the bottom edge', () => {
    expect(visibleTimeWindow('09:00', '18:00', [appt('23:00')]))
      .toEqual({ slotMin: '09:00', slotMax: '23:59' })
  })

  it('covers an appointment that starts inside the window but ends past it', () => {
    expect(visibleTimeWindow('09:00', '18:00', [appt('17:20', 60)]))
      .toEqual({ slotMin: '09:00', slotMax: '19:00' })
  })

  it('handles both edges at once', () => {
    expect(visibleTimeWindow('09:00', '18:00', [appt('07:15'), appt('20:00')]))
      .toEqual({ slotMin: '07:00', slotMax: '21:00' })
  })

  it('ignores unparseable timestamps instead of collapsing the grid', () => {
    expect(visibleTimeWindow('09:00', '18:00', [{ startsAt: 'nope', endsAt: 'nope' }]))
      .toEqual({ slotMin: '09:00', slotMax: '18:00' })
  })

  it('never returns an inverted window', () => {
    const w = visibleTimeWindow('18:00', '09:00', [])
    expect(timeToMin(w.slotMax)).toBeGreaterThan(timeToMin(w.slotMin))
  })
})

function timeToMin(v: string) {
  const [h, m] = v.split(':').map(Number)
  return h * 60 + m
}
