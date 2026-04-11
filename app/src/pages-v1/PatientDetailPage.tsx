import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, PencilSimple, CalendarBlank, CalendarPlus, Phone, Envelope, MapPin, ClipboardText, WhatsappLogo, Copy } from '@phosphor-icons/react'
import PatientDrawer from '../components/patients/PatientDrawer'
import { usePatient } from '../hooks/usePatients'
import { usePatientAppointments } from '../hooks/useAppointments'
import { useClinic } from '../hooks/useClinic'
import { Badge } from '@pvsmartinez/shared/ui'
import { formatDate, formatDateTime } from '../utils/date'
import PatientRecordsPanel from '../components/patients/PatientRecordsPanel'
import PatientFilesPanel from '../components/patients/PatientFilesPanel'
import AppointmentModal from '../components/appointments/AppointmentModal'
import { toast } from 'sonner'
import {
  SEX_LABELS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANTS,
} from '../types'

function hasCustomFieldValue(value: unknown) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function formatCustomFieldValue(type: string, value: unknown) {
  if (Array.isArray(value)) return value.join(', ')
  if (type === 'boolean') return value ? 'Sim' : 'Não'
  if (type === 'date' && typeof value === 'string') return formatDate(`${value}T00:00:00`)
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return JSON.stringify(value)
}

function InfoRow({ label, value, copyable }: { label: string; value: string | null | undefined; copyable?: boolean }) {
  function copy() {
    if (!value) return
    navigator.clipboard.writeText(value)
    toast.success(`${label} copiado!`)
  }
  return (
    <div>
      <dt className="text-xs text-gray-400 mb-0.5">{label}</dt>
      <dd className={`text-sm text-gray-800 flex items-center gap-1.5 ${copyable && value ? 'cursor-pointer group' : ''}`}
          onClick={copyable && value ? copy : undefined}>
        {value || '—'}
        {copyable && value && (
          <Copy size={12} className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
        )}
      </dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  )
}

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { patient, loading } = usePatient(id!)
  const { appointments, loading: loadingApts } = usePatientAppointments(id!)
  const { data: clinic } = useClinic()
  const [scheduling, setScheduling] = useState(false)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false)

  if (loading) {
    return <div className="text-center text-gray-400 text-sm mt-20">Carregando...</div>
  }

  if (!patient) {
    return (
      <div className="text-center mt-20">
        <p className="text-gray-500 mb-4">Paciente não encontrado.</p>
        <button onClick={() => navigate('/pacientes')} className="text-[#006970] text-sm hover:underline">
          Voltar para Pacientes
        </button>
      </div>
    )
  }

  const age = patient.birthDate
    ? Math.floor((Date.now() - new Date(patient.birthDate + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null
  const visibleCustomFields = (clinic?.customPatientFields ?? []).filter(field =>
    hasCustomFieldValue(patient.customFields?.[field.key])
  )

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/pacientes')}
            className="text-gray-400 hover:text-gray-600 transition mt-1"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-800">{patient.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
              {age !== null && <span>{age} anos</span>}
              {patient.sex && <span>{SEX_LABELS[patient.sex]}</span>}
              {patient.birthDate && <span>{formatDate(patient.birthDate + 'T00:00:00')}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setScheduling(true)}
            className="flex items-center gap-2 text-sm text-white px-3 py-1.5 rounded-xl transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
          >
            <CalendarPlus size={15} />
            Agendar
          </button>
          <button
            onClick={() => setEditDrawerOpen(true)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg transition"
          >
            <PencilSimple size={15} />
            Editar
          </button>
          <Link
            to={`/pacientes/${patient.id}/anamnese`}
            className="flex items-center gap-2 text-sm text-gray-600 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg transition"
          >
            <ClipboardText size={15} />
            Anamnese
          </Link>
        </div>
      </div>

      {/* Quick contact */}
      <div className="flex flex-wrap gap-3 mb-4">
        {patient.phone && (
          <>
            <a
              href={`tel:${patient.phone}`}
              className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition"
            >
              <Phone size={15} className="text-green-500" />
              {patient.phone}
            </a>
            <a
              href={(() => { const d = patient.phone.replace(/\D/g, ''); return `https://wa.me/${d.startsWith('55') ? d : '55' + d}` })()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 hover:bg-green-100 transition"
              title="Abrir WhatsApp"
            >
              <WhatsappLogo size={15} weight="fill" className="text-green-500" />
              WhatsApp
            </a>
          </>
        )}
        {patient.email && (
          <a
            href={`mailto:${patient.email}`}
            className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition"
          >
            <Envelope size={15} className="text-[#0ea5b0]" />
            {patient.email}
          </a>
        )}
      </div>

      {/* Dados pessoais */}
      <Section title="Dados Pessoais">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoRow label="CPF" value={patient.cpf} copyable />
          <InfoRow label="RG" value={patient.rg} copyable />
          <InfoRow label="Data de nascimento" value={patient.birthDate ? formatDate(patient.birthDate + 'T00:00:00') : null} />
        </dl>
      </Section>

      {/* Endereço */}
      {(patient.addressStreet || patient.addressCity) && (
        <Section title="Endereço">
          <div className="flex items-start gap-2 text-sm text-gray-700">
            <MapPin size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <span>
              {[
                patient.addressStreet && `${patient.addressStreet}${patient.addressNumber ? ', ' + patient.addressNumber : ''}`,
                patient.addressComplement,
                patient.addressNeighborhood,
                patient.addressCity && `${patient.addressCity}${patient.addressState ? ' – ' + patient.addressState : ''}`,
                patient.addressZip,
              ].filter(Boolean).join(' · ')}
            </span>
          </div>
        </Section>
      )}

      {/* Observações */}
      {patient.notes && (
        <Section title="Observações">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{patient.notes}</p>
        </Section>
      )}

      {/* Campos personalizados */}
      {visibleCustomFields.length > 0 && (
        <Section title="Campos Personalizados">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibleCustomFields.map(field => {
              const rawValue = patient.customFields?.[field.key]
              const formatted = formatCustomFieldValue(field.type, rawValue)
              const isLongText = field.type === 'textarea' || (typeof formatted === 'string' && formatted.length > 120)

              return (
                <div key={field.key} className={isLongText ? 'sm:col-span-2' : ''}>
                  <dt className="text-xs text-gray-400 mb-0.5">{field.label}</dt>
                  <dd className={`text-sm text-gray-800 ${isLongText ? 'whitespace-pre-wrap' : ''}`}>{formatted}</dd>
                </div>
              )
            })}
          </dl>
        </Section>
      )}

      {/* Histórico de consultas */}
      <Section title="Histórico de Consultas">
        {loadingApts ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : appointments.length === 0 ? (
          <div className="text-center py-6">
            <CalendarBlank size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhuma consulta registrada.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {appointments.map(apt => (
              <li key={apt.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-700">{formatDateTime(apt.startsAt)}</p>
                  {apt.professional && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {apt.professional.name}{apt.professional.specialty ? ` · ${apt.professional.specialty}` : ''}
                    </p>
                  )}
                  {apt.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{apt.notes}</p>}
                </div>
                <Badge variant={APPOINTMENT_STATUS_VARIANTS[apt.status]}>
                  {APPOINTMENT_STATUS_LABELS[apt.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Anotações e Anexos */}
      <Section title="Anotações e Exames">
        <PatientRecordsPanel patientId={id!} />
      </Section>

      {/* Arquivos */}
      <Section title="Arquivos e Documentos">
        {clinic ? (
          <PatientFilesPanel patientId={id!} clinicId={clinic.id} />
        ) : (
          <p className="text-sm text-gray-400">Carregando...</p>
        )}
      </Section>

      <AppointmentModal
        open={scheduling}
        onClose={() => setScheduling(false)}
        initialPatientId={patient.id}
        initialPatientName={patient.name}
      />

      <PatientDrawer
        open={editDrawerOpen}
        patientId={patient.id}
        onClose={() => setEditDrawerOpen(false)}
        onSaved={() => setEditDrawerOpen(false)}
      />
    </div>
  )
}
