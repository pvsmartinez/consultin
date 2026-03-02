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
): Promise<{ userId: string } | null> {
  if (!authHeader) return null
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return null
  return { userId: user.id }
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

async function handleActivateSubscription(req: Request): Promise<Response> {
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
      value: 100.00,
      nextDueDate,
      cycle: 'MONTHLY',
      description: `Plano mensal Consultin — ${clinic.name}`,
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
      subBody.remoteIp = '127.0.0.1' // obrigatório pelo Asaas; em prod usa IP real
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
      payments_enabled: true,
    })
    .eq('id', clinicId)

  if (dbErr) {
    return err(`Assinatura criada no Asaas mas falhou ao salvar no DB: ${dbErr.message}`, 500)
  }

  return json({ customerId, subscriptionId })
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

  // Extrair path a partir de /functions/v1/asaas
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/functions\/v1\/asaas/, '') || '/'

  // Rota composta
  if (path === '/activate-subscription' && req.method === 'POST') {
    return handleActivateSubscription(req)
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
