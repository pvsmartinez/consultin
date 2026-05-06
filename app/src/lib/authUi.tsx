import type { AuthBrand, AuthTheme } from '@pvsmartinez/shared'
import { Stethoscope } from '@phosphor-icons/react'

const ConsultinLogo = () => (
  <div
    style={{
      width: 36,
      height: 36,
      borderRadius: 8,
      background: '#2563eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Stethoscope size={18} weight="bold" color="white" />
  </div>
)

export const CONSULTIN_AUTH_THEME: Partial<AuthTheme> = {
  pageBg: '#eff6ff',
  cardBg: '#ffffff',
  cardBorder: '#e5e7eb',
  cardRadius: '16px',
  cardShadow: '0 4px 24px rgba(0,0,0,0.08)',
  inputBg: '#ffffff',
  inputBorder: '#d1d5db',
  inputBorderFocus: '#3b82f6',
  inputText: '#111827',
  inputPlaceholder: '#9ca3af',
  inputRadius: '8px',
  primaryBg: '#2563eb',
  primaryText: '#ffffff',
  primaryHoverBg: '#1d4ed8',
  primaryRadius: '8px',
  socialBg: '#ffffff',
  socialBorder: '#d1d5db',
  socialText: '#374151',
  socialHoverBg: '#f9fafb',
  socialRadius: '8px',
  textTitle: '#111827',
  textBody: '#374151',
  textMuted: '#6b7280',
  textLink: '#2563eb',
  textLinkHover: '#1d4ed8',
  divider: '#e5e7eb',
  dividerText: '#9ca3af',
  error: '#ef4444',
  success: '#22c55e',
}

export const CONSULTIN_AUTH_BRAND: AuthBrand = {
  logo: <ConsultinLogo />,
  name: 'Consultin',
  subtitle: 'Acesse sua conta',
}