import { gtagEvent } from './gtag'

const GOOGLE_ADS_CONVERSION_IDS = {
  generateLead: 'AW-18041761033/oZP3CIKEqZwcEIna_ZpD',
  signup: 'AW-18041761033/e8mDCPf8iqMcEIna_ZpD',
  onboardingComplete: 'AW-18041761033/PzsXCLuEqZwcEIna_ZpD',
} as const

const trackAdsConversion = (sendTo: string, params?: Record<string, unknown>) => {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return

  window.gtag('event', 'conversion', {
    send_to: sendTo,
    ...params,
  })
}

export const trackGenerateLead = (params?: Record<string, unknown>) => {
  gtagEvent('generate_lead', params)
  trackAdsConversion(GOOGLE_ADS_CONVERSION_IDS.generateLead)
}

export const trackSignup = (params?: Record<string, unknown>) => {
  gtagEvent('sign_up', params)
  trackAdsConversion(GOOGLE_ADS_CONVERSION_IDS.signup)
}

export const trackOnboardingComplete = (params?: Record<string, unknown>) => {
  gtagEvent('onboarding_complete', params)
  trackAdsConversion(GOOGLE_ADS_CONVERSION_IDS.onboardingComplete)
}

export const trackWhatsappCtaClick = (params?: Record<string, unknown>) => {
  gtagEvent('whatsapp_cta_click', params)
}