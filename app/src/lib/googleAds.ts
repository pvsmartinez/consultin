import { createGtagConversionTracker, gtagEvent } from '@pvsmartinez/shared'

const GOOGLE_ADS_CONVERSION_IDS = {
  generateLead: 'AW-18041761033/oZP3CIKEqZwcEIna_ZpD',
  signup: 'AW-18041761033/e8mDCPf8iqMcEIna_ZpD',
  onboardingComplete: 'AW-18041761033/PzsXCLuEqZwcEIna_ZpD',
} as const

const trackAdsConversion = createGtagConversionTracker(GOOGLE_ADS_CONVERSION_IDS)

export const trackGenerateLead = (params?: Record<string, unknown>) => {
  gtagEvent('generate_lead', params)
  trackAdsConversion('generateLead')
}

export const trackSignup = (params?: Record<string, unknown>) => {
  gtagEvent('sign_up', params)
  trackAdsConversion('signup')
}

export const trackOnboardingComplete = (params?: Record<string, unknown>) => {
  gtagEvent('onboarding_complete', params)
  trackAdsConversion('onboardingComplete')
}

export const trackWhatsappCtaClick = (params?: Record<string, unknown>) => {
  gtagEvent('whatsapp_cta_click', params)
}