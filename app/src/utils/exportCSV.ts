/**
 * Utility to export arrays of objects as CSV files.
 * Generic primitives (arrayToCsv, downloadFile, parseCSV) live in @pvsmartinez/shared.
 */
import { arrayToCsv, downloadFile } from '@pvsmartinez/shared'
export { parseCSV } from '@pvsmartinez/shared'

// ─── Appointment export ──────────────────────────────────────────────────────

export interface AppointmentExportRow {
  date: string
  patient: string
  professional: string
  status: string
  notes: string
  charge: string
  paid: string
}

export function exportAppointmentsCSV(rows: AppointmentExportRow[], filename: string) {
  const headers = ['Data', 'Paciente', 'Profissional', 'Status', 'Observações', 'Valor cobrado', 'Valor pago']
  const body = rows.map(r => [r.date, r.patient, r.professional, r.status, r.notes, r.charge, r.paid])
  downloadFile(arrayToCsv(headers, body), filename)
}

// ─── Patient export ──────────────────────────────────────────────────────────

export interface PatientExportRow {
  name: string
  cpf: string
  rg: string
  birthDate: string
  sex: string
  phone: string
  email: string
  address: string
  city: string
  state: string
  zip: string
  notes: string
  createdAt: string
}

export function exportPatientsCSV(rows: PatientExportRow[], filename: string) {
  const headers = [
    'Nome', 'CPF', 'RG', 'Nascimento', 'Sexo', 'Telefone', 'E-mail',
    'Endereço', 'Cidade', 'UF', 'CEP', 'Observações', 'Cadastrado em',
  ]
  const body = rows.map(r => [
    r.name, r.cpf, r.rg, r.birthDate, r.sex, r.phone, r.email,
    r.address, r.city, r.state, r.zip, r.notes, r.createdAt,
  ])
  downloadFile(arrayToCsv(headers, body), filename)
}

// ─── Professional export ──────────────────────────────────────────────────────

export interface ProfessionalExportRow {
  name: string
  specialty: string
  councilId: string
  phone: string
  email: string
  active: string
  createdAt: string
}

export function exportProfessionalsCSV(rows: ProfessionalExportRow[], filename: string) {
  const headers = ['Nome', 'Especialidade', 'Conselho', 'Telefone', 'E-mail', 'Ativo', 'Cadastrado em']
  const body = rows.map(r => [r.name, r.specialty, r.councilId, r.phone, r.email, r.active, r.createdAt])
  downloadFile(arrayToCsv(headers, body), filename)
}

// ─── Finance export (payments) ────────────────────────────────────────────────

export interface FinanceExportRow {
  date: string
  patient: string
  professional: string
  chargeAmount: string
  paidAmount: string
  paidAt: string
  status: string
}

export function exportFinanceCSV(rows: FinanceExportRow[], filename: string) {
  const headers = ['Data', 'Paciente', 'Profissional', 'Valor cobrado', 'Valor pago', 'Pago em', 'Status']
  const body = rows.map(r => [r.date, r.patient, r.professional, r.chargeAmount, r.paidAmount, r.paidAt, r.status])
  downloadFile(arrayToCsv(headers, body), filename)
}
