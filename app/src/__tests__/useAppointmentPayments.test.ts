import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import {
  useAppointmentPayments,
  useCreateAppointmentCharge,
  useSyncPaymentStatus,
  useTransferToProfessional,
} from '../hooks/useAppointmentPayments'
import type { AppointmentPayment } from '../types'

const mockFrom = vi.fn()
const findOrCreateAsaasCustomer = vi.fn()
const createAsaasCharge = vi.fn()
const getAsaasCharge = vi.fn()
const createAsaasTransfer = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

vi.mock('../services/asaas', () => ({
  findOrCreateAsaasCustomer: (...args: unknown[]) => findOrCreateAsaasCustomer(...args),
  createAsaasCharge: (...args: unknown[]) => createAsaasCharge(...args),
  getAsaasCharge: (...args: unknown[]) => getAsaasCharge(...args),
  createAsaasTransfer: (...args: unknown[]) => createAsaasTransfer(...args),
}))

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const paymentFixture: AppointmentPayment = {
  id: 'payment-1',
  clinicId: 'clinic-1',
  appointmentId: 'appt-1',
  asaasChargeId: 'charge-1',
  paymentMethod: 'PIX',
  status: 'PENDING',
  amountCents: 15000,
  pixKey: 'pix-code',
  pixExpiresAt: '2026-04-20',
  paidAt: null,
  transferStatus: 'PENDING',
  transferAmountCents: null,
  asaasTransferId: null,
  transferredAt: null,
  notes: null,
  createdAt: '2026-04-13T10:00:00.000Z',
}

describe('useAppointmentPayments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads payments for a specific appointment', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    } as Record<string, unknown>

    Object.assign(chainable, {
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve({
          data: [{
            id: 'payment-1',
            clinic_id: 'clinic-1',
            appointment_id: 'appt-1',
            asaas_charge_id: 'charge-1',
            payment_method: 'PIX',
            status: 'PENDING',
            amount_cents: 15000,
            pix_key: 'pix-code',
            pix_expires_at: '2026-04-20',
            paid_at: null,
            transfer_status: 'PENDING',
            transfer_amount_cents: null,
            asaas_transfer_id: null,
            transferred_at: null,
            notes: null,
            created_at: '2026-04-13T10:00:00.000Z',
          }],
          error: null,
        }).then(resolve, reject)
      },
    })

    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => useAppointmentPayments('appt-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.[0].amountCents).toBe(15000)
    expect(chainable.eq).toHaveBeenCalledWith('appointment_id', 'appt-1')
  })

  it('creates an Asaas charge and persists the payment row', async () => {
    findOrCreateAsaasCustomer.mockResolvedValue({ id: 'customer-1' })
    createAsaasCharge.mockResolvedValue({
      id: 'charge-1',
      status: 'PENDING',
      pixTransaction: {
        payload: 'pix-code',
        expirationDate: '2026-04-20',
        encodedImage: 'qr-image',
      },
      invoiceUrl: 'https://asaas.test/invoice/1',
    })

    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'payment-1',
        clinic_id: 'clinic-1',
        appointment_id: 'appt-1',
        asaas_charge_id: 'charge-1',
        payment_method: 'PIX',
        status: 'PENDING',
        amount_cents: 15000,
        pix_key: 'pix-code',
        pix_expires_at: '2026-04-20',
        paid_at: null,
        transfer_status: 'PENDING',
        transfer_amount_cents: null,
        asaas_transfer_id: null,
        transferred_at: null,
        notes: null,
        created_at: '2026-04-13T10:00:00.000Z',
      },
      error: null,
    })
    const insertMock = vi.fn(() => ({ select: vi.fn().mockReturnValue({ single: singleMock }) }))
    mockFrom.mockReturnValue({ insert: insertMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCreateAppointmentCharge(), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      const created = await result.current.mutateAsync({
        clinicId: 'clinic-1',
        appointmentId: 'appt-1',
        amountCents: 15000,
        paymentMethod: 'PIX',
        patient: {
          id: 'patient-1',
          name: 'João',
          cpf: '11144477735',
          email: 'joao@example.com',
          phone: '11999999999',
        },
      })

      expect(created.payment.asaasChargeId).toBe('charge-1')
      expect(created.pixPayload).toBe('pix-code')
    })

    expect(findOrCreateAsaasCustomer).toHaveBeenCalled()
    expect(createAsaasCharge).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'customer-1',
      billingType: 'PIX',
      value: 150,
      externalReference: 'appt-1',
    }))
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      clinic_id: 'clinic-1',
      appointment_id: 'appt-1',
      asaas_charge_id: 'charge-1',
      amount_cents: 15000,
    }))
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('syncs a paid charge and mirrors payment info into the appointment', async () => {
    getAsaasCharge.mockResolvedValue({ status: 'RECEIVED' })

    const appointmentPaymentsEq = vi.fn().mockResolvedValue({ error: null })
    const appointmentPaymentsUpdate = vi.fn(() => ({ eq: appointmentPaymentsEq }))
    const appointmentsEq = vi.fn().mockResolvedValue({ error: null })
    const appointmentsUpdate = vi.fn(() => ({ eq: appointmentsEq }))

    mockFrom.mockImplementation((table: string) => {
      if (table === 'appointment_payments') {
        return { update: appointmentPaymentsUpdate }
      }
      if (table === 'appointments') {
        return { update: appointmentsUpdate }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSyncPaymentStatus(), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      const status = await result.current.mutateAsync(paymentFixture)
      expect(status).toBe('RECEIVED')
    })

    expect(getAsaasCharge).toHaveBeenCalledWith('charge-1')
    expect(appointmentPaymentsUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'RECEIVED',
      paid_at: expect.any(String),
    }))
    expect(appointmentsUpdate).toHaveBeenCalledWith(expect.objectContaining({
      paid_amount_cents: 15000,
      status: 'completed',
      paid_at: expect.any(String),
    }))
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('creates a transfer for the professional and stores the mapped transfer status', async () => {
    createAsaasTransfer.mockResolvedValue({ id: 'transfer-1', status: 'DONE' })

    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    mockFrom.mockReturnValue({ update: updateMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useTransferToProfessional(), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      const transfer = await result.current.mutateAsync({
        payment: paymentFixture,
        professionalId: 'prof-1',
        transferAmountCents: 5000,
        bankAccount: {
          bankCode: '341',
          agency: '1234',
          account: '98765',
          accountDigit: '1',
          ownerName: 'Dra. Ana',
          ownerCpfCnpj: '11144477735',
          accountType: 'CONTA_CORRENTE',
        },
      })

      expect(transfer.id).toBe('transfer-1')
    })

    expect(createAsaasTransfer).toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      transfer_status: 'TRANSFERRED',
      transfer_amount_cents: 5000,
      asaas_transfer_id: 'transfer-1',
      transferred_at: expect.any(String),
    }))
    expect(eqMock).toHaveBeenCalledWith('id', 'payment-1')
    expect(invalidateSpy).toHaveBeenCalled()
  })
})