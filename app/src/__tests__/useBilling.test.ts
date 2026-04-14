import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import {
  useActivateClinicBilling,
  useCancelClinicBilling,
  useUpgradeClinicBilling,
} from '../hooks/useBilling'

const mockFrom = vi.fn()
const activateClinicSubscription = vi.fn()
const cancelAsaasSubscription = vi.fn()
const upgradeClinicSubscription = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

vi.mock('../services/asaas', () => ({
  activateClinicSubscription: (...args: unknown[]) => activateClinicSubscription(...args),
  cancelAsaasSubscription: (...args: unknown[]) => cancelAsaasSubscription(...args),
  upgradeClinicSubscription: (...args: unknown[]) => upgradeClinicSubscription(...args),
}))

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useBilling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('activates clinic billing through the Asaas service and invalidates clinic detail', async () => {
    activateClinicSubscription.mockResolvedValue({
      customerId: 'customer-1',
      subscriptionId: 'sub-1',
    })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useActivateClinicBilling(), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      const activated = await result.current.mutateAsync({
        clinicId: 'clinic-1',
        billingType: 'PIX',
        tier: 'professional',
        responsible: {
          name: 'Pedro',
          cpfCnpj: '11144477735',
          email: 'pedro@example.com',
        },
        clinic: {
          name: 'Clínica Demo',
          city: 'São Paulo',
          state: 'SP',
        },
      })

      expect(activated.subscriptionId).toBe('sub-1')
    })

    expect(activateClinicSubscription).toHaveBeenCalledWith(expect.objectContaining({
      clinicId: 'clinic-1',
      tier: 'professional',
    }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clinic', 'clinic-1'] })
  })

  it('cancels clinic billing and disables payments in the clinic row', async () => {
    cancelAsaasSubscription.mockResolvedValue(undefined)

    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    mockFrom.mockReturnValue({ update: updateMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCancelClinicBilling('clinic-1'), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync('sub-1')
    })

    expect(cancelAsaasSubscription).toHaveBeenCalledWith('sub-1')
    expect(updateMock).toHaveBeenCalledWith({
      subscription_status: 'INACTIVE',
      payments_enabled: false,
    })
    expect(eqMock).toHaveBeenCalledWith('id', 'clinic-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clinic', 'clinic-1'] })
  })

  it('upgrades clinic billing tier through Asaas and invalidates clinic detail', async () => {
    upgradeClinicSubscription.mockResolvedValue({ subscriptionId: 'sub-1', tier: 'unlimited' })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useUpgradeClinicBilling('clinic-1'), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      const upgraded = await result.current.mutateAsync({
        subscriptionId: 'sub-1',
        tier: 'unlimited',
      })

      expect(upgraded.tier).toBe('unlimited')
    })

    expect(upgradeClinicSubscription).toHaveBeenCalledWith('clinic-1', 'unlimited')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clinic', 'clinic-1'] })
  })
})