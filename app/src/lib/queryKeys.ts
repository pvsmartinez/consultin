/**
 * queryKeys.ts — Central React Query key registry
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  RULE: Every useQuery / useMutation in this codebase MUST   ║
 * ║  import its key from here. Hardcoded string arrays are       ║
 * ║  forbidden. If a key isn't here yet, ADD IT HERE FIRST.      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Why: Prevents duplicate keys (same data fetched twice under
 * different names → cache miss every time), enforces staleTime
 * ownership, and makes it trivially reviewable whether a new
 * hook is duplicating an existing one.
 *
 * Convention:
 *   - foo(clinicId)  → full key, used in queryKey: and setQueryData
 *   - fooAll()       → prefix key, used only in invalidateQueries
 *                      to hit all variants (e.g. all months)
 */

export const QK = {
  // ── Appointments ──────────────────────────────────────────────
  appointments: {
    /** Prefix — invalidates every ['appointments', ...] entry */
    all:      ()                                                                            => ['appointments']                              as const,
    list:     (clinicId: string | null | undefined, from: string, to: string, ids: string[] | 'all') => ['appointments', clinicId, from, to, ids] as const,
    today:    (clinicId: string | null | undefined)                 => ['today-appointments', clinicId]      as const,
    /** Prefix — invalidates every ['today-appointments', ...] entry */
    todayAll: ()                                                    => ['today-appointments']                as const,
  },

  // ── Patients ──────────────────────────────────────────────────
  patients: {
    /** Prefix — invalidates every ['patients', ...] entry */
    all:          ()                              => ['patients']                          as const,
    list:         (clinicId: string | null | undefined, search: string, page: number)  => ['patients', clinicId, search, page]           as const,
    detail:       (id: string)                    => ['patient', id]                      as const,
    my:           (userId: string | undefined)    => ['my-patient', userId]               as const,
    appointments: (patientId: string)             => ['patient-appointments', patientId]  as const,
    records:      (patientId: string)             => ['patient_records', patientId]       as const,
    files:        (patientId: string)             => ['patient-files', patientId]         as const,
  },

  // ── Clinic ────────────────────────────────────────────────────
  clinic: {
    detail:        (clinicId: string | null | undefined)  => ['clinic', clinicId]               as const,
    members:       (clinicId: string | null | undefined)  => ['clinic-members', clinicId]       as const,
    invites:       (clinicId: string | null | undefined)  => ['clinic-invites', clinicId]       as const,
    notifications: (clinicId: string | null | undefined)  => ['clinic_notifications', clinicId] as const,
    alerts:        (clinicId: string | null | undefined)  => ['clinic-alerts', clinicId]        as const,
    publicList:    ()                                     => ['clinicsPublic']                  as const,
    pendingInvites:()                                     => ['pendingInvites']                 as const,
    myInvite:      (email: string | null | undefined)     => ['myInvite', email]                as const,
    myClinics:     (userId: string | undefined)           => ['my-clinic-memberships', userId]  as const,
  },

  // ── Professionals ─────────────────────────────────────────────
  professionals: {
    list:        (clinicId: string | null | undefined) => ['professionals', clinicId]             as const,
    today:       (clinicId: string | null | undefined) => ['professionals-today', clinicId]       as const,
    my:          (userId: string | undefined)          => ['my-professional-records', userId]     as const,
    availability:(profId: string)                      => ['availability-slots', profId]          as const,
    bankAccount: (profId: string | undefined)          => ['bank-account', profId]                as const,
    bankAccounts:(clinicId: string | null | undefined) => ['bank-accounts', clinicId]             as const,
  },

  // ── Rooms & availability ──────────────────────────────────────
  rooms: {
    list:              (clinicId: string | null | undefined) => ['rooms', clinicId]                         as const,
    availability:      (clinicId: string | null | undefined) => ['room-availability-slots', clinicId]       as const,
    clinicAvailability:(clinicId: string | null | undefined) => ['clinic-availability-slots-all', clinicId] as const,
    closures:          (roomId:   string | null | undefined) => ['room-closures', roomId]                   as const,
  },

  // ── Dashboard ─────────────────────────────────────────────────
  dashboard: {
    /** Prefix — invalidates every ['dashboard-clinic-kpis', ...] entry */
    clinicKPIsAll:  ()                                          => ['dashboard-clinic-kpis']               as const,
    clinicKPIs:     (clinicId: string | null | undefined)       => ['dashboard-clinic-kpis', clinicId]     as const,
    /** Prefix — invalidates every ['dashboard-professional-kpis', ...] entry */
    profKPIsAll:    ()                                          => ['dashboard-professional-kpis']         as const,
    profKPIs:       (userIdOrEmail: string | null | undefined)  => ['dashboard-professional-kpis', userIdOrEmail] as const,
  },

  // ── Financial ─────────────────────────────────────────────────
  financial: {
    /** Prefix — invalidates every ['financial', ...] entry */
    all:           ()                                              => ['financial']                             as const,
    monthly:       (clinicId: string | null | undefined, monthStart: string)                            => ['financial', clinicId, monthStart]                as const,
    report:        (clinicId: string | null | undefined, monthStart: string, profId: string)            => ['report', clinicId, monthStart, profId]           as const,
    apptPayments:  (apptId: string | undefined)                    => ['appt-payments', apptId]                as const,
    clinicPayments:(clinicId: string | undefined, start?: string)  => start ? ['clinic-appt-payments', clinicId, start] as const : ['clinic-appt-payments', clinicId] as const,
    profEarnings:  (profId: string, month: string)                 => ['prof-earnings', profId, month]         as const,
  },

  // ── Clinic config ─────────────────────────────────────────────
  services: {
    types: (clinicId: string | null | undefined) => ['service-types', clinicId] as const,
  },

  // ── WhatsApp ──────────────────────────────────────────────────
  whatsapp: {
    faqs: (clinicId: string | null | undefined) => ['whatsapp-faqs', clinicId] as const,
  },

  // ── Public booking ────────────────────────────────────────────
  booking: {
    slots: (profId: string, date: string) => ['booked-slots', profId, date] as const,
  },

  // ── Clinic quota ──────────────────────────────────────────────
  quota: {
    monthly: (clinicId: string | null | undefined, month: string) => ['clinic-quota', clinicId, month] as const,
  },

  // ── Super-admin ───────────────────────────────────────────────
  admin: {
    clinics:        () => ['admin', 'clinics']         as const,
    profiles:       () => ['admin', 'profiles']        as const,
    overview:       () => ['admin', 'overview']        as const,
    authUsers:      () => ['admin', 'auth-users']      as const,
    signupRequests: () => ['admin', 'signup-requests'] as const,
  },
} as const
