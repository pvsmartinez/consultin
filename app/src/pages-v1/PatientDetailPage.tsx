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
import PatientClinicalPanel from '../components/patients/PatientClinicalPanel'
import AppointmentModal from '../components/appointments/AppointmentModal'
import { toast } from 'sonner'
import {
  SEX_LABELS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANTS,
} from '../types'
import { getPatientInsuranceInfo, hasPatientInsuranceInfo, PATIENT_INSURANCE_TYPE_LABELS } from '../utils/patientInsurance'

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
      <dd className="text-sm text-gray-800">
        {copyable && value ? (
          <button
            type="button"
            onClick={copy}
            className="group inline-flex items-center gap-1.5 rounded-md text-left transition hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]/20"
          >
            <span>{value}</span>
            <Copy size={12} className="text-gray-300 transition-colors group-hover:text-gray-500 flex-shrink-0" />
          </button>
        ) : (
          value || '—'
        )}
      </dd>
    </div>
  )
}

function Section({
  title,
  description,
  sectionId,
  children,
  className = '',
}: {
  title: string
  description?: string
  sectionId?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div id={sectionId} className={`scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 ${className}`.trim()}>
      <div className="mb-4 space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
        {description && <p className="text-sm text-gray-400">{description}</p>}
      </div>
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
  const insuranceInfo = getPatientInsuranceInfo(patient.customFields)
  const showInsuranceSection = (clinic?.modulesEnabled?.includes('insurance') ?? false) || hasPatientInsuranceInfo(patient.customFields)
  const visibleCustomFields = (clinic?.customPatientFields ?? []).filter(field =>
    hasCustomFieldValue(patient.customFields?.[field.key])
  )
  const now = Date.now()
  const upcomingAppointments = appointments
    .filter(appointment =>
      (appointment.status === 'scheduled' || appointment.status === 'confirmed')
      && new Date(appointment.startsAt).getTime() >= now
    )
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  const historyAppointments = appointments.filter(appointment => !upcomingAppointments.some(upcoming => upcoming.id === appointment.id))

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const quickActions = [
    {
      title: 'Agendar retorno',
      description: 'Abrir o agendamento com o paciente já selecionado.',
      actionLabel: 'Agendar agora',
      onClick: () => setScheduling(true),
      tone: 'teal',
    },
    {
      title: 'Documentos e pedidos',
      description: 'Emitir atestado, termo, receita e pedidos sem procurar a seção.',
      actionLabel: 'Ir para documentos',
      onClick: () => scrollToSection('patient-clinical-section'),
      tone: 'sky',
    },
    {
      title: 'Prontuário rápido',
      description: 'Pular direto para notas, observações clínicas e anexos de atendimento.',
      actionLabel: 'Abrir prontuário',
      onClick: () => scrollToSection('patient-records-section'),
      tone: 'amber',
    },
    {
      title: 'Editar cadastro',
      description: 'Atualizar telefone, convênio, endereço e demais dados da ficha.',
      actionLabel: 'Editar ficha',
      onClick: () => setEditDrawerOpen(true),
      tone: 'slate',
    },
  ] as const

  const sidebarActions = [
    { label: 'Consultas', onClick: () => scrollToSection('patient-appointments-section') },
    { label: 'Documentos', onClick: () => scrollToSection('patient-clinical-section') },
    { label: 'Prontuario', onClick: () => scrollToSection('patient-records-section') },
    { label: 'Arquivos', onClick: () => scrollToSection('patient-files-section') },
  ] as const

  function renderAppointmentsList(list: typeof appointments, emptyMessage: string) {
    if (list.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 py-6 text-center">
          <CalendarBlank size={28} className="text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">{emptyMessage}</p>
        </div>
      )
    }

    return (
      <ul className="space-y-3">
        {list.map(apt => (
          <li key={apt.id} className="flex items-start justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">{formatDateTime(apt.startsAt)}</p>
              {apt.professional && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {apt.professional.name}{apt.professional.specialty ? ` · ${apt.professional.specialty}` : ''}
                </p>
              )}
              {apt.notes && <p className="mt-1 text-xs italic text-gray-500">{apt.notes}</p>}
            </div>
            <Badge variant={APPOINTMENT_STATUS_VARIANTS[apt.status]}>
              {APPOINTMENT_STATUS_LABELS[apt.status]}
            </Badge>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="w-full max-w-6xl space-y-5">
      <div className="overflow-hidden rounded-[28px] border border-teal-100 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f7fbfb_100%)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <button
              onClick={() => navigate('/pacientes')}
              className="mt-0.5 rounded-xl border border-white/80 bg-white/80 p-2 text-gray-400 transition hover:bg-white hover:text-gray-600"
              aria-label="Voltar para Pacientes"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0ea5b0]">Ficha do paciente</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 sm:text-[30px]">{patient.name}</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-500">
                {age !== null && <span className="rounded-full bg-white px-3 py-1">{age} anos</span>}
                {patient.sex && <span className="rounded-full bg-white px-3 py-1">{SEX_LABELS[patient.sex]}</span>}
                {patient.birthDate && <span className="rounded-full bg-white px-3 py-1">{formatDate(patient.birthDate + 'T00:00:00')}</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setScheduling(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
            >
              <CalendarPlus size={15} />
              Agendar
            </button>
            <button
              onClick={() => setEditDrawerOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50"
            >
              <PencilSimple size={15} />
              Editar
            </button>
            <Link
              to={`/pacientes/${patient.id}/anamnese`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50"
            >
              <ClipboardText size={15} />
              Anamnese
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 border-t border-white/70 pt-4">
        {patient.phone && (
          <>
            <a
              href={`tel:${patient.phone}`}
              className="inline-flex items-center gap-2 rounded-xl border border-white/90 bg-white px-3 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              <Phone size={15} className="text-green-500" />
              {patient.phone}
            </a>
            <a
              href={(() => { const d = patient.phone.replace(/\D/g, ''); return `https://wa.me/${d.startsWith('55') ? d : '55' + d}` })()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700 transition hover:bg-green-100"
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
            className="inline-flex items-center gap-2 rounded-xl border border-white/90 bg-white px-3 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            <Envelope size={15} className="text-[#0ea5b0]" />
            {patient.email}
          </a>
        )}
      </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map(action => {
            const toneClasses = action.tone === 'teal'
              ? 'border-teal-200 bg-white'
              : action.tone === 'sky'
                ? 'border-sky-200 bg-sky-50/70'
                : action.tone === 'amber'
                  ? 'border-amber-200 bg-amber-50/70'
                  : 'border-gray-200 bg-gray-50/80'

            const buttonClasses = action.tone === 'teal'
              ? 'border-teal-200 bg-teal-50 text-[#006970] hover:bg-teal-100'
              : action.tone === 'sky'
                ? 'border-sky-200 bg-white text-sky-700 hover:bg-sky-100'
                : action.tone === 'amber'
                  ? 'border-amber-200 bg-white text-amber-700 hover:bg-amber-100'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'

            return (
              <button
                key={action.title}
                type="button"
                onClick={action.onClick}
                className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${toneClasses}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Ação rápida</p>
                <h2 className="mt-2 text-base font-semibold text-gray-900">{action.title}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">{action.description}</p>
                <span className={`mt-4 inline-flex min-h-10 items-center rounded-xl border px-3 py-2 text-sm font-medium transition ${buttonClasses}`}>
                  {action.actionLabel}
                </span>
              </button>
            )
          })}
        </div>

      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4 xl:order-2">
          <Section sectionId="patient-appointments-section" title="Consultas" description="Agenda futura e histórico recente do paciente.">
        {loadingApts ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : appointments.length === 0 ? (
          <div className="text-center py-6">
            <CalendarBlank size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhuma consulta registrada.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Próximas consultas</h3>
              {renderAppointmentsList(upcomingAppointments, 'Nenhuma consulta futura agendada.')}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Histórico</h3>
              {renderAppointmentsList(historyAppointments, 'Nenhum atendimento anterior registrado.')}
            </div>
          </div>
        )}
          </Section>

          <Section sectionId="patient-clinical-section" title="Pedidos, Documentos e Próteses" description="Fluxo clínico do paciente e emissão de documentos.">
            <PatientClinicalPanel
              patientId={id!}
              patient={{
                name: patient.name,
                cpf: patient.cpf,
                birthDate: patient.birthDate,
              }}
              clinic={clinic ? {
                name: clinic.name,
                phone: clinic.phone,
                email: clinic.email,
                address: clinic.address,
                city: clinic.city,
                state: clinic.state,
                documentTemplates: clinic.documentTemplates,
                documentSigning: clinic.documentSigning,
              } : null}
            />
          </Section>

          <Section sectionId="patient-records-section" title="Anotações e Exames" description="Notas clínicas, registros rápidos e anexos do prontuário.">
            <PatientRecordsPanel patientId={id!} />
          </Section>

          <Section sectionId="patient-files-section" title="Arquivos e Documentos" description="Uploads finais e documentos vinculados ao paciente.">
            {clinic ? (
              <PatientFilesPanel patientId={id!} clinicId={clinic.id} />
            ) : (
              <p className="text-sm text-gray-400">Carregando...</p>
            )}
          </Section>
        </div>

        <div className="space-y-4 self-start xl:order-1 xl:sticky xl:top-6">
          <Section title="Navegacao Rapida" description="Atalhos para as areas mais usadas durante o atendimento.">
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
              {sidebarActions.map(action => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-100"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Dados Pessoais" description="Identificação básica e dados rápidos para recepção.">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <InfoRow label="CPF" value={patient.cpf} copyable />
              <InfoRow label="RG" value={patient.rg} copyable />
              <InfoRow label="Data de nascimento" value={patient.birthDate ? formatDate(patient.birthDate + 'T00:00:00') : null} />
            </dl>
          </Section>

          {showInsuranceSection && (
            <Section title="Convênio e Cobertura" description="Forma de atendimento e dados do convênio desta ficha.">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-1">
                <InfoRow
                  label="Forma de atendimento"
                  value={insuranceInfo.coverageType ? PATIENT_INSURANCE_TYPE_LABELS[insuranceInfo.coverageType] : null}
                />
                <InfoRow label="Convênio" value={insuranceInfo.provider} />
                <InfoRow label="Plano" value={insuranceInfo.plan} />
              </dl>
            </Section>
          )}

          {(patient.addressStreet || patient.addressCity) && (
            <Section title="Endereço" description="Endereço principal cadastrado para este paciente.">
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <MapPin size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
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

          {patient.notes && (
            <Section title="Observações" description="Contexto livre importante para esta ficha.">
              <p className="text-sm leading-6 text-gray-700 whitespace-pre-wrap">{patient.notes}</p>
            </Section>
          )}

          {visibleCustomFields.length > 0 && (
            <Section title="Campos Personalizados" description="Informações adicionais configuradas pela clínica.">
              <dl className="grid grid-cols-1 gap-4">
                {visibleCustomFields.map(field => {
                  const rawValue = patient.customFields?.[field.key]
                  const formatted = formatCustomFieldValue(field.type, rawValue)
                  const isLongText = field.type === 'textarea' || (typeof formatted === 'string' && formatted.length > 120)

                  return (
                    <div key={field.key}>
                      <dt className="mb-0.5 text-xs text-gray-400">{field.label}</dt>
                      <dd className={`text-sm text-gray-800 ${isLongText ? 'whitespace-pre-wrap leading-6' : ''}`}>{formatted}</dd>
                    </div>
                  )
                })}
              </dl>
            </Section>
          )}
        </div>
      </div>

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
