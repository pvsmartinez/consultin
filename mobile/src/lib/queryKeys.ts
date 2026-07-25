// Mirror of consultin/app/src/lib/queryKeys.ts — keep in sync when adding new keys

export const QK = {
  appointments: {
    all:       ()                                                                                       => ['appointments']                            as const,
    forClinic: (clinicId: string | null | undefined)                                                   => ['appointments', clinicId]                  as const,
    today:     (clinicId: string | null | undefined)                                                   => ['today-appointments', clinicId]             as const,
    list:      (clinicId: string | null | undefined, from: string, to: string, ids: string[] | 'all') => ['appointments', clinicId, from, to, ids]   as const,
  },

  patients: {
    all:    ()                                                                      => ['patients']                              as const,
    list:   (clinicId: string | null | undefined, search: string, page: number)    => ['patients', clinicId, search, page]      as const,
    search: (clinicId: string | null | undefined, search: string, limit: number)   => ['patient-search', clinicId, search, limit] as const,
  },

  financial: {
    all:      ()                                                                         => ['financial']                       as const,
    forClinic:(clinicId: string | null | undefined)                                      => ['financial', clinicId]             as const,
    monthly:  (clinicId: string | null | undefined, monthStart: string)                  => ['financial', clinicId, monthStart] as const,
  },

  dashboard: {
    clinicKPIs:    (clinicId: string | null | undefined) => ['dashboard-clinic-kpis', clinicId] as const,
    clinicKPIsAll: ()                                    => ['dashboard-clinic-kpis']            as const,
  },

  clinic: {
    detail: (clinicId: string | null | undefined) => ['clinic', clinicId] as const,
  },
} as const
