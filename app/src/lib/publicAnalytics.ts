import { createPublicAnalyticsClient } from '@pvsmartinez/shared'
import { supabaseUrl } from '../services/supabase'
import { getPublicAttributionMetadata } from './publicAttribution'

const analytics = createPublicAnalyticsClient<PublicAnalyticsEventName>({
  endpoint: `${supabaseUrl}/functions/v1/track-public-analytics`,
  getDefaultMetadata: () => getPublicAttributionMetadata(),
  sessionStorageKey: 'consultin-public-session',
})

type PublicAnalyticsEventName =
  | 'page_view'
  | 'login_cta_click'
  | 'signup_cta_click'
  | 'whatsapp_cta_click'
  | 'clinic_signup_submit'

type PublicAnalyticsMetadata = Record<string, string | number | boolean | null | undefined>

export function trackPublicEvent(eventName: PublicAnalyticsEventName, metadata?: PublicAnalyticsMetadata) {
  void analytics.trackEvent(eventName, { metadata })
}

export function trackPublicPageView(pathKey: string) {
  void analytics.trackPageView(pathKey)
}