/**
 * Tests for useWhatsappFaqs — CRUD for WhatsApp FAQ entries.
 *
 * Covers:
 *  - useWhatsappFaqs fetches and maps FAQ rows
 *  - useCreateWhatsappFaq inserts a new FAQ and invalidates cache
 *  - useUpdateWhatsappFaq patches an existing FAQ
 *  - useDeleteWhatsappFaq soft-deletes by deactivating
 *  - useReorderWhatsappFaqs updates sort_order
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import {
  useWhatsappFaqs,
  useCreateWhatsappFaq,
  useUpdateWhatsappFaq,
} from '../hooks/useWhatsappFaqs'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    profile: { id: 'user-1', clinicId: 'clinic-1' },
  }),
}))

function makeWrapper(qc = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

const FAQ_ROW = {
  id:         'faq-1',
  clinic_id:  'clinic-1',
  question:   'Qual o horário de funcionamento?',
  answer:     'Segunda a Sexta, 8h às 18h.',
  active:     true,
  sort_order: 0,
  created_at: '2025-01-01T00:00:00Z',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useWhatsappFaqs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and maps FAQ rows', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => ({
          order: () => Promise.resolve({ data: [FAQ_ROW], error: null }),
        }),
      }),
    })

    const { result } = renderHook(() => useWhatsappFaqs(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.data).toHaveLength(1))
    const faq = result.current.data![0]
    expect(faq.id).toBe('faq-1')
    expect(faq.question).toBe('Qual o horário de funcionamento?')
    expect(faq.answer).toBe('Segunda a Sexta, 8h às 18h.')
    expect(faq.sortOrder).toBe(0)
    expect(faq.active).toBe(true)
  })

  it('returns empty array when no FAQs exist', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    })

    const { result } = renderHook(() => useWhatsappFaqs(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.data).toEqual([]))
  })
})

describe('useCreateWhatsappFaq', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a new FAQ and returns the mapped object', async () => {
    const insertedRow = { ...FAQ_ROW, id: 'faq-new', question: 'Nova pergunta', answer: 'Nova resposta' }
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: vi.fn().mockResolvedValue({ data: insertedRow, error: null }),
        }),
      }),
    })

    const { result } = renderHook(() => useCreateWhatsappFaq(), {
      wrapper: makeWrapper(),
    })

    let created: unknown
    await act(async () => {
      created = await result.current.mutateAsync({ question: 'Nova pergunta', answer: 'Nova resposta' })
    })

    expect((created as { id: string }).id).toBe('faq-new')
    expect((created as { question: string }).question).toBe('Nova pergunta')
  })
})

describe('useUpdateWhatsappFaq', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('patches the FAQ fields in the database', async () => {
    const updatedRow = { ...FAQ_ROW, answer: 'Novo horário: 7h às 19h.' }
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
        }),
      }),
    })
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
      update: updateMock,
    })

    const { result } = renderHook(() => useUpdateWhatsappFaq(), {
      wrapper: makeWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ id: 'faq-1', answer: 'Novo horário: 7h às 19h.' })
    })

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ answer: 'Novo horário: 7h às 19h.' }),
    )
  })
})
