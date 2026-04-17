export const APP_ROUTES = {
  public: {
    home: '/',
    login: '/login',
    clinicSignup: '/cadastro-clinica',
    welcome: '/bem-vindo',
    emailVerified: '/email-verificado',
    clinicPublicProfile: '/p/:slug',
    clinicPublicBooking: '/p/:slug/agendar',
  },
  onboarding: {
    wizard: '/onboarding',
  },
  staff: {
    home: '/agenda',
    legacyToday: '/hoje',
    legacyDashboard: '/dashboard',
    myAgenda: '/minha-agenda',
    myAvailability: '/minha-disponibilidade',
    patients: '/pacientes',
    patientsNew: '/pacientes/novo',
    patientDetail: '/pacientes/:id',
    patientEdit: '/pacientes/:id/editar',
    patientAnamnesis: '/pacientes/:id/anamnese',
    rooms: '/salas',
    team: '/equipe',
    professionals: '/profissionais',
    whatsapp: '/whatsapp',
    financial: '/financeiro',
    reports: '/relatorios',
    settings: '/configuracoes',
    subscription: '/assinatura',
    account: '/minha-conta',
    accessDenied: '/acesso-negado',
  },
  patient: {
    clinics: '/minhas-clinicas',
    appointments: '/minhas-consultas',
    booking: '/agendar',
    profile: '/meu-perfil',
  },
} as const

const PROTECTED_APP_PATH_PREFIXES = [
  APP_ROUTES.staff.home,
  APP_ROUTES.staff.myAgenda,
  APP_ROUTES.staff.myAvailability,
  APP_ROUTES.staff.patients,
  APP_ROUTES.staff.rooms,
  APP_ROUTES.staff.team,
  APP_ROUTES.staff.professionals,
  APP_ROUTES.staff.whatsapp,
  APP_ROUTES.staff.financial,
  APP_ROUTES.staff.reports,
  APP_ROUTES.staff.settings,
  APP_ROUTES.staff.subscription,
  APP_ROUTES.staff.account,
  APP_ROUTES.onboarding.wizard,
  APP_ROUTES.patient.clinics,
  APP_ROUTES.patient.appointments,
  APP_ROUTES.patient.booking,
  APP_ROUTES.patient.profile,
] as const

const PROTECTED_APP_EXACT_PATHS = new Set<string>([
  APP_ROUTES.staff.legacyDashboard,
  APP_ROUTES.staff.legacyToday,
  APP_ROUTES.staff.accessDenied,
])

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function isProtectedAppPath(pathname: string): boolean {
  if (PROTECTED_APP_EXACT_PATHS.has(pathname)) return true

  return PROTECTED_APP_PATH_PREFIXES.some(prefix => matchesPathPrefix(pathname, prefix))
}
