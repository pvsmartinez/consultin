// Core domain types for the mobile app — subset of consultin/app/src/types/index.ts

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export interface Appointment {
  id: string
  clinicId: string
  patientId: string
  professionalId: string
  startsAt: string
  endsAt: string
  status: AppointmentStatus
  notes: string | null
  chargeAmountCents: number | null
  paidAmountCents: number | null
  paidAt: string | null
  paymentMethod: string | null
  createdAt: string
  patient?: { id: string; name: string; phone: string | null }
  professional?: { id: string; name: string; specialty: string | null }
}

export interface Patient {
  id: string
  clinicId: string
  name: string
  phone: string | null
  cpf: string | null
  email: string | null
  birthDate: string | null
  createdAt: string
}
