/**
 * WhatsApp service — frontend API layer
 *
 * All operations that require service-role access (e.g. storing the access token
 * in Vault) are proxied through Supabase Edge Functions.
 * Read operations (sessions, messages) use the normal supabase client + RLS.
 */

import { supabase, supabaseUrl, supabaseAnonKey } from './supabase'
import type { WhatsAppSession, WhatsAppMessage, WhatsAppTemplate } from '../types'

// ─── Session helpers ──────────────────────────────────────────────────────────

function mapSession(r: Record<string, unknown>): WhatsAppSession {
  return {
    id:            r.id as string,
    clinicId:      r.clinic_id as string,
    patientId:     (r.patient_id as string) ?? null,
    waPhone:       r.wa_phone as string,
    status:        r.status as WhatsAppSession['status'],
    aiDraft:       (r.ai_draft as string) ?? null,
    lastMessageAt: r.last_message_at as string,
    createdAt:     r.created_at as string,
    patientName:   (r.patient_name as string) ?? null,
  }
}

function mapMessage(r: Record<string, unknown>): WhatsAppMessage {
  return {
    id:             r.id as string,
    sessionId:      r.session_id as string,
    clinicId:       r.clinic_id as string,
    direction:      r.direction as WhatsAppMessage['direction'],
    waMessageId:    (r.wa_message_id as string) ?? null,
    body:           (r.body as string) ?? null,
    messageType:    (r.message_type as WhatsAppMessage['messageType']) ?? 'text',
    sentBy:         (r.sent_by as WhatsAppMessage['sentBy']) ?? 'system',
    deliveryStatus: (r.delivery_status as WhatsAppMessage['deliveryStatus']) ?? null,
    createdAt:      r.created_at as string,
  }
}

function mapTemplate(r: Record<string, unknown>): WhatsAppTemplate {
  return {
    id:               r.id as string,
    clinicId:         r.clinic_id as string,
    templateKey:      r.template_key as string,
    metaTemplateName: r.meta_template_name as string,
    language:         (r.language as string) ?? 'pt_BR',
    bodyPreview:      r.body_preview as string,
    enabled:          (r.enabled as boolean) ?? true,
    createdAt:        r.created_at as string,
  }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

/** Fetch active sessions for the attendant inbox (status = 'ai' | 'human') */
export async function fetchActiveSessions(clinicId: string): Promise<WhatsAppSession[]> {
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select(`
      *,
      patients ( name )
    `)
    .eq('clinic_id', clinicId)
    .in('status', ['ai', 'human'])
    .order('last_message_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => {
    const raw = r as Record<string, unknown> & { patients?: { name: string } | null }
    return mapSession({ ...raw, patient_name: raw.patients?.name ?? null })
  })
}

/** Mark a session as resolved */
export async function resolveSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_sessions')
    .update({ status: 'resolved' })
    .eq('id', sessionId)
  if (error) throw error
}

/** Claim a session for human handling */
export async function escalateSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_sessions')
    .update({ status: 'human' })
    .eq('id', sessionId)
  if (error) throw error
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/** Load all messages for a session */
export async function fetchMessages(sessionId: string): Promise<WhatsAppMessage[]> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((r: Record<string, unknown>) => mapMessage(r))
}

/**
 * Send a message as an attendant.
 * Calls the whatsapp-send Edge Function which requires service-role access
 * — the Supabase client is used here just to get the project URL.
 */
export async function sendAttendantMessage(params: {
  clinicId:  string
  sessionId: string
  to:        string
  text:      string
}): Promise<void> {
  const { clinicId, sessionId, to, text } = params

  // Get Supabase project URL from the client config
  const projectUrl = supabaseUrl

  const res = await fetch(`${projectUrl}/functions/v1/whatsapp-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Use the anon key — the Edge Function accepts it and uses service role internally
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      clinicId,
      sessionId,
      sentBy: 'attendant',
      to,
      type: 'text',
      text: { body: text },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error ?? 'Failed to send message')
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function fetchTemplates(clinicId: string): Promise<WhatsAppTemplate[]> {
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('template_key')

  if (error) throw error
  return (data ?? []).map((r: Record<string, unknown>) => mapTemplate(r))
}

export async function updateTemplate(
  templateId:      string,
  metaTemplateName: string,
  enabled:         boolean,
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_templates')
    .update({ meta_template_name: metaTemplateName, enabled })
    .eq('id', templateId)
  if (error) throw error
}

// ─── Vault token storage (via Edge Function — needs service role) ─────────────

/**
 * Store the WhatsApp permanent access token securely in Supabase Vault.
 * This is called once during onboarding setup and on token rotation.
 * The actual DB write goes through an Edge Function that has service-role access.
 */
export async function storeWhatsAppToken(clinicId: string, token: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  const authToken = session?.access_token ?? supabaseAnonKey

  const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-store-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${authToken}`,
    },
    body: JSON.stringify({ clinicId, token }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error ?? 'Failed to store token')
  }
}

export async function completeEmbeddedSignup(params: {
  clinicId:      string
  code:          string
  wabaId:        string
  phoneNumberId: string
}): Promise<{ phoneDisplay: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Usuário não autenticado')

  const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-embedded-signup`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' })) as { error?: string }
    throw new Error(err.error ?? 'Falha ao conectar WhatsApp')
  }

  return res.json() as Promise<{ phoneDisplay: string | null }>
}

// ─── Realtime subscription ────────────────────────────────────────────────────

/**
 * Subscribe to new messages in a session for live chat updates.
 * Returns an unsubscribe function.
 */
export function subscribeToSession(
  sessionId: string,
  onMessage:  (msg: WhatsAppMessage) => void,
): () => void {
  const channel = supabase
    .channel(`wa-messages-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'whatsapp_messages',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        onMessage(mapMessage(payload.new as Record<string, unknown>))
      },
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

/**
 * Subscribe to session list changes (new sessions, status changes).
 * Returns an unsubscribe function.
 */
export function subscribeToSessions(
  clinicId: string,
  onChange:  () => void,
): () => void {
  const channel = supabase
    .channel(`wa-sessions-${clinicId}`)
    .on(
      'postgres_changes',
      {
        event:  '*',
        schema: 'public',
        table:  'whatsapp_sessions',
        filter: `clinic_id=eq.${clinicId}`,
      },
      onChange,
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}
