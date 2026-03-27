import { useEffect, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Trash, RepeatOnce, Warning, UserPlus, CurrencyCircleDollar } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { format, parseISO, addMinutes, addDays, addWeeks, addMonths } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import Input from '../ui/Input'
import TextArea from '../ui/TextArea'
import AppointmentPaymentModal from './AppointmentPaymentModal'
import { useProfessionals } from '../../hooks/useProfessionals'
import { useAppointmentMutations } from '../../hooks/useAppointmentsMutations'
import { useAppointmentPayments } from '../../hooks/useAppointmentPayments'
import { usePatients, useCreatePatient } from '../../hooks/usePatients'
import { useClinic } from '../../hooks/useClinic'
import { useRooms } from '../../hooks/useRooms'
import { useDebounce } from '../../hooks/useDebounce'
import { useServiceTypes } from '../../hooks/useServiceTypes'
import { useAuthContext } from '../../contexts/AuthContext'
import {
  APPOINTMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  type Appointment,
  type AppointmentStatus,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
  { label: 'Avançado',   value: 'custom' },
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
  /** Pre-fill patient (e.g. opened from PatientDetailPage) */
  initialPatientId?: string
  initialPatientName?: string
}

export default function AppointmentModal({
  open, onClose, appointment,
  initialDate, initialTime, initialDurationMin, initialProfessionalId,
  initialPatientId, initialPatientName,
}: Props) {
  const isEditing = !!appointment
  const { hasPermission } = useAuthContext()
  const { data: clinic } = useClinic()
  const { data: professionals = [] } = useProfessionals()
  const { create, update, cancel } = useAppointmentMutations()
  const { data: payments = [] } = useAppointmentPayments(appointment?.id)
  const { data: rooms = [] } = useRooms()
  const { data: serviceTypes = [] } = useServiceTypes()
  const createPatient = useCreatePatient()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [showExtras, setShowExtras]       = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [returnPreset, setReturnPreset]   = useState<ReturnPreset>('none')
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; name: string } | null>(null)
  const [showQuickPatient, setShowQuickPatient] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickCpf, setQuickCpf] = useState('')
  const debouncedPatientSearch = useDebounce(patientSearch, 300)
  const { patients = [] } = usePatients(debouncedPatientSearch)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { durationMin: '30', status: 'scheduled', serviceTypeId: '', recurrenceType: 'none', recurrenceCount: '4' },
  })

  const recurrenceType  = watch('recurrenceType')
  const recurrenceCount = watch('recurrenceCount')
  const durationMinVal  = watch('durationMin')
  const latestPayment = payments[0] ?? null
  const canManagePayments = isEditing && !!appointment && clinic?.paymentsEnabled && hasPermission('canViewFinancial')
  const patientNeedsCpfForCharge = canManagePayments && !appointment?.patient?.cpf

  const activeServiceTypes = serviceTypes.filter(s => s.active)

  // Build duration options — include any custom value from drag selection or existing appointment
  const durationOptions = useMemo(() => {
    const custom = durationMinVal ? parseInt(durationMinVal) : null
    const extra  = custom && !PRESET_DURATIONS.includes(custom) ? [custom] : []
    return [...new Set([...PRESET_DURATIONS, ...extra])].sort((a, b) => a - b)
  }, [durationMinVal])

  useEffect(() => {
    if (!open) { setConfirmCancel(false); setPatientSearch(''); setSelectedPatient(null); setShowQuickPatient(false); setQuickName(''); setQuickCpf(''); setShowExtras(false); return }

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
    } else {
      reset({
        patientId:       initialPatientId ?? '',
        professionalId:  initialProfessionalId ?? '',
        date:            initialDate ?? format(new Date(), 'yyyy-MM-dd'),
        startTime:       initialTime ?? '08:00',
        durationMin:     String(initialDurationMin ?? 30),
        status:          'scheduled',
        notes:           '',
        roomId:          '',
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
    }
    setReturnPreset('none')
  }, [open, appointment, initialDate, initialTime, initialDurationMin, initialProfessionalId, initialPatientId, initialPatientName, reset])

  // Auto-select room / professional when there is only one active option
  useEffect(() => {
    if (!open) return
    const profs = professionals.filter(p => p.active)
    const rms   = rooms.filter(r => r.active)
    if (profs.length === 1) setValue('professionalId', profs[0].id)
    if (rms.length   === 1) setValue('roomId', rms[0].id)
  }, [open, professionals, rooms, setValue])

  async function onSubmit(values: FormValues) {
    try {
      const durationMin = parseInt(values.durationMin)
      const startsAt    = toUTC(values.date, values.startTime)
      const endsAt      = addMinutes(new Date(startsAt), durationMin).toISOString()
      const chargeAmountCents = values.chargeAmount
        ? Math.round(parseFloat(values.chargeAmount.replace(',', '.')) * 100)
        : null
      const professionalFeeCents = values.professionalFee
        ? Math.round(parseFloat(values.professionalFee.replace(',', '.')) * 100)
        : null

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
      } else if (returnPreset !== 'none' && returnPreset !== 'custom') {
        // Quick return preset — create original + one follow-up
        const offsetDays  = parseInt(returnPreset)  // '7d' → 7, '14d' → 14 …
        const returnStart = addDays(new Date(startsAt), offsetDays).toISOString()
        const returnEnd   = addMinutes(new Date(returnStart), durationMin).toISOString()
        await Promise.all([
          create.mutateAsync({ ...basePayload, startsAt, endsAt }),
          create.mutateAsync({ ...basePayload, startsAt: returnStart, endsAt: returnEnd }),
        ])
        const presetLabel = RETURN_PRESETS.find(p => p.value === returnPreset)?.label ?? ''
        toast.success(`Consulta agendada com retorno em ${presetLabel}`)
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
        toast.success(`${created} de ${count} consultas agendadas`)
      } else {
        await create.mutateAsync({ ...basePayload, startsAt, endsAt })
        toast.success('Consulta agendada')
      }
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('no_overlap')) {
        toast.error('Conflito de horário — profissional já tem consulta nesse horário')
      } else if (msg.includes('room_overlap')) {
        toast.error('Conflito de sala — já existe consulta nessa sala nesse horário')
      } else {
        toast.error('Erro ao salvar consulta')
      }
    }
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

  const activeProfessionals = professionals.filter(p => p.active)
  const activeRooms         = rooms.filter(r => r.active)
  const hasNoProfessionals  = !isEditing && activeProfessionals.length === 0
  const hasNoPatients       = !isEditing && patients.length === 0 && !patientSearch.trim()

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/35 backdrop-blur-[2px] z-40" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 bg-[#fcfdfd] shadow-2xl w-full max-w-xl flex flex-col focus:outline-none data-[state=open]:animate-slide-in-right border-l border-white/60">

          {/* Drawer header */}
          <div className="px-6 py-5 border-b border-gray-100 shrink-0 bg-white/80 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0ea5b0] mb-2">
                  Agenda clínica
                </p>
                <Dialog.Title className="text-xl font-semibold text-gray-900 tracking-tight">
                  {isEditing ? 'Editar consulta' : 'Nova consulta'}
                </Dialog.Title>
                <p className="text-sm text-gray-500 mt-1">
                  {isEditing
                    ? 'Atualize horário, profissional, cobrança e observações sem sair da agenda.'
                    : 'Agende uma consulta com o mínimo de atrito e já deixe o retorno configurado, se precisar.'}
                </p>
              </div>
              <Dialog.Close asChild>
                <button className="text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 p-2 transition-colors"><X size={18} /></button>
              </Dialog.Close>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Empty-state warnings — shown only when creating and clinic is fresh */}
          {(hasNoProfessionals || hasNoPatients) && (
            <div className="mb-4 space-y-2">
              {hasNoProfessionals && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  <Warning size={16} className="shrink-0 mt-0.5" />
                  <span>
                    Nenhum profissional cadastrado.{' '}
                    <Link to="/profissionais" onClick={onClose}
                      className="font-semibold underline hover:text-amber-900">
                      Cadastrar agora →
                    </Link>
                  </span>
                </div>
              )}
              {hasNoPatients && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  <Warning size={16} className="shrink-0 mt-0.5" />
                  <span>
                    Nenhum paciente cadastrado.{' '}
                    <Link to="/pacientes/novo" onClick={onClose}
                      className="font-semibold underline hover:text-amber-900">
                      Cadastrar agora →
                    </Link>
                  </span>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Patient */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paciente *</label>

              {/* Hidden field to keep react-hook-form value in sync */}
              <input type="hidden" {...register('patientId')} />

              {selectedPatient ? (
                /* Selected state — show chip with clear button */
                <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5">
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
              ) : (
                /* Search state — text input + suggestion dropdown */
                <div className="relative">
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={e => { setPatientSearch(e.target.value); setShowQuickPatient(false) }}
                    placeholder="Buscar por nome ou CPF..."
                    className="w-full border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                    autoComplete="off"
                  />
                  {patientSearch.trim() && !showQuickPatient && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {patients.map(p => (
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
                        {patients.length === 0 ? `Criar paciente "${patientSearch}"` : 'Criar novo paciente'}
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
                    className="w-full border border-teal-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
                  />
                  <input
                    type="text"
                    value={quickCpf}
                    onChange={e => setQuickCpf(e.target.value)}
                    placeholder="CPF (opcional)"
                    className="w-full border border-teal-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={handleQuickPatient} disabled={createPatient.isPending}
                      className="flex-1 py-2 text-xs text-white rounded-xl disabled:opacity-40 transition-all active:scale-[0.99]"
                      style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
                      {createPatient.isPending ? 'Criando...' : 'Criar e selecionar'}
                    </button>
                    <button type="button" onClick={() => setShowQuickPatient(false)}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {errors.patientId && <p className="text-xs text-red-500 mt-1">{errors.patientId.message}</p>}
            </div>

            {/* Professional — hidden + auto-filled when clinic has only one */}
            {activeProfessionals.length === 1 ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Profissional</label>
                <input type="hidden" {...register('professionalId')} />
                <p className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
                  {activeProfessionals[0].name}
                  {activeProfessionals[0].specialty ? ` — ${activeProfessionals[0].specialty}` : ''}
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Profissional *</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
                  {...register('professionalId')}
                >
                  <option value="">Selecione o profissional...</option>
                  {activeProfessionals.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.specialty ? ` — ${p.specialty}` : ''}
                    </option>
                  ))}
                </select>
                {errors.professionalId && <p className="text-xs text-red-500 mt-1">{errors.professionalId.message}</p>}
              </div>
            )}

            {/* Service type — optional, auto-fills duration + price when creating */}
            {activeServiceTypes.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de atendimento</label>
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
                >
                  <option value="">Selecionar serviço... (opcional)</option>
                  {activeServiceTypes.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.durationMinutes}min{s.priceCents != null ? ` · R$${(s.priceCents/100).toFixed(2).replace('.',',')}` : ''}
                    </option>
                  ))}
                </select>
                {!isEditing && <p className="text-xs text-gray-400 mt-0.5">Selecionar preenche automaticamente duração e valor.</p>}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Input label="Data *" type="date" error={errors.date?.message} {...register('date')} />
              <Input label="Horário *" type="time" error={errors.startTime?.message} {...register('startTime')} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duração</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
                  {...register('durationMin')}
                >
                  {durationOptions.map(d => (
                    <option key={d} value={d}>{d} min</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── Mais opções toggle ─────────────────────────────────────────── */}
            <button
              type="button"
              onClick={() => setShowExtras(v => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#0ea5b0] transition-colors py-0.5"
            >
              <span className={`transition-transform ${showExtras ? 'rotate-90' : ''}`}>▶</span>
              {showExtras ? 'Menos opções' : 'Mais opções'}
              {!showExtras && (
                <span className="text-gray-400">(sala, status, valor, observações, retorno)</span>
              )}
            </button>

            {/* ── Extras collapsible ─────────────────────────────────────────── */}
            {showExtras && (
              <div className="space-y-4">

            {/* Room + Status — room hidden when clinic has ≤1 room */}
            <div className={`grid gap-3 ${activeRooms.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {activeRooms.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sala / consultório</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
                    {...register('roomId')}
                  >
                    <option value="">Sem sala definida</option>
                    {activeRooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
                  {...register('status')}
                >
                  {STATUSES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Charge + Professional fee */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Valor cobrado (R$)"
                placeholder="0,00"
                {...register('chargeAmount')}
              />
              <Input
                label="Repasse ao profissional (R$)"
                placeholder="0,00"
                {...register('professionalFee')}
              />
            </div>

            {/* Notes */}
            <TextArea label="Observações" rows={2} {...register('notes')} />

            {/* Return / recurrence — only for new appointments */}
            {!isEditing && (
              <div className="rounded-2xl border border-gray-200 p-4 space-y-3 bg-[#f8fafb]">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <RepeatOnce size={16} className="text-gray-400" />
                  Retorno / recorrência
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {RETURN_PRESETS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setReturnPreset(p.value)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                        returnPreset === p.value
                          ? 'bg-[#006970] text-white border-[#006970]'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-[#0ea5b0]/40 hover:text-[#0ea5b0]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {returnPreset !== 'none' && returnPreset !== 'custom' && (
                  <p className="text-xs text-[#006970]">
                    Será agendado um retorno em{' '}
                    <strong>{RETURN_PRESETS.find(p => p.value === returnPreset)?.label}</strong>{' '}
                    com o mesmo profissional e horário.
                  </p>
                )}
                {returnPreset === 'custom' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Frequência</label>
                        <select
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
                          {...register('recurrenceType')}
                        >
                          {Object.entries(RECURRENCE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                      {recurrenceType !== 'none' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Nº de ocorrências
                          </label>
                          <input
                            type="number"
                            min={2}
                            max={52}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                            {...register('recurrenceCount')}
                          />
                        </div>
                      )}
                    </div>
                    {recurrenceType !== 'none' && (
                      <p className="text-xs text-[#006970]">
                        Serão criadas <strong>{Math.min(Math.max(parseInt(recurrenceCount) || 1, 1), 52)}</strong> consultas{' '}
                        {RECURRENCE_LABELS[recurrenceType].toLowerCase().replace('mente', '')}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {canManagePayments && appointment && (
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

                <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
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

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 pb-2 border-t border-gray-100 mt-2">
              {isEditing && !confirmCancel && (
                <button type="button" onClick={() => setConfirmCancel(true)}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700">
                  <Trash size={15} /> Cancelar consulta
                </button>
              )}
              {isEditing && confirmCancel && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">Confirmar cancelamento?</span>
                  <button type="button" onClick={handleCancel}
                    className="text-sm font-medium text-red-600 hover:underline">Sim</button>
                  <button type="button" onClick={() => setConfirmCancel(false)}
                    className="text-sm text-gray-400 hover:underline">Não</button>
                </div>
              )}
              {!confirmCancel && (
                <div className="flex gap-2 ml-auto">
                  <button type="button" onClick={onClose}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                    Fechar
                  </button>
                  <button type="submit" disabled={isSubmitting}
                    className="px-4 py-2 text-sm text-white rounded-xl disabled:opacity-50 transition-all active:scale-[0.99]"
                    style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
                    {isSubmitting ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              )}
            </div>
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
    </Dialog.Root>
  )
}
