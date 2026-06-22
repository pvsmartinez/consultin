/**
 * Edge Function: track-public-analytics (Consultin)
 *
 * Public analytics intake for Consultin's unauthenticated routes.
 * Stores only lightweight reachability/funnel events for landing, login,
 * and clinic-signup flows.
 */

import { servePublicAnalytics } from '../_shared/analytics.ts'

const ALLOWED_EVENTS = [
  'page_view',
  'login_cta_click',
  'signup_cta_click',
  'whatsapp_cta_click',
  'clinic_signup_submit',
] as const

servePublicAnalytics({
  allowCredentials: true,
  allowedEvents: ALLOWED_EVENTS,
  defaultOrigin: 'https://consultin.pmatz.com',
  mapInsert: ({ eventName, pagePath, referrer, metadata }) => ({
    table: 'public_site_events',
    row: {
      event_name: eventName,
      page_path: pagePath,
      referrer,
      metadata,
    },
  }),
})