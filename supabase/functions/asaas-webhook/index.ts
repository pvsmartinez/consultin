/**
 * Edge Function: asaas-webhook
 *
 * Recebe notificações de eventos de pagamento do Asaas e atualiza o DB.
 *
 * Configurar no painel Asaas:
 *   URL: https://<project-ref>.supabase.co/functions/v1/asaas-webhook
 *   Método: POST
 *   Enviar header: asaas-access-token: <valor igual ao ASAAS_WEBHOOK_TOKEN no Supabase Secrets>
 *
 * Eventos tratados:
 *   PAYMENT_RECEIVED  → status = RECEIVED / assinatura = ACTIVE
 *   PAYMENT_CONFIRMED → status = CONFIRMED / assinatura = ACTIVE
 *   PAYMENT_OVERDUE   → status = OVERDUE / assinatura = OVERDUE
 *   PAYMENT_DELETED   → status = CANCELLED
 *   PAYMENT_REFUNDED  → status = REFUNDED
 *
 * Se o pagamento pertencer a uma assinatura de clínica, sincroniza
 * clinics.subscription_status + clinics.payments_enabled.
 * Se pertencer a uma cobrança de consulta, atualiza appointment_payments.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Seleciona o token correto conforme ASAAS_ENV (sandbox | production) */
const ASAAS_ENV = Deno.env.get('ASAAS_ENV') ?? 'sandbox'
const isProd = ASAAS_ENV === 'production'
const WEBHOOK_TOKEN = isProd
  ? Deno.env.get('ASAAS_WEBHOOK_TOKEN_PRODUCTION') ?? ''
  : Deno.env.get('ASAAS_WEBHOOK_TOKEN_SANDBOX') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Mapa de eventos Asaas → status interno */
const EVENT_TO_STATUS: Record<string, string> = {
  PAYMENT_RECEIVED:  'RECEIVED',
  PAYMENT_CONFIRMED: 'CONFIRMED',
  PAYMENT_OVERDUE:   'OVERDUE',
  PAYMENT_DELETED:   'CANCELLED',
  PAYMENT_REFUNDED:  'REFUNDED',
}

const EVENT_TO_SUBSCRIPTION_UPDATE: Partial<Record<string, {
  subscriptionStatus: 'ACTIVE' | 'OVERDUE'
  paymentsEnabled: boolean
}>> = {
  PAYMENT_RECEIVED:  { subscriptionStatus: 'ACTIVE',  paymentsEnabled: true },
  PAYMENT_CONFIRMED: { subscriptionStatus: 'ACTIVE',  paymentsEnabled: true },
  PAYMENT_OVERDUE:   { subscriptionStatus: 'OVERDUE', paymentsEnabled: false },
}

async function syncClinicSubscriptionStatus(
  supabase: ReturnType<typeof createClient>,
  event: string,
  payment: { subscription?: string | null; externalReference?: string | null },
) {
  const update = EVENT_TO_SUBSCRIPTION_UPDATE[event]
  if (!update) return

  let clinicId: string | null = null

  if (payment.subscription) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clinicBySubscription } = await (supabase as any)
      .from('clinics')
      .select('id')
      .eq('asaas_subscription_id', payment.subscription)
      .maybeSingle()

    clinicId = (clinicBySubscription?.id as string | null) ?? null
  }

  if (!clinicId && payment.externalReference) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clinicByExternalReference } = await (supabase as any)
      .from('clinics')
      .select('id')
      .eq('id', payment.externalReference)
      .maybeSingle()

    clinicId = (clinicByExternalReference?.id as string | null) ?? null
  }

  if (!clinicId) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('clinics')
    .update({
      subscription_status: update.subscriptionStatus,
      payments_enabled: update.paymentsEnabled,
    })
    .eq('id', clinicId)

  if (error) {
    console.error('[asaas-webhook] Erro ao sincronizar assinatura da clínica:', error.message)
  } else {
    console.log(`[asaas-webhook] clínica ${clinicId} sincronizada → ${update.subscriptionStatus}`)
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  // ── Verificar token do webhook ────────────────────────────────────────────
  if (!WEBHOOK_TOKEN) {
    if (isProd) {
      // Fail closed in production — never accept unverified payment callbacks
      console.error('[asaas-webhook] FATAL: ASAAS_WEBHOOK_TOKEN_PRODUCTION is not configured')
      return new Response('Service misconfigured', { status: 500, headers: CORS })
    }
    console.warn('[asaas-webhook] WARNING: webhook token not configured (sandbox — accepting all)')
  } else {
    const incomingToken = req.headers.get('asaas-access-token') ?? ''
    if (incomingToken !== WEBHOOK_TOKEN) {
      console.warn('[asaas-webhook] Invalid webhook token')
      return new Response('Unauthorized', { status: 401, headers: CORS })
    }
  }

  // ── Ler payload ────────────────────────────────────────────────────────────
  let payload: {
    event: string
    payment?: {
      id: string
      status: string
      externalReference?: string | null
      subscription?: string | null
    }
  }
  try {
    payload = await req.json()
  } catch {
    return new Response('Bad Request', { status: 400, headers: CORS })
  }

  const { event, payment } = payload

  console.log(`[asaas-webhook] event=${event} payment=${payment?.id}`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ── Processar evento de pagamento ─────────────────────────────────────────
  const newStatus = EVENT_TO_STATUS[event]
  if (newStatus && payment?.id) {
    // Busca appointment_payment pelo asaas_charge_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: apRow, error: findErr } = await (supabase as any)
      .from('appointment_payments')
      .select('id, status, appointment_id, amount_cents')
      .eq('asaas_charge_id', payment.id)
      .single()

    if (findErr || !apRow) {
      // Pode vir de uma assinatura que não é de consulta (ex: cobrança mensal da clínica)
      // — apenas log, não é erro crítico
      console.log(`[asaas-webhook] Nenhum appointment_payment com asaas_payment_id=${payment.id}`)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (supabase as any)
        .from('appointment_payments')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', apRow.id)

      if (updateErr) {
        console.error('[asaas-webhook] Erro ao atualizar status:', updateErr.message)
      } else {
        console.log(`[asaas-webhook] appointment_payment ${apRow.id} atualizado → ${newStatus}`)

        // Sincroniza appointments.paid_amount_cents para manter KPIs do Financeiro corretos
        if (newStatus === 'RECEIVED' || newStatus === 'CONFIRMED') {
          await supabase
            .from('appointments')
            .update({
              paid_amount_cents: apRow.amount_cents,
              paid_at: new Date().toISOString(),
              status: 'completed',
            })
            .eq('id', apRow.appointment_id)
        }
      }
    }
  }

  if (payment) {
    await syncClinicSubscriptionStatus(supabase, event, payment)
  }

  // Asaas espera 200 OK mesmo se não processamos o evento
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
