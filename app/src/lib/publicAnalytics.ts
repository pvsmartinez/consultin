import { supabaseUrl } from '../services/supabase'

const TRACK_ENDPOINT = `${supabaseUrl}/functions/v1/track-public-analytics`
const SESSION_KEY = 'consultin-public-session'
let lastTrackedPathKey: string | null = null

type PublicAnalyticsEventName =
  | 'page_view'
  | 'login_cta_click'
  | 'signup_cta_click'
  | 'whatsapp_cta_click'
  | 'clinic_signup_submit'

type PublicAnalyticsMetadata = Record<string, string | number | boolean | null | undefined>

function getSessionId() {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing

    const created = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    window.sessionStorage.setItem(SESSION_KEY, created)
    return created
  } catch {
    return 'session-unavailable'
  }
}

function send(body: string) {
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon(TRACK_ENDPOINT, blob)
      return
    }
  } catch {
    // Fall through to fetch.
  }

  fetch(TRACK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Ignore analytics errors on public routes.
  })
}

export function trackPublicEvent(eventName: PublicAnalyticsEventName, metadata?: PublicAnalyticsMetadata) {
  if (typeof window === 'undefined') return

  const payload = JSON.stringify({
    eventName,
    pagePath: window.location.pathname,
    referrer: document.referrer || null,
    metadata: {
      sessionId: getSessionId(),
      ...metadata,
    },
  })

  send(payload)
}

export function trackPublicPageView(pathKey: string) {
  if (lastTrackedPathKey === pathKey) return
  lastTrackedPathKey = pathKey
  trackPublicEvent('page_view')
}