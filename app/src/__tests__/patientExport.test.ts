import { describe, expect, it, vi } from 'vitest'

const mockRange = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ range: (...args: unknown[]) => mockRange(...args) }),
        }),
      }),
    }),
  },
}))

import { loadAllPatientsForExport } from '../utils/patientExport'

describe('loadAllPatientsForExport', () => {
  it('retrieves every patient beyond the PostgREST 1,000-row response cap', async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({ name: `Paciente ${index}` }))
    const finalPage = [{ name: 'Paciente 1000' }, { name: 'Paciente 1001' }]
    mockRange
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: finalPage, error: null })

    const patients = await loadAllPatientsForExport('clinic-1')

    expect(patients).toHaveLength(1_002)
    expect(mockRange).toHaveBeenNthCalledWith(1, 0, 999)
    expect(mockRange).toHaveBeenNthCalledWith(2, 1_000, 1_999)
  })
})
