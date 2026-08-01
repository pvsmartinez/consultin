import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  PencilSimple,
  CalendarBlank,
  CalendarPlus,
  Phone,
  Envelope,
  ClipboardText,
  WhatsappLogo,
  Copy,
} from '@phosphor-icons/react'
import { Badge } from '@pvsmartinez/shared/ui'
import { toast } from 'sonner'
import PatientDrawer from '../components/patients/PatientDrawer'
import PatientRecordsPanel from '../components/patients/PatientRecordsPanel'
import PatientFilesPanel from '../components/patients/PatientFilesPanel'
import PatientClinicalPanel from '../components/patients/PatientClinicalPanel'
import AppointmentModal from '../components/appointments/AppointmentModal'
import { usePatient } from '../hooks/usePatients'
import { usePatientAppointments } from '../hooks/useAppointments'
import { useClinic } from '../hooks/useClinic'
import { formatDate, formatDateTime } from '../utils/date'
import {
  SEX_LABELS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANTS,
} from '../types'
import {
  getPatientInsuranceInfo,
  hasPatientInsuranceInfo,
  PATIENT_INSURANCE_TYPE_LABELS,
} from '../utils/patientInsurance'

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

function getPatientInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

function InfoRow({
  label,
  value,
  copyable,
}: {
  label: string
  value: string | null | undefined
  copyable?: boolean
}) {
  function copy() {
    if (!value) return
    navigator.clipboard.writeText(value)
    toast.success(`${label} copiado!`)
  }

  return (
    <div>
      <dt className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800">
        {copyable && value ? (
          <button
            type="button"
            onClick={copy}
            className="group inline-flex items-center gap-1.5 rounded-md text-left transition hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]/20"
          >
            <span>{value}</span>
            <Copy
              size={12}
              className="flex-shrink-0 text-gray-300 transition-colors group-hover:text-gray-500"
            />
          </button>
        ) : (
          value || '—'
        )}
      </dd>
    </div>
  )
}

function DataBlock({
  title,
  children,
  className = '',
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-gray-100 bg-gray-50/80 p-4 ${className}`.trim()}>
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Section({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-[28px] border border-gray-200 bg-white p-5 sm:p-6 ${className}`.trim()}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">{title}</h2>
          {description ? <p className="text-sm text-gray-400">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
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
    return <div className="mt-20 text-center text-sm text-gray-400">Carregando...</div>
  }

  if (!patient) {
    return (
      <div className="mt-20 text-center">
        <p className="mb-4 text-gray-500">Paciente não encontrado.</p>
        <button
          onClick={() => navigate('/pacientes')}
          className="text-sm text-[#006970] hover:underline"
        >
          Voltar para Pacientes
        </button>
      </div>
    )
  }

  const age = patient.birthDate
    ? Math.floor(
        (Date.now() - new Date(`${patient.birthDate}T00:00:00`).getTime())
          / (1000 * 60 * 60 * 24 * 365.25),
      )
    : null
  const insuranceInfo = getPatientInsuranceInfo(patient.customFields)
  const showInsuranceSection =
    (clinic?.modulesEnabled?.includes('insurance') ?? false) || hasPatientInsuranceInfo(patient.customFields)
  const visibleCustomFields = (clinic?.customPatientFields ?? []).filter(field =>
    hasCustomFieldValue(patient.customFields?.[field.key]),
  )
  const now = Date.now()
  const upcomingAppointments = appointments
    .filter(
      appointment =>
        (appointment.status === 'scheduled' || appointment.status === 'confirmed')
        && new Date(appointment.startsAt).getTime() >= now,
    )
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  const historyAppointments = appointments
    .filter(appointment => !upcomingAppointments.some(upcoming => upcoming.id === appointment.id))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
  const nextAppointment = upcomingAppointments[0] ?? null
  const contactLine = [patient.phone, patient.email].filter(Boolean).join(' • ')
  const addressLine = [
    patient.addressStreet && `${patient.addressStreet}${patient.addressNumber ? `, ${patient.addressNumber}` : ''}`,
    patient.addressComplement,
    patient.addressNeighborhood,
    patient.addressCity && `${patient.addressCity}${patient.addressState ? ` - ${patient.addressState}` : ''}`,
    patient.addressZip,
  ]
    .filter(Boolean)
    .join(' • ')
  const headerBadges = [
    age !== null ? `${age} anos` : null,
    patient.sex ? SEX_LABELS[patient.sex] : null,
    patient.birthDate ? formatDate(`${patient.birthDate}T00:00:00`) : null,
  ].filter(Boolean)
  const whatsappHref = patient.phone
    ? (() => {
        const digits = patient.phone.replace(/\D/g, '')
        return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`
      })()
    : null

  function renderAppointmentsList(
    list: typeof appointments,
    emptyMessage: string,
    options?: { limit?: number },
  ) {
    const visibleAppointments = options?.limit ? list.slice(0, options.limit) : list

    if (visibleAppointments.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 py-6 text-center">
          <CalendarBlank size={28} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm text-gray-400">{emptyMessage}</p>
        </div>
      )
    }

    return (
      <ul className="space-y-3">
        {visibleAppointments.map(appointment => (
          <li
            key={appointment.id}
            className="flex items-start justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">
                {formatDateTime(appointment.startsAt)}
              </p>
              {appointment.professional ? (
                <p className="mt-0.5 text-xs text-gray-400">
                  {appointment.professional.name}
                  {appointment.professional.specialty
                    ? ` · ${appointment.professional.specialty}`
                    : ''}
                </p>
              ) : null}
              {appointment.notes ? (
                <p className="mt-1 text-xs italic text-gray-500">{appointment.notes}</p>
              ) : null}
            </div>
            <Badge variant={APPOINTMENT_STATUS_VARIANTS[appointment.status]}>
              {APPOINTMENT_STATUS_LABELS[appointment.status]}
            </Badge>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="w-full max-w-6xl space-y-5">
      <div className="rounded-[32px] border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <button
              onClick={() => navigate('/pacientes')}
              className="mt-1 rounded-xl border border-gray-200 bg-white p-2 text-gray-400 transition hover:border-gray-300 hover:text-gray-600"
              aria-label="Voltar para Pacientes"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gray-900 text-2xl font-semibold text-white sm:h-24 sm:w-24">
                {getPatientInitials(patient.name)}
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0ea5b0]">
                  Ficha do paciente
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 sm:text-[30px]">
                  {patient.name}
                </h1>
                <p className="mt-2 text-sm text-gray-500">
                  {contactLine || 'Telefone e e-mail não cadastrados'}
                </p>

                {headerBadges.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {headerBadges.map(item => (
                      <span
                        key={item}
                        className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-600"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-gray-600">
                    {nextAppointment
                      ? `Próxima consulta em ${formatDateTime(nextAppointment.startsAt)}`
                      : 'Sem próxima consulta agendada'}
                  </p>
                  <button
                    onClick={() => setScheduling(true)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-sm text-white transition-all active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
                  >
                    <CalendarPlus size={15} />
                    Agendar
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 xl:max-w-[320px] xl:justify-end">
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 transition hover:bg-green-100"
              >
                <WhatsappLogo size={16} weight="fill" />
                WhatsApp
              </a>
            ) : null}

            <Link
              to={`/pacientes/${patient.id}/anamnese`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <ClipboardText size={16} />
              Anamnese
            </Link>

            <button
              onClick={() => setEditDrawerOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <PencilSimple size={16} />
              Editar
            </button>

            {patient.phone ? (
              <a
                href={`tel:${patient.phone}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <Phone size={16} className="text-green-500" />
                Ligar
              </a>
            ) : null}

            {patient.email ? (
              <a
                href={`mailto:${patient.email}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <Envelope size={16} className="text-[#0ea5b0]" />
                E-mail
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <Section
        title="Dados"
        description="Cadastro principal e contexto rápido da ficha."
        action={
          <button
            type="button"
            onClick={() => setEditDrawerOpen(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <PencilSimple size={15} />
            Editar
          </button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <DataBlock title="Identificação">
            <dl className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="CPF" value={patient.cpf} copyable />
              <InfoRow label="RG" value={patient.rg} copyable />
              <InfoRow
                label="Nascimento"
                value={patient.birthDate ? formatDate(`${patient.birthDate}T00:00:00`) : null}
              />
              <InfoRow label="Sexo" value={patient.sex ? SEX_LABELS[patient.sex] : null} />
            </dl>
          </DataBlock>

          <DataBlock title="Contato">
            <dl className="grid gap-4">
              <InfoRow label="Telefone" value={patient.phone} copyable />
              <InfoRow label="E-mail" value={patient.email} copyable />
            </dl>
          </DataBlock>

          {showInsuranceSection ? (
            <DataBlock title="Convênio">
              <dl className="grid gap-4">
                <InfoRow
                  label="Cobertura"
                  value={
                    insuranceInfo.coverageType
                      ? PATIENT_INSURANCE_TYPE_LABELS[insuranceInfo.coverageType]
                      : null
                  }
                />
                <InfoRow label="Convênio" value={insuranceInfo.provider} />
                <InfoRow label="Plano" value={insuranceInfo.plan} />
              </dl>
            </DataBlock>
          ) : null}

          {addressLine ? (
            <DataBlock title="Endereço" className="xl:col-span-2">
              <p className="text-sm leading-6 text-gray-700">{addressLine}</p>
            </DataBlock>
          ) : null}

          {patient.notes ? (
            <DataBlock title="Observações" className={visibleCustomFields.length > 0 ? 'xl:col-span-2' : ''}>
              <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{patient.notes}</p>
            </DataBlock>
          ) : null}

          {visibleCustomFields.length > 0 ? (
            <DataBlock title="Campos personalizados" className="xl:col-span-2">
              <dl className="grid gap-4 sm:grid-cols-2">
                {visibleCustomFields.map(field => {
                  const rawValue = patient.customFields?.[field.key]
                  const formatted = formatCustomFieldValue(field.type, rawValue)
                  const isLongText =
                    field.type === 'textarea'
                    || (typeof formatted === 'string' && formatted.length > 120)

                  return (
                    <div key={field.key}>
                      <dt className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                        {field.label}
                      </dt>
                      <dd
                        className={`text-sm text-gray-800 ${isLongText ? 'whitespace-pre-wrap leading-6' : ''}`}
                      >
                        {formatted}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </DataBlock>
          ) : null}
        </div>
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section
          title="Historico"
          description="Agenda futura e atendimentos anteriores."
        >
          {loadingApts ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : appointments.length === 0 ? (
            <div className="py-6 text-center">
              <CalendarBlank size={32} className="mx-auto mb-2 text-gray-200" />
              <p className="text-sm text-gray-400">Nenhuma consulta registrada.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700">Próximas consultas</h3>
                {renderAppointmentsList(
                  upcomingAppointments,
                  'Nenhuma consulta futura agendada.',
                  { limit: 2 },
                )}
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700">Histórico</h3>
                {renderAppointmentsList(
                  historyAppointments,
                  'Nenhum atendimento anterior registrado.',
                  { limit: 4 },
                )}
              </div>
            </div>
          )}
        </Section>

        <Section
          title="Arquivos e exames"
          description="Prontuário rápido e anexos centralizados na mesma área."
        >
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Prontuário</h3>
              <PatientRecordsPanel patientId={id!} />
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Arquivos</h3>
              {clinic ? (
                <PatientFilesPanel patientId={id!} clinicId={clinic.id} />
              ) : (
                <p className="text-sm text-gray-400">Carregando...</p>
              )}
            </div>
          </div>
        </Section>
      </div>

      <Section
        title="Emitir documento"
        description="Pedidos, documentos e próteses com acesso direto para a equipe."
        action={
          <Link
            to={`/pacientes/${patient.id}/anamnese`}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <ClipboardText size={15} />
            Ver anamnese
          </Link>
        }
      >
        <PatientClinicalPanel
          patientId={id!}
          patient={{
            name: patient.name,
            cpf: patient.cpf,
            birthDate: patient.birthDate,
            addressStreet: patient.addressStreet,
            addressNumber: patient.addressNumber,
            addressNeighborhood: patient.addressNeighborhood,
            addressCity: patient.addressCity,
            addressState: patient.addressState,
            addressZip: patient.addressZip,
          }}
          clinic={
            clinic
              ? {
                  name: clinic.name,
                  phone: clinic.phone,
                  email: clinic.email,
                  address: clinic.address,
                  city: clinic.city,
                  state: clinic.state,
                  documentTemplates: clinic.documentTemplates,
                  documentSigning: clinic.documentSigning,
                }
              : null
          }
        />
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
