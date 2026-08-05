import { describe, it, expect } from 'vitest'
import { findBlockAt, type AgendaBlock } from '../hooks/useAgendaBlocks'

function block(partial: Partial<AgendaBlock> & { startsAt: string; endsAt: string }): AgendaBlock {
  return {
    id: partial.id ?? 'b1',
    clinicId: 'c1',
    professionalId: partial.professionalId ?? null,
    allDay: partial.allDay ?? false,
    reason: partial.reason ?? 'Almoço',
    startsAt: partial.startsAt,
    endsAt: partial.endsAt,
  }
}

const lunch = block({ startsAt: '2026-08-05T15:00:00Z', endsAt: '2026-08-05T16:00:00Z' })

describe('findBlockAt', () => {
  it('finds a block covering the instant', () => {
    expect(findBlockAt([lunch], new Date('2026-08-05T15:30:00Z'))?.reason).toBe('Almoço')
  })

  it('treats the start as inside and the end as outside', () => {
    expect(findBlockAt([lunch], new Date('2026-08-05T15:00:00Z'))).not.toBeNull()
    expect(findBlockAt([lunch], new Date('2026-08-05T16:00:00Z'))).toBeNull()
  })

  it('returns null outside the block', () => {
    expect(findBlockAt([lunch], new Date('2026-08-05T14:59:00Z'))).toBeNull()
  })

  it('a clinic-wide block (professionalId null) applies to every professional', () => {
    expect(findBlockAt([lunch], new Date('2026-08-05T15:30:00Z'), 'prof-a')).not.toBeNull()
  })

  it('a professional block does not apply to a different professional', () => {
    const own = block({ startsAt: '2026-08-05T15:00:00Z', endsAt: '2026-08-05T16:00:00Z', professionalId: 'prof-a' })
    expect(findBlockAt([own], new Date('2026-08-05T15:30:00Z'), 'prof-a')).not.toBeNull()
    expect(findBlockAt([own], new Date('2026-08-05T15:30:00Z'), 'prof-b')).toBeNull()
  })

  it('an all-day block covers the whole span', () => {
    const holiday = block({
      startsAt: '2026-08-05T03:00:00Z', endsAt: '2026-08-06T03:00:00Z',
      allDay: true, reason: 'Feriado',
    })
    expect(findBlockAt([holiday], new Date('2026-08-05T13:00:00Z'))?.reason).toBe('Feriado')
    expect(findBlockAt([holiday], new Date('2026-08-06T13:00:00Z'))).toBeNull()
  })

  it('returns null when there are no blocks', () => {
    expect(findBlockAt([], new Date())).toBeNull()
  })
})
