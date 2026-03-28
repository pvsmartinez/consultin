import { z } from 'zod'

// ─── Tab types ────────────────────────────────────────────────────────────────

export type Tab = 'overview' | 'clinics' | 'users' | 'reminders' | 'aprovacoes'

// ─── Reminder ─────────────────────────────────────────────────────────────────

export interface Reminder {
  id: string
  title: string
  description: string
  expiresAt: Date
  warnDaysBefore: number
  link?: string
  linkLabel?: string
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const clinicSchema = z.object({
  name:  z.string().min(2, 'Nome obrigatório'),
  cnpj:  z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  city:  z.string().optional(),
  state: z.string().max(2).optional(),
})
export type ClinicForm = z.infer<typeof clinicSchema>

export const profileSchema = z.object({
  id:           z.string().uuid('UUID inválido'),
  name:         z.string().min(2, 'Nome obrigatório'),
  role:         z.enum(['admin', 'receptionist', 'professional', 'patient']),
  clinicId:     z.string().uuid().nullable(),
  isSuperAdmin: z.boolean(),
})
export type ProfileForm = z.infer<typeof profileSchema>

export const createUserSchema = z.object({
  email:        z.string().email('E-mail inválido'),
  name:         z.string().min(2, 'Nome obrigatório'),
  role:         z.enum(['admin', 'receptionist', 'professional', 'patient']),
  clinicId:     z.string().uuid().nullable(),
  isSuperAdmin: z.boolean(),
})
export type CreateUserForm = z.infer<typeof createUserSchema>
