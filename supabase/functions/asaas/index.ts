/**
 * Edge Function: asaas
 *
 * Proxy seguro para a API do Asaas. Nunca expõe a API key ao frontend.
 *
 * Ambiente controlado por Supabase Secret "ASAAS_ENV":
 *   - "sandbox" (padrão) → usa ASAAS_API_KEY_SANDBOX + sandbox.asaas.com
 *   - "production"       → usa ASAAS_API_KEY_PRODUCTION + www.asaas.com
 *
 * Rotas suportadas (proxied diretamente para Asaas):
 *   POST   /customers
 *   GET    /customers/:id
 *   POST   /subscriptions
 *   GET    /subscriptions/:id
 *   DELETE /subscriptions/:id
 *   POST   /payments
 *   GET    /payments/:id
 *   DELETE /payments/:id
 *   POST   /transfers
 *
 * Rota composta (lógica própria):
 *   POST   /activate-subscription  → cria customer + subscription + salva no DB
 *   POST   /upgrade-subscription   → atualiza valor da assinatura existente (muda tier)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ASAAS_ENV = Deno.env.get('ASAAS_ENV') ?? 'sandbox'
const isProd = ASAAS_ENV === 'production'

const ASAAS_KEY = isProd
  ? Deno.env.get('ASAAS_API_KEY_PRODUCTION')!
  : Deno.env.get('ASAAS_API_KEY_SANDBOX')!

const ASAAS_BASE = isProd
  ? 'https://www.asaas.com/api/v3'
  : 'https://sandbox.asaas.com/api/v3'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function err(msg: string, status = 400): Response {
  return json({ error: msg }, status)
}

function getRequestIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  const cfIp = req.headers.get('cf-connecting-ip')?.trim()
  if (cfIp) return cfIp

  return '127.0.0.1'
}

/** Chama a API do Asaas com a key correta */
async function asaasFetch(
  path: string,
  method = 'GET',
  body?: string,
): Promise<Response> {
  return fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'access_token': ASAAS_KEY,
    },
    body,
  })
}

/** Valida o JWT do usuário e retorna o user_id */
async function getAuthUser(
  authHeader: string | null,
): Promise<{ userId: string; clinicId: string | null; isSuperAdmin: boolean } | null> {
  if (!authHeader) return null
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('user_profiles')
    .select('clinic_id, is_super_admin')
    .eq('id', user.id)
    .maybeSingle()

  return {
    userId: user.id,
    clinicId: (profile?.clinic_id as string | null) ?? null,
    isSuperAdmin: (profile?.is_super_admin as boolean) ?? false,
  }
}

async function ensurePaymentsModuleEnabled(
  supabase: ReturnType<typeof createClient>,
  auth: { clinicId: string | null; isSuperAdmin: boolean },
): Promise<Response | null> {
  if (auth.isSuperAdmin) return null
  if (!auth.clinicId) return err('Clínica não encontrada para o usuário autenticado', 403)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clinic, error: clinicError } = await (supabase as any)
    .from('clinics')
    .select('payments_enabled, billing_override_enabled, subscription_status')
    .eq('id', auth.clinicId)
    .single()

  if (clinicError) {
    return err(`Erro ao validar assinatura da clínica: ${clinicError.message}`, 500)
  }

  if (!clinic?.payments_enabled && !clinic?.billing_override_enabled) {
    const status = clinic?.subscription_status ? ` (${clinic.subscription_status})` : ''
    return err(`Módulo financeiro indisponível para esta clínica${status}`, 403)
  }

  return null
}

async function ensureClinicAccess(
  auth: { clinicId: string | null; isSuperAdmin: boolean },
  clinicId: string,
): Promise<Response | null> {
  if (auth.isSuperAdmin) return null
  if (!auth.clinicId || auth.clinicId !== clinicId) {
    return err('Você não pode operar a assinatura de outra clínica', 403)
  }
  return null
}

async function ensureSubscriptionAccess(
  supabase: ReturnType<typeof createClient>,
  auth: { clinicId: string | null; isSuperAdmin: boolean },
  subscriptionId: string,
): Promise<Response | null> {
  if (auth.isSuperAdmin) return null
  if (!auth.clinicId) return err('Clínica não encontrada para o usuário autenticado', 403)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clinic, error: clinicError } = await (supabase as any)
    .from('clinics')
    .select('id')
    .eq('asaas_subscription_id', subscriptionId)
    .maybeSingle()

  if (clinicError) {
    return err(`Erro ao validar assinatura: ${clinicError.message}`, 500)
  }

  if (!clinic || clinic.id !== auth.clinicId) {
    return err('Você não pode acessar a assinatura de outra clínica', 403)
  }

  return null
}

// ─── Rota composta: ativar assinatura da clínica ──────────────────────────────

interface CreditCardInput {
  holderName: string
  number: string
  expiryMonth: string
  expiryYear: string
  ccv: string
}

interface ActivateInput {
  clinicId: string
  billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED'
  tier?: 'basic' | 'professional' | 'unlimited'
  responsible: {
    name: string
    cpfCnpj: string
    email?: string
    phone?: string
    postalCode?: string
    address?: string
    addressNumber?: string
    province?: string
    city?: string
    state?: string
  }
  clinic: {
    name: string
    cnpj?: string
    city?: string
    state?: string
  }
  creditCard?: CreditCardInput
}

async function handleActivateSubscription(
  req: Request,
  auth: { clinicId: string | null; isSuperAdmin: boolean },
): Promise<Response> {
  let body: ActivateInput
  try {
    body = await req.json() as ActivateInput
  } catch {
    return err('Body inválido')
  }

  const { clinicId, billingType, responsible, clinic, creditCard } = body
  if (!clinicId || !billingType || !responsible?.name || !responsible?.cpfCnpj) {
    return err('Campos obrigatórios: clinicId, billingType, responsible.name, responsible.cpfCnpj')
  }

  const tier = body.tier ?? 'basic'
  const TIER_VALUES: Record<string, number> = { basic: 100.00, professional: 200.00, unlimited: 300.00 }
  const subscriptionValue = TIER_VALUES[tier] ?? 100.00
  const access = await ensureClinicAccess(auth, clinicId)
  if (access) return access
  if (billingType === 'CREDIT_CARD' && !creditCard) {
    return err('Dados do cartão são obrigatórios para billingType CREDIT_CARD')
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1. Verificar se clínica já tem um customer no Asaas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clinicRow } = await (supabase as any)
    .from('clinics')
    .select('asaas_customer_id, asaas_subscription_id, subscription_status')
    .eq('id', clinicId)
    .single()

  let customerId: string = clinicRow?.asaas_customer_id ?? ''
  let subscriptionId: string = clinicRow?.asaas_subscription_id ?? ''

  // 2. Criar customer se não existe
  if (!customerId) {
    const custRes = await asaasFetch('/customers', 'POST', JSON.stringify({
      name: responsible.name,
      cpfCnpj: responsible.cpfCnpj,
      email: responsible.email ?? undefined,
      phone: responsible.phone ?? undefined,
      mobilePhone: responsible.phone ?? undefined,
      postalCode: responsible.postalCode ?? undefined,
      address: responsible.address ?? undefined,
      addressNumber: responsible.addressNumber ?? undefined,
      province: responsible.province ?? undefined,
      city: responsible.city ?? undefined,
      state: responsible.state ?? undefined,
      externalReference: clinicId,
    }))

    if (!custRes.ok) {
      const errText = await custRes.text()
      let msg = `Erro ao criar customer Asaas (${custRes.status})`
      try {
        const parsed = JSON.parse(errText)
        msg = parsed?.errors?.[0]?.description ?? msg
      } catch { /* ok */ }
      return err(msg, custRes.status)
    }

    const custData = await custRes.json() as { id: string }
    customerId = custData.id
  }

  // 3. Criar assinatura se não existe
  if (!subscriptionId) {
    const today = new Date()
    today.setDate(today.getDate() + 1) // vence amanhã
    const nextDueDate = today.toISOString().split('T')[0]

    const subBody: Record<string, unknown> = {
      customer: customerId,
      billingType,
      value: subscriptionValue,
      nextDueDate,
      cycle: 'MONTHLY',
      description: `Plano ${tier} Consultin — ${clinic.name}`,
      externalReference: clinicId,
    }

    // Cartão de crédito: incluir dados do cartão e do titular
    if (billingType === 'CREDIT_CARD' && creditCard) {
      subBody.creditCard = {
        holderName: creditCard.holderName,
        number: creditCard.number.replace(/\s/g, ''),
        expiryMonth: creditCard.expiryMonth,
        expiryYear: creditCard.expiryYear,
        ccv: creditCard.ccv,
      }
      subBody.creditCardHolderInfo = {
        name: responsible.name,
        email: responsible.email ?? '',
        cpfCnpj: responsible.cpfCnpj,
        postalCode: responsible.postalCode ?? '',
        addressNumber: responsible.addressNumber ?? 'S/N',
        phone: responsible.phone ?? '',
      }
      subBody.remoteIp = getRequestIp(req)
    }

    const subRes = await asaasFetch('/subscriptions', 'POST', JSON.stringify(subBody))

    if (!subRes.ok) {
      const errText = await subRes.text()
      let msg = `Erro ao criar assinatura Asaas (${subRes.status})`
      try {
        const parsed = JSON.parse(errText)
        msg = parsed?.errors?.[0]?.description ?? msg
      } catch { /* ok */ }
      return err(msg, subRes.status)
    }

    const subData = await subRes.json() as { id: string }
    subscriptionId = subData.id
  }

  // 4. Salvar no DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbErr } = await (supabase as any)
    .from('clinics')
    .update({
      asaas_customer_id: customerId,
      asaas_subscription_id: subscriptionId,
      subscription_status: 'ACTIVE',
      subscription_tier: tier,
      payments_enabled: true,
    })
    .eq('id', clinicId)

  if (dbErr) {
    return err(`Assinatura criada no Asaas mas falhou ao salvar no DB: ${dbErr.message}`, 500)
  }

  return json({ customerId, subscriptionId })
}

// ─── Rota composta: alterar tier da assinatura ───────────────────────────────

async function handleUpgradeSubscription(
  req: Request,
  auth: { clinicId: string | null; isSuperAdmin: boolean },
): Promise<Response> {
  let body: { clinicId: string; tier: 'basic' | 'professional' | 'unlimited' }
  try {
    body = await req.json()
  } catch {
    return err('Body inválido')
  }

  const { clinicId, tier } = body
  if (!clinicId || !tier) return err('Campos obrigatórios: clinicId, tier')

  const access = await ensureClinicAccess(auth, clinicId)
  if (access) return access

  const TIER_VALUES: Record<string, number> = { basic: 100.00, professional: 200.00, unlimited: 300.00 }
  const newValue = TIER_VALUES[tier]
  if (!newValue) return err(`Tier inválido: ${tier}`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clinicRow, error: clinicErr } = await (supabase as any)
    .from('clinics')
    .select('asaas_subscription_id')
    .eq('id', clinicId)
    .single()

  if (clinicErr || !clinicRow?.asaas_subscription_id) {
    return err('Assinatura Asaas não encontrada para esta clínica', 404)
  }

  const subId: string = clinicRow.asaas_subscription_id

  // Atualiza valor no Asaas (POST parcial conforme API v3)
  const asaasRes = await asaasFetch(`/subscriptions/${subId}`, 'POST', JSON.stringify({ value: newValue }))
  if (!asaasRes.ok) {
    const errText = await asaasRes.text()
    let msg = `Erro ao atualizar assinatura Asaas (${asaasRes.status})`
    try {
      const parsed = JSON.parse(errText)
      msg = parsed?.errors?.[0]?.description ?? msg
    } catch { /* ok */ }
    return err(msg, asaasRes.status)
  }

  // Atualiza tier no DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbErr } = await (supabase as any)
    .from('clinics')
    .update({ subscription_tier: tier })
    .eq('id', clinicId)

  if (dbErr) return err(`Tier atualizado no Asaas mas falhou no DB: ${dbErr.message}`, 500)

  return json({ subscriptionId: subId, tier, value: newValue })
}

// ─── Entry point ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  // Auth check
  const auth = await getAuthUser(req.headers.get('Authorization'))
  if (!auth) {
    return err('Não autorizado', 401)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Extrair path a partir de /functions/v1/asaas
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/functions\/v1\/asaas/, '') || '/'

  // Rotas compostas
  if (path === '/activate-subscription' && req.method === 'POST') {
    return handleActivateSubscription(req, auth)
  }

  if (path === '/upgrade-subscription' && req.method === 'POST') {
    return handleUpgradeSubscription(req, auth)
  }

  const subscriptionMatch = path.match(/^\/subscriptions\/([^/]+)$/)
  if (subscriptionMatch && (req.method === 'GET' || req.method === 'DELETE')) {
    const gate = await ensureSubscriptionAccess(supabase, auth, subscriptionMatch[1])
    if (gate) return gate
  }

  if (
    req.method === 'POST'
    && (path === '/customers' || path === '/payments' || path === '/transfers')
  ) {
    const gate = await ensurePaymentsModuleEnabled(supabase, auth)
    if (gate) return gate
  }

  // Proxy simples → Asaas API
  const allowedPrefixes = ['/customers', '/subscriptions', '/payments', '/transfers']
  const isAllowed = allowedPrefixes.some((p) => path.startsWith(p))
  if (!isAllowed) {
    return err(`Rota não suportada: ${path}`, 404)
  }

  const bodyText = req.method !== 'GET' && req.method !== 'DELETE'
    ? await req.text()
    : undefined

  // Forward query params (ex: ?externalReference=uuid)
  const asaasPath = path + url.search
  const asaasRes = await asaasFetch(asaasPath, req.method, bodyText)
  const resText = await asaasRes.text()

  return new Response(resText, {
    status: asaasRes.status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
