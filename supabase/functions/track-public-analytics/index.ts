/**
 * Edge Function: track-public-analytics (Consultin)
 *
 * Public analytics intake for Consultin's unauthenticated routes.
 * Stores only lightweight reachability/funnel events for landing, login,
 * and clinic-signup flows.
 *
 * POST /track-public-analytics
 *   body: { eventName, pagePath, referrer?, metadata? }
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_EVENTS = new Set([
  'page_view',
  'login_cta_click',
  'signup_cta_click',
  'clinic_signup_submit',
])

function allowedOrigin(origin: string | null): string {
  if (!origin) return 'https://consultin.pmatz.com'
  if (
    origin === 'https://consultin.pmatz.com'
    || origin === 'https://www.consultin.pmatz.com'
    || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  ) {
    return origin
  }
  return 'https://consultin.pmatz.com'
}

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin),
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json' },
  })
}

function sanitizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function sanitizeMetadata(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const entries = Object.entries(value as Record<string, unknown>).slice(0, 12)
  const result: Record<string, string | number | boolean | null> = {}

  for (const [key, raw] of entries) {
    const cleanKey = key.trim().slice(0, 64)
    if (!cleanKey) continue
    if (typeof raw === 'string') result[cleanKey] = raw.slice(0, 255)
    else if (typeof raw === 'number' && Number.isFinite(raw)) result[cleanKey] = raw
    else if (typeof raw === 'boolean' || raw === null) result[cleanKey] = raw
  }

  return result
}

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin)

  let body: Record<string, unknown>

  try {
    body = JSON.parse(await req.text())
  } catch {
    return json({ error: 'Invalid JSON' }, 400, origin)
  }

  const eventName = sanitizeText(body.eventName, 80)
  const pagePath = sanitizeText(body.pagePath, 200)
  const referrer = sanitizeText(body.referrer, 200)
  const metadata = sanitizeMetadata(body.metadata)

  if (!eventName || !pagePath || !ALLOWED_EVENTS.has(eventName)) {
    return json({ error: 'Invalid event payload' }, 400, origin)
  }

  const { error } = await serviceClient()
    .from('public_site_events')
    .insert({
      event_name: eventName,
      page_path: pagePath,
      referrer,
      metadata,
    })

  if (error) {
    console.error('Failed to insert public analytics event:', error)
    return json({ error: 'Failed to store event' }, 500, origin)
  }

  return json({ ok: true }, 200, origin)
})