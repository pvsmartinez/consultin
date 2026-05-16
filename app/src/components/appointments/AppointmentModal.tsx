import { useEffect, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import * as Dialog from '@radix-ui/react-dialog'
import type { FieldErrors } from 'react-hook-form'
import { X, RepeatOnce, Warning, UserPlus, CurrencyCircleDollar, PencilSimple, ClipboardText, IdentificationCard, Package, CheckCircle } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { format, parseISO, addMinutes, addDays, addWeeks, addMonths } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import Input from '../ui/Input'
import TextArea from '../ui/TextArea'
import AppointmentPaymentModal from './AppointmentPaymentModal'
import ProfessionalModal from '../professionals/ProfessionalModal'
import { useProfessionals } from '../../hooks/useProfessionals'
import { usePatientAppointments } from '../../hooks/useAppointments'
import { useAppointmentMutations } from '../../hooks/useAppointmentsMutations'
import { useAppointmentPayments } from '../../hooks/useAppointmentPayments'
import { usePatients, useCreatePatient } from '../../hooks/usePatients'
import { usePatientClinicalItems } from '../../hooks/usePatientClinicalItems'
import { useRooms } from '../../hooks/useRooms'
import { useClinicModules } from '../../hooks/useClinicModules'
import { useDebounce } from '../../hooks/useDebounce'
import { useServiceTypes } from '../../hooks/useServiceTypes'
import { useAppointmentInventoryMovements, useCreateInventoryMovement, useInventoryMaterials } from '../../hooks/useInventory'
import { useAuthContext } from '../../contexts/AuthContext'
import PatientDrawer from '../patients/PatientDrawer'
import ConfirmDialog from '../ui/ConfirmDialog'
import { APP_ROUTES } from '../../lib/appRoutes'
import { getAppointmentSaveErrorMessage } from '../../utils/appointmentErrors'
import { getAppointmentRoomRequirement } from '../../utils/appointmentRoomRequirement'
import {
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
  INVENTORY_MOVEMENT_TYPE_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  type Appointment,
  type AppointmentStatus,
  type ServiceTypeInventorySuggestion,
} from '../../types'

// ─── Schema ──────────────────────────────────────────────────────────────────
const schema = z.object({
  patientId:        z.string().min(1, 'Selecione um paciente'),
  professionalId:   z.string().min(1, 'Selecione um profissional'),
  date:             z.string().min(1, 'Data obrigatória'),
  startTime:        z.string().min(1, 'Horário obrigatório'),
  durationMin:      z.string(),
  status:           z.string(),
  notes:            z.string().optional(),
  roomId:           z.string().optional(),
  serviceTypeId:    z.string().optional(),
  chargeAmount:     z.string().optional(),
  professionalFee:  z.string().optional(),
  recurrenceType:   z.enum(['none', 'daily', 'weekly', 'monthly']),
  recurrenceCount:  z.string(),
})
type FormValues = z.infer<typeof schema>

const FIRST_ERROR_MESSAGE: Record<keyof FormValues, string> = {
  patientId: 'Selecione um paciente',
  professionalId: 'Selecione um profissional',
  date: 'Preencha a data da consulta',
  startTime: 'Preencha o horário da consulta',
  durationMin: 'Defina a duração da consulta',
  status: 'Defina o status da consulta',
  notes: 'Revise as observações da consulta',
  roomId: 'Revise a sala da consulta',
  serviceTypeId: 'Revise o tipo de atendimento',
  chargeAmount: 'Revise o valor cobrado',
  professionalFee: 'Revise o repasse ao profissional',
  recurrenceType: 'Revise a recorrência',
  recurrenceCount: 'Revise a quantidade de recorrências',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function defaultTimeSlot(): string {
  const now = new Date()
  const totalMin = now.getHours() * 60 + now.getMinutes()
  const rounded = Math.ceil(totalMin / 30) * 30
  const h = Math.floor(rounded / 60) % 24
  const m = rounded % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const PRESET_DURATIONS = [15, 20, 30, 45, 60, 90, 120]
const STATUSES = Object.entries(APPOINTMENT_STATUS_LABELS) as [AppointmentStatus, string][]

const RECURRENCE_LABELS: Record<string, string> = {
  none:    'Não repetir',
  daily:   'Diariamente',
  weekly:  'Semanalmente',
  monthly: 'Mensalmente',
}

const RETURN_PRESETS = [
  { label: 'Sem retorno', value: 'none'   },
  { label: '1 semana',   value: '7d'    },
  { label: '2 semanas',  value: '14d'   },
  { label: '1 mês',      value: '30d'   },
  { label: '3 meses',    value: '90d'   },
  { label: 'Personalizado', value: 'custom' },
] as const
type ReturnPreset = typeof RETURN_PRESETS[number]['value']

function toUTC(date: string, time: string): string {
  return fromZonedTime(`${date}T${time}:00`, 'America/Sao_Paulo').toISOString()
}

function addRecurrenceInterval(
  date: Date,
  type: 'daily' | 'weekly' | 'monthly',
  n: number,
): Date {
  if (type === 'daily')  return addDays(date, n)
  if (type === 'weekly') return addWeeks(date, n)
  return addMonths(date, n)
}

function formatMoneyPreview(value?: string): string {
  const normalized = value?.trim()
  return normalized ? `R$ ${normalized}` : 'Não definido'
}

function formatAppointmentPreview(startsAt: string, endsAt: string): string {
  return `${format(parseISO(startsAt), 'dd/MM')} · ${format(parseISO(startsAt), 'HH:mm')}–${format(parseISO(endsAt), 'HH:mm')}`
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function subsequenceScore(query: string, text: string): number {
  let qi = 0
  let score = 0
  for (let i = 0; i < text.length && qi < query.length; i += 1) {
    if (query[qi] === text[i]) {
      score += qi === 0 ? 2 : 1
      qi += 1
    }
  }
  return qi === query.length ? score : 0
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-[#f8fafb] px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-800">{value}</p>
    </div>
  )
}

function ManagementSection({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[26px] border border-gray-200 bg-white p-4 shadow-sm sm:p-4.5">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {description ? <p className="mt-0.5 text-sm text-gray-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean
  onClose: () => void
  appointment?: Appointment | null
  /** Pre-fill date + time when clicking/dragging a slot on the calendar */
  initialDate?: string        // YYYY-MM-DD
  initialTime?: string        // HH:MM
  initialDurationMin?: number // from drag selection
  /** Default professional from calendar column */
  initialProfessionalId?: string
  /** Default room from calendar filter/column */
  initialRoomId?: string
  /** Pre-fill patient (e.g. opened from PatientDetailPage) */
  initialPatientId?: string
  initialPatientName?: string
}

export default function AppointmentModal({
  open, onClose, appointment,
  initialDate, initialTime, initialDurationMin, initialProfessionalId, initialRoomId,
  initialPatientId, initialPatientName,
}: Props) {
  const isEditing = !!appointment
  const navigate = useNavigate()
  const { hasPermission } = useAuthContext()
  const { hasStaff, hasFinancial, hasInventory } = useClinicModules()
  const { data: professionals = [] } = useProfessionals()
  const { create, update, cancel } = useAppointmentMutations()
  const { data: payments = [] } = useAppointmentPayments(appointment?.id)
  const { data: rooms = [] } = useRooms()
  const { data: serviceTypes = [] } = useServiceTypes()
  const { data: inventoryMaterials = [] } = useInventoryMaterials(hasInventory)
  const { data: appointmentInventoryMovements = [] } = useAppointmentInventoryMovements(appointment?.id)
  const createInventoryMovement = useCreateInventoryMovement()
  const createPatient = useCreatePatient()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [roomRequirementDialogOpen, setRoomRequirementDialogOpen] = useState(false)
  const [showExtras, setShowExtras]       = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [returnPreset, setReturnPreset]   = useState<ReturnPreset>('none')
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; name: string } | null>(null)
  const [showQuickPatient, setShowQuickPatient] = useState(false)
  const [showEditFields, setShowEditFields] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickCpf, setQuickCpf] = useState('')
  const [patientDrawerOpen, setPatientDrawerOpen] = useState(false)
  const [patientDrawerPatientId, setPatientDrawerPatientId] = useState<string | undefined>(undefined)
  const debouncedPatientSearch = useDebounce(patientSearch, 300)
  const { patients = [] } = usePatients(debouncedPatientSearch)
  const { patients: allPatients = [] } = usePatients('', 0)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { durationMin: '30', status: 'scheduled', serviceTypeId: '', recurrenceType: 'none', recurrenceCount: '4' },
  })

  const recurrenceType  = watch('recurrenceType')
  const durationMinVal  = watch('durationMin')
  const watchedDate = watch('date')
  const watchedStartTime = watch('startTime')
  const watchedStatus = watch('status') as AppointmentStatus | undefined
  const watchedChargeAmount = watch('chargeAmount')
  const watchedPatientId = watch('patientId')
  const watchedProfessionalId = watch('professionalId')
  const watchedServiceTypeId = watch('serviceTypeId')
  const latestPayment = payments[0] ?? null
  const canManagePayments = isEditing && !!appointment && hasFinancial && hasPermission('canViewFinancial')
  const patientNeedsCpfForCharge = canManagePayments && !appointment?.patient?.cpf
  const canManagePatients = hasPermission('canManagePatients')
  const canManageProfessionals = hasPermission('canManageProfessionals')

  const activeServiceTypes = serviceTypes.filter(s => s.active)
  const activeProfessionals = professionals.filter(p => p.active)
  const activeRooms         = rooms.filter(r => r.active)
  const { hasSelectableRooms, requiresRoomSelection } = getAppointmentRoomRequirement(rooms)
  const selectedServiceType = activeServiceTypes.find(s => s.id === (watch('serviceTypeId') ?? '')) ?? null
  const selectedServiceSuggestions = selectedServiceType?.inventorySuggestions ?? []
  const appointmentSuggestedMaterialIds = new Set(
    appointmentInventoryMovements
      .filter(movement => movement.metadata.source === 'appointment_service_suggestion')
      .map(movement => movement.materialId)
  )
  const currentPatientId = selectedPatient?.id ?? watchedPatientId ?? appointment?.patientId ?? ''
  const { appointments: patientAppointments = [], loading: loadingPatientAppointments } = usePatientAppointments(currentPatientId)
  const { itemsQuery: patientClinicalItemsQuery } = usePatientClinicalItems(currentPatientId)
  const canAutoHideProfessional = !hasStaff && activeProfessionals.length === 1
  const hasActiveProfessional = activeProfessionals.length > 0
  const [professionalModalOpen, setProfessionalModalOpen] = useState(false)
  const currentProfessional = activeProfessionals.find(p => p.id === watchedProfessionalId)
    ?? professionals.find(p => p.id === watchedProfessionalId)
    ?? appointment?.professional
    ?? null
  const currentServiceType = activeServiceTypes.find(service => service.id === watchedServiceTypeId)
    ?? serviceTypes.find(service => service.id === watchedServiceTypeId)
    ?? null
  const previewStartsAt = useMemo(() => {
    if (!watchedDate || !watchedStartTime) return appointment?.startsAt ?? null
    return toUTC(watchedDate, watchedStartTime)
  }, [appointment?.startsAt, watchedDate, watchedStartTime])
  const previewEndsAt = useMemo(() => {
    if (!previewStartsAt) return appointment?.endsAt ?? null
    const duration = Math.max(15, parseInt(durationMinVal || '30') || 30)
    return addMinutes(new Date(previewStartsAt), duration).toISOString()
  }, [appointment?.endsAt, durationMinVal, previewStartsAt])
  const otherPatientAppointments = useMemo(
    () => patientAppointments.filter(item => item.id !== appointment?.id),
    [appointment?.id, patientAppointments],
  )
  const upcomingPatientAppointments = useMemo(
    () => [...otherPatientAppointments]
      .filter(item => new Date(item.startsAt).getTime() >= Date.now() && item.status !== 'cancelled')
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .slice(0, 3),
    [otherPatientAppointments],
  )
  const patientHistoryAppointments = useMemo(
    () => [...otherPatientAppointments]
      .filter(item => new Date(item.startsAt).getTime() < Date.now())
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
      .slice(0, 3),
    [otherPatientAppointments],
  )
  const patientClinicalItems = patientClinicalItemsQuery.data ?? []
  const clinicalDocumentCount = patientClinicalItems.filter(item => item.category === 'document').length
  const clinicalRequestCount = patientClinicalItems.filter(item => item.category === 'request').length
  const latestClinicalItem = patientClinicalItems[0] ?? null
  const patientSearchResults = useMemo(() => {
    const raw = patientSearch.trim()
    if (!raw) return patients.slice(0, 8)

    const query = normalizeText(raw)
    const queryDigits = raw.replace(/\D/g, '')
    const merged = [...patients, ...allPatients]
    const uniquePatients = Array.from(new Map(merged.map(item => [item.id, item])).values())

    return uniquePatients
      .map(patient => {
        const name = normalizeText(patient.name)
        const cpfDigits = (patient.cpf ?? '').replace(/\D/g, '')
        const phoneDigits = (patient.phone ?? '').replace(/\D/g, '')

        let score = 0
        if (name.includes(query)) {
          score += 100 - Math.min(name.indexOf(query), 20)
        } else {
          score += subsequenceScore(query, name)
        }

        if (queryDigits.length >= 3 && (cpfDigits.includes(queryDigits) || phoneDigits.includes(queryDigits))) {
          score += 60
        }

        return { patient, score }
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(item => item.patient)
  }, [allPatients, patientSearch, patients])

  // Build duration options — include any custom value from drag selection or existing appointment
  const durationOptions = useMemo(() => {
    const custom = durationMinVal ? parseInt(durationMinVal) : null
    const extra  = custom && !PRESET_DURATIONS.includes(custom) ? [custom] : []
    return [...new Set([...PRESET_DURATIONS, ...extra])].sort((a, b) => a - b)
  }, [durationMinVal])

  useEffect(() => {
    if (!open) {
      setConfirmCancel(false)
      setRoomRequirementDialogOpen(false)
      setPatientSearch('')
      setSelectedPatient(null)
      setShowQuickPatient(false)
      setQuickName('')
      setQuickCpf('')
      setShowExtras(false)
      setShowEditFields(false)
      return
    }

    if (appointment) {
      const start   = parseISO(appointment.startsAt)
      const end     = parseISO(appointment.endsAt)
      const diffMin = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000))
      reset({
        patientId:       appointment.patientId,
        professionalId:  appointment.professionalId,
        date:            format(start, 'yyyy-MM-dd'),
        startTime:       format(start, 'HH:mm'),
        durationMin:     String(diffMin),
        status:          appointment.status,
        notes:           appointment.notes ?? '',
        roomId:          appointment.roomId ?? '',
        serviceTypeId:   appointment.serviceTypeId ?? '',
        chargeAmount:    appointment.chargeAmountCents != null
                           ? (appointment.chargeAmountCents / 100).toFixed(2).replace('.', ',')
                           : '',
        professionalFee: appointment.professionalFeeCents != null
                           ? (appointment.professionalFeeCents / 100).toFixed(2).replace('.', ',')
                           : '',
        recurrenceType:  'none',
        recurrenceCount: '4',
      })
      setSelectedPatient(appointment.patient
        ? { id: appointment.patientId, name: appointment.patient.name }
        : null)
      // When editing, always show extras so user can see all existing values
      setShowExtras(true)
      setShowEditFields(false)
    } else {
      reset({
        patientId:       initialPatientId ?? '',
        professionalId:  initialProfessionalId ?? '',
        date:            initialDate ?? format(new Date(), 'yyyy-MM-dd'),
        startTime:       initialTime ?? defaultTimeSlot(),
        durationMin:     String(initialDurationMin ?? 30),
        status:          'scheduled',
        notes:           '',
        roomId:          initialRoomId ?? '',
        serviceTypeId:   '',
        chargeAmount:    '',
        professionalFee: '',
        recurrenceType:  'none',
        recurrenceCount: '4',
      })
      if (initialPatientId && initialPatientName) {
        setSelectedPatient({ id: initialPatientId, name: initialPatientName })
      } else if (initialPatientName) {
        setPatientSearch(initialPatientName)
      }
      setShowEditFields(true)
      setShowExtras(true)
    }
    setReturnPreset('none')
  }, [open, appointment, initialDate, initialTime, initialDurationMin, initialProfessionalId, initialRoomId, initialPatientId, initialPatientName, reset])

  // Auto-select room / professional when there is only one active option
  useEffect(() => {
    if (!open) return
    const profs = professionals.filter(p => p.active)
    const rms   = rooms.filter(r => r.active)
    if (profs.length === 1) setValue('professionalId', profs[0].id)
    if (rms.length   === 1) setValue('roomId', rms[0].id)
  }, [open, professionals, rooms, setValue])

  useEffect(() => {
    if (!open || isEditing) return
    if (watchedProfessionalId) return
    const firstProfessional = activeProfessionals[0]
    if (firstProfessional) {
      setValue('professionalId', firstProfessional.id, { shouldValidate: true })
    }
  }, [activeProfessionals, isEditing, open, setValue, watchedProfessionalId])

  async function onSubmit(values: FormValues) {
    try {
      if (requiresRoomSelection && !values.roomId) {
        setShowExtras(true)
        setRoomRequirementDialogOpen(true)
        return
      }

      const durationMin = parseInt(values.durationMin)
      if (!Number.isFinite(durationMin) || durationMin < 15) {
        toast.error('Duração inválida — selecione pelo menos 15 minutos')
        return
      }

      const startsAt    = toUTC(values.date, values.startTime)
      const endsAt      = addMinutes(new Date(startsAt), durationMin).toISOString()
      if (Number.isNaN(new Date(startsAt).getTime()) || Number.isNaN(new Date(endsAt).getTime())) {
        toast.error('Data ou horário inválido — revise os campos da consulta')
        return
      }

      const chargeRaw = values.chargeAmount ? parseFloat(values.chargeAmount.replace(',', '.')) : NaN
      const feeRaw = values.professionalFee ? parseFloat(values.professionalFee.replace(',', '.')) : NaN
      if (values.chargeAmount && isNaN(chargeRaw)) {
        toast.error('Valor cobrado inválido')
        return
      }
      if (values.professionalFee && isNaN(feeRaw)) {
        toast.error('Repasse ao profissional inválido')
        return
      }
      if (values.chargeAmount && chargeRaw < 0) {
        toast.error('Valor cobrado não pode ser negativo')
        return
      }
      if (values.professionalFee && feeRaw < 0) {
        toast.error('Repasse ao profissional não pode ser negativo')
        return
      }
      const chargeAmountCents = values.chargeAmount ? Math.round(chargeRaw * 100) : null
      const professionalFeeCents = values.professionalFee ? Math.round(feeRaw * 100) : null
      let shouldClose = false

      const basePayload = {
        patientId:           values.patientId,
        professionalId:      values.professionalId,
        status:              values.status as AppointmentStatus,
        notes:               values.notes || null,
        roomId:              values.roomId || null,
        serviceTypeId:       values.serviceTypeId || null,
        chargeAmountCents,
        professionalFeeCents,
      }

      if (isEditing) {
        await update.mutateAsync({ id: appointment!.id, ...basePayload, startsAt, endsAt })
        toast.success('Consulta atualizada')
        shouldClose = true
      } else if (returnPreset !== 'none' && returnPreset !== 'custom') {
        // Quick return preset — create original + one follow-up
        const offsetDays  = parseInt(returnPreset)  // '7d' → 7, '14d' → 14 …
        const returnStart = addDays(new Date(startsAt), offsetDays).toISOString()
        const returnEnd   = addMinutes(new Date(returnStart), durationMin).toISOString()
        const quickReturnResults = await Promise.allSettled([
          create.mutateAsync({ ...basePayload, startsAt, endsAt }),
          create.mutateAsync({ ...basePayload, startsAt: returnStart, endsAt: returnEnd }),
        ])
        const quickCreated = quickReturnResults.filter(result => result.status === 'fulfilled').length
        const quickFailed = quickReturnResults.length - quickCreated
        const presetLabel = RETURN_PRESETS.find(p => p.value === returnPreset)?.label ?? ''
        if (quickCreated === quickReturnResults.length) {
          toast.success(`Consulta agendada com retorno em ${presetLabel}`)
          shouldClose = true
        } else if (quickCreated > 0) {
          toast.warning(`Apenas ${quickCreated} de 2 consultas foram agendadas (${quickFailed} falhou). Revise conflitos e tente novamente.`)
          shouldClose = true
        } else {
          toast.error('Não foi possível agendar a consulta com retorno — revise conflitos de agenda e sala')
        }
      } else if (returnPreset === 'custom' && values.recurrenceType !== 'none') {
        // Advanced recurrence
        const count = Math.min(Math.max(parseInt(values.recurrenceCount) || 1, 1), 52)
        const type  = values.recurrenceType
        const creates = Array.from({ length: count }, (_, i) => {
          const s = addRecurrenceInterval(new Date(startsAt), type, i).toISOString()
          const e = addMinutes(new Date(s), durationMin).toISOString()
          return create.mutateAsync({ ...basePayload, startsAt: s, endsAt: e })
        })
        const results = await Promise.allSettled(creates)
        const created = results.filter(r => r.status === 'fulfilled').length
        const failed  = count - created
        if (created === count) {
          toast.success(`${created} de ${count} consultas agendadas`)
          shouldClose = true
        } else if (created > 0) {
          toast.warning(`${created} de ${count} consultas agendadas. ${failed} falharam — verifique conflitos de horário/sala.`)
          shouldClose = true
        } else {
          toast.error('Nenhuma consulta foi agendada — verifique conflitos de horário e sala')
        }
      } else {
        await create.mutateAsync({ ...basePayload, startsAt, endsAt })
        toast.success('Consulta agendada')
        shouldClose = true
      }

      if (shouldClose) {
        onClose()
      }
    } catch (err) {
      toast.error(getAppointmentSaveErrorMessage(err))
    }
  }

  function handleRoomRequirementConfirm() {
    setRoomRequirementDialogOpen(false)

    if (hasSelectableRooms) {
      setShowExtras(true)
      return
    }

    onClose()
    navigate(APP_ROUTES.staff.rooms)
  }

  async function handleQuickPatient() {
    if (!quickName.trim()) { toast.error('Informe o nome do paciente'); return }
    try {
      const created = await createPatient.mutateAsync({ name: quickName.trim(), cpf: quickCpf.trim() || null, phone: null, userId: null, rg: null, birthDate: null, sex: null, email: null, addressStreet: null, addressNumber: null, addressComplement: null, addressNeighborhood: null, addressCity: null, addressState: null, addressZip: null, notes: null, customFields: {} })
      setValue('patientId', created.id)
      setSelectedPatient({ id: created.id, name: created.name })
      setPatientSearch('')
      setShowQuickPatient(false)
      setQuickName(''); setQuickCpf('')
      toast.success('Paciente criado e selecionado')
    } catch {
      toast.error('Erro ao criar paciente')
    }
  }

  async function handleSuggestedInventoryConsumption(suggestion: ServiceTypeInventorySuggestion) {
    if (!appointment || !selectedServiceType) return

    const material = inventoryMaterials.find(item => item.id === suggestion.materialId)
    if (!material) {
      toast.error('Material não encontrado no estoque')
      return
    }

    try {
      await createInventoryMovement.mutateAsync({
        materialId: suggestion.materialId,
        movementType: 'out',
        quantity: suggestion.quantity,
        reason: `Consumo sugerido: ${selectedServiceType.name}`,
        notes: `Baixa vinculada à consulta de ${appointment.patient?.name ?? 'paciente'}`,
        metadata: {
          appointmentId: appointment.id,
          serviceTypeId: selectedServiceType.id,
          source: 'appointment_service_suggestion',
        },
      })
      toast.success('Baixa registrada no estoque')
    } catch (error) {
      const message = error instanceof Error && error.message.includes('inventory_negative_stock')
        ? 'Essa baixa deixaria o estoque negativo.'
        : error instanceof Error
          ? error.message
          : 'Não foi possível registrar a baixa.'
      toast.error(message)
    }
  }

  function openFullPatientCreate() {
    setPatientDrawerPatientId(undefined)
    setPatientDrawerOpen(true)
  }

  function openPatientEdit(patientId: string) {
    setPatientDrawerPatientId(patientId)
    setPatientDrawerOpen(true)
  }

  function openPatientPage(path: 'detail' | 'anamnesis') {
    const patientId = selectedPatient?.id
    if (!patientId) return
    onClose()
    navigate(path === 'detail' ? `/pacientes/${patientId}` : `/pacientes/${patientId}/anamnese`)
  }

  async function handleCancel() {
    if (!appointment) return
    try {
      await cancel.mutateAsync(appointment.id)
      toast.success('Consulta cancelada')
      onClose()
    } catch {
      toast.error('Erro ao cancelar')
    }
  }

  function handleCompleteAppointment() {
    setValue('status', 'completed', { shouldDirty: true, shouldTouch: true })
    void handleSubmit(onSubmit, onInvalid)()
  }

  function onInvalid(errors: FieldErrors<FormValues>) {
    const firstErrorKey = Object.keys(errors)[0] as keyof FormValues | undefined
    if (!firstErrorKey) return
    if (firstErrorKey === 'professionalId') {
      toast.error(hasActiveProfessional ? 'Selecione um profissional para salvar a consulta' : 'Cadastre ou ative um profissional antes de agendar')
      return
    }
    toast.error(FIRST_ERROR_MESSAGE[firstErrorKey] ?? 'Revise os dados obrigatórios da consulta')
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/35 backdrop-blur-[2px] z-40" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-[#fcfdfd] shadow-2xl focus:outline-none data-[state=open]:animate-slide-in-right border-l border-white/60">

          <Dialog.Title className="sr-only">
            {isEditing ? 'Editar consulta' : 'Nova consulta'}
          </Dialog.Title>
          <Dialog.Close asChild>
            <button className="absolute right-3 top-3 z-10 rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 sm:right-4 sm:top-4"><X size={18} /></button>
          </Dialog.Close>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-4">
          <form
            onSubmit={handleSubmit(onSubmit, onInvalid)}
            className={`${isEditing ? 'space-y-3.5' : 'space-y-2.5'} pr-10 sm:pr-12`}
          >

            {isEditing && (
              <>
                <section className="rounded-[28px] border border-gray-200 bg-white p-4 shadow-sm sm:p-4.5">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <h2 className="text-[34px] leading-none font-semibold tracking-tight text-gray-900">Consulta particular</h2>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setShowEditFields(current => !current)}
                          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-[#0ea5b0] hover:text-[#006970]"
                        >
                          {showEditFields ? 'Fechar edição detalhada' : 'Alterar horário'}
                        </button>
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${APPOINTMENT_STATUS_COLORS[watchedStatus ?? appointment?.status ?? 'scheduled']}`}>
                          {APPOINTMENT_STATUS_LABELS[watchedStatus ?? appointment?.status ?? 'scheduled']}
                        </span>
                        {latestPayment && (
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${PAYMENT_STATUS_COLORS[latestPayment.status]}`}>
                            {PAYMENT_STATUS_LABELS[latestPayment.status]}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-[30px] leading-none font-semibold tracking-tight text-gray-900">
                        {selectedPatient?.name ?? appointment?.patient?.name ?? 'Paciente sem nome'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => openPatientPage('detail')}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-[#0ea5b0] hover:text-[#006970]"
                      >
                        Ver mais
                      </button>
                    </div>

                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-gray-600">
                        {currentProfessional?.name ?? 'Profissional não definido'}
                        {currentProfessional?.specialty ? ` · ${currentProfessional.specialty}` : ''}
                      </p>
                      {activeProfessionals.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setShowEditFields(true)}
                          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-[#0ea5b0] hover:text-[#006970]"
                        >
                          Trocar
                        </button>
                      )}
                    </div>

                    <p className="text-sm text-gray-500">Tipo de consulta: {currentServiceType?.name ?? 'Não definido'}</p>

                    <div className="grid gap-2.5 sm:grid-cols-3">
                      <SummaryChip
                        label="Data"
                        value={previewStartsAt ? format(parseISO(previewStartsAt), 'dd/MM/yyyy') : 'Não definida'}
                      />
                      <SummaryChip
                        label="Horário"
                        value={previewStartsAt && previewEndsAt
                          ? `${format(parseISO(previewStartsAt), 'HH:mm')}–${format(parseISO(previewEndsAt), 'HH:mm')}`
                          : 'Não definido'}
                      />
                      <SummaryChip
                        label="Cobrança"
                        value={formatMoneyPreview(watchedChargeAmount)}
                      />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => openPatientPage('detail')}
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-[#006970] transition hover:bg-teal-100"
                      >
                        <IdentificationCard size={14} />
                        Ver prontuário
                      </button>
                      <button
                        type="button"
                        onClick={() => openPatientPage('anamnesis')}
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-[#0ea5b0] hover:text-[#006970]"
                      >
                        <ClipboardText size={14} />
                        Ver anamnese
                      </button>
                    </div>
                  </div>
                </section>

                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                  <ManagementSection
                    title="Histórico do paciente"
                    action={
                      <button
                        type="button"
                        onClick={() => openPatientPage('detail')}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-[#0ea5b0] hover:text-[#006970]"
                      >
                        Ver mais
                      </button>
                    }
                  >
                    {loadingPatientAppointments ? (
                      <p className="text-sm text-gray-400">Carregando histórico...</p>
                    ) : otherPatientAppointments.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-gray-200 bg-[#f8fafb] px-4 py-4 text-sm text-gray-400">
                        Sem outras consultas.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Próximas</p>
                          <div className="space-y-2">
                            {upcomingPatientAppointments.length === 0 ? (
                              <p className="text-sm text-gray-400">Nenhuma além desta.</p>
                            ) : upcomingPatientAppointments.map(item => (
                              <div key={item.id} className="rounded-2xl border border-gray-200 bg-[#f8fafb] px-3 py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">{formatAppointmentPreview(item.startsAt, item.endsAt)}</p>
                                    <p className="mt-1 text-xs text-gray-500">
                                      {item.professional?.name ?? 'Profissional não definido'}
                                    </p>
                                  </div>
                                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${APPOINTMENT_STATUS_COLORS[item.status]}`}>
                                    {APPOINTMENT_STATUS_LABELS[item.status]}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Últimos atendimentos</p>
                          <div className="space-y-2">
                            {patientHistoryAppointments.length === 0 ? (
                              <p className="text-sm text-gray-400">Sem atendimentos anteriores.</p>
                            ) : patientHistoryAppointments.map(item => (
                              <div key={item.id} className="rounded-2xl border border-gray-200 bg-white px-3 py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">{formatAppointmentPreview(item.startsAt, item.endsAt)}</p>
                                    <p className="mt-1 text-xs text-gray-500">
                                      {item.professional?.name ?? 'Profissional não definido'}
                                    </p>
                                  </div>
                                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${APPOINTMENT_STATUS_COLORS[item.status]}`}>
                                    {APPOINTMENT_STATUS_LABELS[item.status]}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </ManagementSection>

                  <ManagementSection
                    title="Emitir documento"
                    action={
                      <button
                        type="button"
                        onClick={() => openPatientPage('detail')}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-[#0ea5b0] hover:text-[#006970]"
                      >
                        Abrir prontuário
                      </button>
                    }
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SummaryChip
                        label="Documentos"
                        value={`${clinicalDocumentCount} emitido${clinicalDocumentCount === 1 ? '' : 's'}`}
                      />
                      <SummaryChip
                        label="Pedidos"
                        value={`${clinicalRequestCount} aberto${clinicalRequestCount === 1 ? '' : 's'}`}
                      />
                    </div>

                    <div className="mt-3 rounded-2xl border border-gray-200 bg-[#f8fafb] px-4 py-3.5">
                      <p className="text-sm font-medium text-gray-800">
                        {latestClinicalItem ? latestClinicalItem.title : 'Nenhum documento emitido ainda'}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {latestClinicalItem
                          ? `${format(parseISO(latestClinicalItem.createdAt), 'dd/MM/yyyy')} · ${latestClinicalItem.createdByName ?? 'equipe'}`
                          : 'Use o prontuário para emitir os documentos.'}
                      </p>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => openPatientPage('detail')}
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-[#006970] transition hover:bg-teal-100"
                      >
                        <ClipboardText size={14} />
                        Pedidos e documentos
                      </button>
                      <button
                        type="button"
                        onClick={() => openPatientPage('anamnesis')}
                        className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-[#0ea5b0] hover:text-[#006970]"
                      >
                        Ver anamnese
                      </button>
                    </div>
                  </ManagementSection>
                </div>
              </>
            )}

            {(!isEditing || showEditFields) && (
              <div className={isEditing ? 'rounded-[28px] border border-gray-200 bg-[#f8fafb] p-4 shadow-sm sm:p-5' : ''}>
                {!isEditing && (
                  <div className="mb-2 rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50/80 to-white p-3">
                    <h2 className="text-lg font-semibold tracking-tight text-gray-900">Marcar consulta</h2>
                    <p className="mt-1 text-xs text-gray-500">Fluxo rapido: paciente, alocacao, atendimento e horario.</p>
                  </div>
                )}
                {isEditing && (
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Editar dados</h3>
                    </div>
                  </div>
                )}

            {/* Patient */}
            <div className={!isEditing ? 'rounded-2xl border border-gray-200 bg-white p-3 shadow-sm' : ''}>
              <label className={`${!isEditing ? 'mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500' : 'mb-1 block text-sm font-medium text-gray-700'}`}>Paciente *</label>

              {/* Hidden field to keep react-hook-form value in sync */}
              <input type="hidden" {...register('patientId')} />

              {selectedPatient ? (
                /* Selected state — show chip with clear button */
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-medium text-[#006970]">{selectedPatient.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatient(null)
                        setValue('patientId', '')
                        setPatientSearch('')
                      }}
                      className="ml-2 text-[#0ea5b0] hover:text-[#006970] shrink-0"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  {isEditing && (
                    <>
                      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-center">
                        <button
                          type="button"
                          onClick={() => openPatientPage('detail')}
                          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-600 transition hover:border-[#0ea5b0] hover:text-[#006970]"
                        >
                          <IdentificationCard size={13} />
                          Abrir ficha
                        </button>
                        <button
                          type="button"
                          onClick={() => openPatientPage('anamnesis')}
                          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-600 transition hover:border-[#0ea5b0] hover:text-[#006970]"
                        >
                          <ClipboardText size={13} />
                          Anamnese
                        </button>
                        {canManagePatients && (
                          <button
                            type="button"
                            onClick={() => openPatientEdit(selectedPatient.id)}
                            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm text-[#006970] transition hover:bg-teal-100"
                          >
                            <PencilSimple size={13} />
                            Editar cadastro
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        Campos extras do cadastro, anamnese e anexos do prontuário continuam vinculados a este paciente.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                /* Search state — text input + suggestion dropdown */
                <div className="relative">
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={e => { setPatientSearch(e.target.value); setShowQuickPatient(false) }}
                    placeholder="Buscar por nome ou CPF..."
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                    autoComplete="off"
                  />
                  {patientSearch.trim() && !showQuickPatient && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {patientSearchResults.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            setSelectedPatient({ id: p.id, name: p.name })
                            setValue('patientId', p.id)
                            setPatientSearch('')
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-teal-50 border-b border-gray-100 last:border-0 flex items-baseline gap-2 transition-colors"
                        >
                          <span className="font-medium text-gray-800">{p.name}</span>
                          {p.cpf && <span className="text-xs text-gray-400">{p.cpf}</span>}
                        </button>
                      ))}
                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setShowQuickPatient(true); setQuickName(patientSearch) }}
                        className="w-full text-left px-3 py-2.5 text-sm text-[#006970] hover:bg-teal-50 flex items-center gap-1.5 border-t border-gray-100 transition-colors"
                      >
                        <UserPlus size={14} />
                        {patientSearchResults.length === 0 ? `Criar paciente "${patientSearch}"` : 'Criar novo paciente'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Quick-create form */}
              {showQuickPatient && (
                <div className="mt-2 p-3 bg-teal-50 border border-teal-200 rounded-2xl space-y-2">
                  <p className="text-xs font-medium text-[#006970]">Cadastro rápido de paciente</p>
                  <input
                    type="text"
                    value={quickName}
                    onChange={e => setQuickName(e.target.value)}
                    placeholder="Nome *"
                    className="w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                  />
                  <input
                    type="text"
                    value={quickCpf}
                    onChange={e => setQuickCpf(e.target.value)}
                    placeholder="CPF (opcional)"
                    className="w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={handleQuickPatient} disabled={createPatient.isPending}
                      className="min-h-11 flex-1 rounded-xl py-2.5 text-sm text-white transition-all active:scale-[0.99] disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
                      {createPatient.isPending ? 'Criando...' : 'Criar e selecionar'}
                    </button>
                    <button
                      type="button"
                      onClick={openFullPatientCreate}
                      className="min-h-11 rounded-xl border border-teal-200 px-3 py-2.5 text-sm text-[#006970] transition hover:bg-white"
                    >
                      Cadastro completo
                    </button>
                    <button type="button" onClick={() => setShowQuickPatient(false)}
                      className="min-h-11 rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700">
                      Cancelar
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Use o cadastro completo quando precisar preencher campos personalizados, endereço, vínculo com portal ou dados clínicos extras.
                  </p>
                </div>
              )}

              {errors.patientId && <p className="text-xs text-red-500 mt-1">{errors.patientId.message}</p>}
            </div>

            {/* Professional — compact in create mode, full controls in editing */}
            {isEditing ? (canAutoHideProfessional ? (
              <input type="hidden" {...register('professionalId')} />
            ) : activeProfessionals.length === 1 ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Profissional</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input type="hidden" {...register('professionalId')} />
                  <p className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
                    {activeProfessionals[0].name}
                    {activeProfessionals[0].specialty ? ` — ${activeProfessionals[0].specialty}` : ''}
                  </p>
                  {isEditing && canManageProfessionals && (
                    <button
                      type="button"
                      onClick={() => setProfessionalModalOpen(true)}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm text-[#006970] transition hover:bg-teal-100 sm:w-auto"
                    >
                      Novo profissional
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Profissional *</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <select
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                    {...register('professionalId')}
                  >
                    <option value="">Selecione o profissional...</option>
                    {activeProfessionals.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.specialty ? ` — ${p.specialty}` : ''}
                      </option>
                    ))}
                  </select>
                  {isEditing && canManageProfessionals && (
                    <button
                      type="button"
                      onClick={() => setProfessionalModalOpen(true)}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm text-[#006970] transition hover:bg-teal-100 sm:w-auto sm:shrink-0"
                    >
                      Novo profissional
                    </button>
                  )}
                </div>
                {errors.professionalId && <p className="text-xs text-red-500 mt-1">{errors.professionalId.message}</p>}
              </div>
            )) : (
              <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Alocacao</p>
                <div className={`grid gap-3 ${activeRooms.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Profissional</label>
                  {canAutoHideProfessional || activeProfessionals.length === 1 ? (
                    <div className="flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <input type="hidden" {...register('professionalId')} />
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-[#006970]">
                        {(activeProfessionals[0]?.name ?? 'P').trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate text-sm font-medium text-gray-700">
                        {activeProfessionals[0]?.name ?? 'Sem profissional ativo'}
                      </span>
                    </div>
                  ) : (
                    <select
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                      {...register('professionalId')}
                    >
                      <option value="">Selecionar profissional</option>
                      {activeProfessionals.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.specialty ? ` — ${p.specialty}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.professionalId && <p className="mt-1 text-xs text-red-500">{errors.professionalId.message}</p>}
                </div>

                {activeRooms.length > 1 && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                      Sala / consultório{requiresRoomSelection ? ' *' : ''}
                    </label>
                    <select
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                      {...register('roomId')}
                    >
                      <option value="">{requiresRoomSelection ? 'Selecione uma sala' : 'Sem sala definida'}</option>
                      {activeRooms.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                </div>
              </div>
            )}

            {!hasActiveProfessional && (
              <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm text-[#006970] space-y-3">
                <p>Você ainda não tem profissional ativo para esta agenda.</p>
                {canManageProfessionals ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setProfessionalModalOpen(true)}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-medium text-[#006970] transition hover:bg-teal-100"
                    >
                      Cadastrar profissional agora
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-[#006970]/80">Peça para um administrador cadastrar ou ativar um profissional para continuar.</p>
                )}
              </div>
            )}

            {/* Service type — optional, auto-fills duration + price when creating */}
            {activeServiceTypes.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Atendimento</p>
                <div className="space-y-2">
                  <select
                    value={watch('serviceTypeId') ?? ''}
                    onChange={e => {
                      setValue('serviceTypeId', e.target.value || '')
                      if (!isEditing) {
                        const st = activeServiceTypes.find(s => s.id === e.target.value)
                        if (st) {
                          setValue('durationMin', String(st.durationMinutes))
                          if (st.priceCents != null) {
                            setValue('chargeAmount', (st.priceCents / 100).toFixed(2).replace('.', ','))
                          }
                        }
                      }
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                  >
                    <option value="">Selecionar serviço... (opcional)</option>
                    {activeServiceTypes.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.durationMinutes}min{s.priceCents != null ? ` · R$${(s.priceCents / 100).toFixed(2).replace('.', ',')}` : ''}
                      </option>
                    ))}
                  </select>
                  {!isEditing && (
                    <div className="grid gap-2 md:grid-cols-[1fr_150px_150px]">
                      <TextArea label="" rows={2} placeholder="Observação rápida do atendimento" {...register('notes')} />
                      <div>
                        <Input label="Valor (R$)" placeholder="0,00" {...register('chargeAmount')} />
                        {!!selectedServiceType?.priceCents && (
                          <button
                            type="button"
                            onClick={() => setValue('chargeAmount', (selectedServiceType.priceCents! / 100).toFixed(2).replace('.', ','))}
                            className="mt-1 text-xs font-medium text-[#0ea5b0] hover:text-[#006970]"
                          >
                            Usar preço padrão ({(selectedServiceType.priceCents / 100).toFixed(2).replace('.', ',')})
                          </button>
                        )}
                      </div>
                      <div>
                        <Input label="Repasse (R$)" placeholder="0,00" {...register('professionalFee')} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {hasInventory && selectedServiceSuggestions.length > 0 && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-xl bg-white p-2 text-sky-700">
                    <Package size={16} weight="fill" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-sky-900">Consumo sugerido para este atendimento</p>
                    <p className="text-xs text-sky-800/80 mt-0.5">
                      {isEditing
                        ? 'Você pode registrar a baixa sugerida direto nesta consulta.'
                        : 'Depois de salvar a consulta, a tela oferece a baixa sugerida com um clique.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {selectedServiceSuggestions.map(suggestion => {
                    const material = inventoryMaterials.find(item => item.id === suggestion.materialId)
                    const alreadyApplied = appointmentSuggestedMaterialIds.has(suggestion.materialId)
                    const insufficientStock = material ? material.currentQuantity < suggestion.quantity : false

                    return (
                      <div key={suggestion.materialId} className="flex flex-col gap-3 rounded-xl border border-sky-100 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{material?.name ?? 'Material não encontrado'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Sugerido: {suggestion.quantity} {material?.unit ?? 'un'}
                            {material ? ` · saldo atual ${material.currentQuantity} ${material.unit}` : ''}
                          </p>
                        </div>

                        {isEditing ? (
                          alreadyApplied ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              <CheckCircle size={12} weight="fill" />
                              Baixa lançada
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={!material || insufficientStock || createInventoryMovement.isPending}
                              onClick={() => handleSuggestedInventoryConsumption(suggestion)}
                              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-100 px-3 py-2 text-sm font-medium text-sky-900 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {insufficientStock ? 'Saldo insuficiente' : `Dar baixa (${INVENTORY_MOVEMENT_TYPE_LABELS.out})`}
                            </button>
                          )
                        ) : (
                          <span className="text-xs font-medium text-sky-700">Disponível após salvar</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Horário / duração</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                <Input label="Data *" type="date" error={errors.date?.message} {...register('date')} />
                <Input label="Horário *" type="time" error={errors.startTime?.message} {...register('startTime')} />
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duração</label>
                  <select
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                    {...register('durationMin')}
                  >
                    {durationOptions.map(d => (
                      <option key={d} value={d}>{d} min</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Sala — visible in create mode outside of extras */}
            {/* ── Mais opções toggle (editing only) ─────────────────────────── */}
            {isEditing && (
              <button
                type="button"
                onClick={() => setShowExtras(v => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#0ea5b0] transition-colors py-0.5"
              >
                <span className={`transition-transform ${showExtras ? 'rotate-90' : ''}`}>▶</span>
                {showExtras ? 'Menos opções' : 'Mais opções'}
                {!showExtras && (
                  <span className="text-gray-400">(sala, status, valor, observações)</span>
                )}
              </button>
            )}

            {/* ── Extras collapsible ─────────────────────────────────────────── */}
            {(isEditing ? showExtras : true) && (
              <div className="space-y-4">
                {isEditing && (
                  <div className={`grid gap-3 ${activeRooms.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {activeRooms.length > 1 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Sala / consultório{requiresRoomSelection ? ' *' : ''}
                        </label>
                        <select
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
                          {...register('roomId')}
                        >
                          <option value="">{requiresRoomSelection ? 'Selecione uma sala' : 'Sem sala definida'}</option>
                          {activeRooms.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                        {...register('status')}
                      >
                        {STATUSES.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {!isEditing && (
                  <div className="rounded-2xl border border-gray-200 bg-[#f8fafb] p-3 space-y-2 shadow-sm">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <RepeatOnce size={14} className="text-gray-400" />
                      Retorno / recorrência
                    </label>
                    <select
                      value={returnPreset}
                      onChange={e => setReturnPreset(e.target.value as ReturnPreset)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                    >
                      {RETURN_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>

                    {returnPreset === 'custom' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Frequência</label>
                          <select
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                            {...register('recurrenceType')}
                          >
                            {Object.entries(RECURRENCE_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                        </div>
                        {recurrenceType !== 'none' && (
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">Ocorrências</label>
                            <input
                              type="number"
                              min={2}
                              max={52}
                              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                              {...register('recurrenceCount')}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!isEditing && canManagePayments && appointment && (
              <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                      <CurrencyCircleDollar size={15} className="text-[#0ea5b0]" />
                      Pagamento da consulta
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {latestPayment
                        ? 'A cobrança desta consulta já foi iniciada e pode ser acompanhada aqui.'
                        : 'Abra a cobrança sem sair da consulta para reduzir troca de tela com o Financeiro.'}
                    </p>
                  </div>
                  {latestPayment && (
                    <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${PAYMENT_STATUS_COLORS[latestPayment.status]}`}>
                      {PAYMENT_STATUS_LABELS[latestPayment.status]}
                    </span>
                  )}
                </div>

                {patientNeedsCpfForCharge && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    <Warning size={14} className="shrink-0 mt-0.5" />
                    <span>
                      O paciente ainda não tem CPF cadastrado. A cobrança via Asaas só poderá ser gerada depois de completar esse dado no cadastro.
                    </span>
                  </div>
                )}

                <div className="flex flex-col gap-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {latestPayment
                      ? 'Você pode atualizar o status, ver o QR PIX ou seguir com o repasse ao profissional.'
                      : 'Use este atalho quando quiser cobrar logo após agendar ou editar a consulta.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaymentModalOpen(true)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-white transition-all active:scale-[0.99]"
                    style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
                  >
                    <CurrencyCircleDollar size={14} />
                    {latestPayment ? 'Abrir cobrança' : 'Cobrar consulta'}
                  </button>
                </div>
              </div>
            )}

              </div>
            )}

            {isEditing && (
              <>
                <ManagementSection
                  title="Observações"
                  description="Resumo do atendimento, combinados e qualquer detalhe que a equipe precise ver no dia."
                >
                  <TextArea label="" rows={5} {...register('notes')} />
                </ManagementSection>

                <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                  <ManagementSection
                    title="Valor cobrado"
                    description="Valor combinado com o paciente para esta consulta."
                  >
                    <Input
                      label=""
                      placeholder="0,00"
                      {...register('chargeAmount')}
                    />
                  </ManagementSection>

                  <ManagementSection
                    title="Repasse ao profissional"
                    description="Valor líquido previsto para quem realizou o atendimento."
                  >
                    <Input
                      label=""
                      placeholder="0,00"
                      {...register('professionalFee')}
                    />
                  </ManagementSection>
                </div>

                {canManagePayments && appointment && (
                  <ManagementSection
                    title="Pagamento da consulta"
                    description={latestPayment
                      ? 'Acompanhe a cobrança já iniciada ou reabra o fluxo sem sair da agenda.'
                      : 'Inicie a cobrança do atendimento sem alternar para o Financeiro.'}
                    action={latestPayment ? (
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${PAYMENT_STATUS_COLORS[latestPayment.status]}`}>
                        {PAYMENT_STATUS_LABELS[latestPayment.status]}
                      </span>
                    ) : undefined}
                  >
                    {patientNeedsCpfForCharge && (
                      <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
                        <Warning size={14} className="mt-0.5 shrink-0" />
                        <span>
                          O paciente ainda não tem CPF cadastrado. A cobrança via Asaas só poderá ser gerada depois de completar esse dado no cadastro.
                        </span>
                      </div>
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {latestPayment ? 'Cobrança em andamento' : 'Nenhuma cobrança criada ainda'}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          {latestPayment
                            ? 'Você pode consultar QR PIX, status e repasse a partir do mesmo fluxo.'
                            : 'Abra a cobrança assim que o atendimento terminar ou quando quiser receber na hora.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPaymentModalOpen(true)}
                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-all active:scale-[0.99]"
                        style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
                      >
                        <CurrencyCircleDollar size={14} />
                        {latestPayment ? 'Abrir cobrança' : 'Cobrar consulta'}
                      </button>
                    </div>
                  </ManagementSection>
                )}
              </>
            )}

            {/* Actions */}
            {isEditing ? (
              <div className="mt-2 border-t border-gray-100 pt-4 pb-2">
                {confirmCancel ? (
                  <div className="flex flex-col gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-medium text-red-700">Confirmar cancelamento da consulta?</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmCancel(false)}
                        className="min-h-10 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50">
                        Não
                      </button>
                      <button type="button" onClick={handleCancel}
                        className="min-h-10 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700">
                        Confirmar cancelamento
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setConfirmCancel(true)}
                      className="min-h-11 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-500 transition hover:border-red-300 hover:bg-red-50">
                      Cancelar consulta
                    </button>
                    <div className="flex items-center gap-2">
                      {(watchedStatus ?? appointment?.status) !== 'completed' && (
                        <button type="submit" disabled={isSubmitting || !hasActiveProfessional}
                          className="min-h-11 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-[#0ea5b0] hover:text-[#006970] disabled:opacity-50">
                          {isSubmitting ? 'Salvando...' : 'Salvar'}
                        </button>
                      )}
                      {(watchedStatus ?? appointment?.status) !== 'completed' ? (
                        <button type="button" onClick={handleCompleteAppointment} disabled={isSubmitting || !hasActiveProfessional}
                          className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-all active:scale-[0.99] disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
                          {isSubmitting ? 'Finalizando...' : 'Finalizar'}
                        </button>
                      ) : (
                        <button type="submit" disabled={isSubmitting || !hasActiveProfessional}
                          className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-all active:scale-[0.99] disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
                          {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 border-t border-gray-100 pt-6 pb-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !hasActiveProfessional}
                  className="min-h-12 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_-16px_rgba(14,165,176,0.9)] transition-all active:scale-[0.99] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
                >
                  {isSubmitting ? 'Finalizando...' : 'Finalizar'}
                </button>
              </div>
            )}
          </form>

          </div>{/* end scrollable body */}
        </Dialog.Content>
      </Dialog.Portal>
      {paymentModalOpen && appointment && (
        <AppointmentPaymentModal
          appointment={appointment}
          existingPayment={latestPayment}
          onClose={() => setPaymentModalOpen(false)}
        />
      )}
      <PatientDrawer
        open={patientDrawerOpen}
        patientId={patientDrawerPatientId}
        initialValues={{
          name: quickName.trim() || patientSearch.trim() || '',
          cpf: quickCpf.trim() || null,
          customFields: {},
        }}
        stacked
        onClose={() => setPatientDrawerOpen(false)}
        onSaved={({ id, name }) => {
          setPatientDrawerOpen(false)
          setSelectedPatient({ id, name })
          setValue('patientId', id)
          setPatientSearch('')
          setShowQuickPatient(false)
          setQuickName('')
          setQuickCpf('')
        }}
      />
      <ProfessionalModal
        open={professionalModalOpen}
        onClose={() => setProfessionalModalOpen(false)}
        onSaved={professional => {
          setProfessionalModalOpen(false)
          setValue('professionalId', professional.id, { shouldValidate: true, shouldDirty: true })
        }}
      />
      <ConfirmDialog
        open={roomRequirementDialogOpen}
        title={hasSelectableRooms ? 'Selecione uma sala antes de salvar' : 'Ative uma sala para continuar'}
        description={hasSelectableRooms
          ? 'Esta clínica já possui salas cadastradas. Escolha a sala da consulta para concluir o agendamento.'
          : 'Esta clínica já possui salas cadastradas, mas nenhuma está ativa. Ative uma sala para vincular a consulta.'}
        confirmLabel={hasSelectableRooms ? 'Escolher sala' : 'Gerenciar salas'}
        cancelLabel="Agora não"
        onConfirm={handleRoomRequirementConfirm}
        onCancel={() => setRoomRequirementDialogOpen(false)}
      />
    </Dialog.Root>
  )
}
