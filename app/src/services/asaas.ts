/**
 * asaas.ts — Asaas payment gateway client (server-side calls via Supabase Edge Function
 * or direct from frontend using the public token for read-only ops).
 *
 * All write operations (create customer, subscription, charge, transfer) must be
 * proxied through a Supabase Edge Function to keep the API key secret.
 * This file exposes typed wrappers that call our own `/api/asaas/*` edge functions.
 *
 * Doc: https://docs.asaas.com
 */

import { supabase } from './supabase'

// ─── Base URL for our Edge Function proxy ────────────────────────────────────
const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas`

async function callEdge<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${EDGE_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    let msg = `Asaas error ${res.status}`
    try { msg = JSON.parse(text)?.errors?.[0]?.description ?? msg } catch { /* ok */ }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AsaasCustomer {
  id: string
  name: string
  cpfCnpj: string
  email: string | null
  phone: string | null
}

export type AsaasBillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED'

export interface AsaasSubscription {
  id: string
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'OVERDUE'
  billingType: AsaasBillingType
  value: number
  nextDueDate: string
  customer: string
}

export interface AsaasCharge {
  id: string
  status: 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE' | 'REFUNDED' | 'CANCELLED'
  billingType: AsaasBillingType
  value: number
  dueDate: string
  customer: string
  pixTransaction?: {
    encodedImage: string   // QR code base64
    payload: string        // copia-e-cola
    expirationDate: string
  }
  invoiceUrl: string | null
}

export interface AsaasTransfer {
  id: string
  status: 'PENDING' | 'DONE' | 'CANCELLED' | 'FAILED'
  value: number
  transferDate: string
}

export interface BankAccountInput {
  bank: { code: string }
  accountName: string
  ownerName: string
  cpfCnpj: string
  agency: string
  agencyDigit?: string
  account: string
  accountDigit: string
  bankAccountType: 'CONTA_CORRENTE' | 'CONTA_POUPANCA' | 'CONTA_SALARIO'
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface CreateCustomerInput {
  name: string
  cpfCnpj: string    // CNPJ da clínica ou CPF do responsável
  email?: string
  phone?: string
  mobilePhone?: string
  address?: string
  addressNumber?: string
  complement?: string
  province?: string  // bairro
  postalCode?: string
  city?: string
  state?: string
  externalReference?: string  // clinic.id
}

/** Cria cliente no Asaas e retorna o customerId */
export async function createAsaasCustomer(input: CreateCustomerInput): Promise<AsaasCustomer> {
  return callEdge<AsaasCustomer>('/customers', 'POST', input)
}

/** Retorna cliente pelo id */
export async function getAsaasCustomer(customerId: string): Promise<AsaasCustomer> {
  return callEdge<AsaasCustomer>(`/customers/${customerId}`)
}

/**
 * Busca customer pelo externalReference (patient.id).
 * Se não encontrar, cria um novo. Evita IDs duplicados no Asaas.
 */
export async function findOrCreateAsaasCustomer(
  input: CreateCustomerInput,
): Promise<AsaasCustomer> {
  if (input.externalReference) {
    const list = await callEdge<{ data: AsaasCustomer[] }>(
      `/customers?externalReference=${encodeURIComponent(input.externalReference)}`,
    )
    if (list.data?.length > 0) return list.data[0]
  }
  return createAsaasCustomer(input)
}

// ─── Subscription (cobrança da clínica — R$100/mês) ──────────────────────────

export interface CreateSubscriptionInput {
  customer: string         // Asaas customerId
  billingType: AsaasBillingType
  value: number            // 100.00
  nextDueDate: string      // YYYY-MM-DD
  cycle: 'MONTHLY'
  description?: string
  externalReference?: string  // clinic.id
}

/** Cria assinatura recorrente mensal */
export async function createAsaasSubscription(
  input: CreateSubscriptionInput,
): Promise<AsaasSubscription> {
  return callEdge<AsaasSubscription>('/subscriptions', 'POST', input)
}

/** Retorna assinatura */
export async function getAsaasSubscription(subscriptionId: string): Promise<AsaasSubscription> {
  return callEdge<AsaasSubscription>(`/subscriptions/${subscriptionId}`)
}

/** Cancela assinatura */
export async function cancelAsaasSubscription(subscriptionId: string): Promise<void> {
  await callEdge(`/subscriptions/${subscriptionId}`, 'DELETE')
}

// ─── Charge (cobrança avulsa — pagamento de consulta) ─────────────────────────

export interface CreateChargeInput {
  customer: string           // Asaas customerId (criado para o paciente)
  billingType: AsaasBillingType
  value: number              // em reais
  dueDate: string            // YYYY-MM-DD
  description?: string
  externalReference?: string // appointment.id
}

/** Cria cobrança avulsa (PIX / boleto / cartão) */
export async function createAsaasCharge(input: CreateChargeInput): Promise<AsaasCharge> {
  return callEdge<AsaasCharge>('/payments', 'POST', input)
}

/** Consulta status de uma cobrança */
export async function getAsaasCharge(chargeId: string): Promise<AsaasCharge> {
  return callEdge<AsaasCharge>(`/payments/${chargeId}`)
}

/** Cancela cobrança */
export async function cancelAsaasCharge(chargeId: string): Promise<void> {
  await callEdge(`/payments/${chargeId}`, 'DELETE')
}

// ─── Transfer (repasse ao profissional) ──────────────────────────────────────

export interface TransferInput {
  value: number
  operationType: 'PIX' | 'TED'
  pixAddressKey?: string       // chave PIX para operationType=PIX
  bankAccount?: BankAccountInput  // para TED
  description?: string
  externalReference?: string   // appointment_payment.id
}

/** Efetua transferência para conta bancária do profissional */
export async function createAsaasTransfer(input: TransferInput): Promise<AsaasTransfer> {
  return callEdge<AsaasTransfer>('/transfers', 'POST', input)
}

// ─── Clinic subscription flow (composite) ────────────────────────────────────

export interface CreditCardInput {
  holderName: string
  number: string
  expiryMonth: string   // '01'–'12'
  expiryYear: string    // '2025'–
  ccv: string
}

export interface ActivateClinicSubscriptionInput {
  clinicId: string
  billingType: AsaasBillingType
  tier: 'basic' | 'professional' | 'unlimited'
  /** Dados do responsável (admin da clínica) */
  responsible: {
    name: string
    cpfCnpj: string
    email?: string
    phone?: string
    postalCode?: string
    address?: string
    addressNumber?: string
    province?: string  // bairro
    city?: string
    state?: string
  }
  clinic: {
    name: string
    cnpj?: string
    city?: string
    state?: string
  }
  /** Obrigatório quando billingType === 'CREDIT_CARD' */
  creditCard?: CreditCardInput
}

/**
 * Fluxo completo:
 * 1. Cria ou recupera customer no Asaas
 * 2. Cria assinatura mensal conforme tier (basic=R$100, professional=R$200, unlimited=R$300)
 * 3. Salva asaas_customer_id + asaas_subscription_id + subscription_status + subscription_tier na clínica
 * Returns: { customerId, subscriptionId }
 */
export async function activateClinicSubscription(
  input: ActivateClinicSubscriptionInput,
): Promise<{ customerId: string; subscriptionId: string }> {
  return callEdge<{ customerId: string; subscriptionId: string }>(
    '/activate-subscription',
    'POST',
    input,
  )
}

/** Altera o tier de uma assinatura existente — atualiza valor no Asaas e subscription_tier no DB */
export async function upgradeClinicSubscription(
  clinicId: string,
  tier: 'basic' | 'professional' | 'unlimited',
): Promise<{ subscriptionId: string; tier: string; value: number }> {
  return callEdge<{ subscriptionId: string; tier: string; value: number }>(
    '/upgrade-subscription',
    'POST',
    { clinicId, tier },
  )
}
