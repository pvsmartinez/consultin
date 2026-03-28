import { useState, useEffect, useMemo } from 'react'
import { format, addDays, parseISO, addMinutes, getISOWeek } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import { ptBR } from 'date-fns/locale'
import { CalendarCheck, ArrowLeft, CheckCircle, ArrowRight, Stethoscope, CurrencyCircleDollar } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { useClinic } from '../hooks/useClinic'
import { useAvailabilitySlots } from '../hooks/useAvailabilitySlots'
import { useClinicAvailabilitySlots } from '../hooks/useRoomAvailability'
import { useProfessionals } from '../hooks/useProfessionals'
import { useAppointmentMutations } from '../hooks/useAppointmentsMutations'
import { useMyPatient } from '../hooks/usePatients'
import { useServiceTypes } from '../hooks/useServiceTypes'
import { formatBRL } from '../utils/currency'

type BookedRange = {
  professionalId: string
  startsMs: number
  endsMs: number
}

export default function AgendarConsultaPage() {
  const navigate = useNavigate()

  const { data: clinic }  = useClinic()
  const allowProfSelection   = clinic?.allowProfessionalSelection ?? true
  const slotDuration         = clinic?.slotDurationMinutes ?? 30

  const { patient: myPatient }              = useMyPatient()
  const { data: allProfessionals = [],
          isLoading: loadingProfs }          = useProfessionals()
  const professionals = allProfessionals.filter(p => p.active)
  const { data: serviceTypes = [] }          = useServiceTypes()
  const activeServiceTypes = serviceTypes.filter(s => s.active)
  const { create }                           = useAppointmentMutations()

  const [selectedProf,        setSelectedProf]        = useState<string>('')
  const [selectedDate,        setSelectedDate]        = useState<string>('')
  const [selectedTime,        setSelectedTime]        = useState<string>('')
  const [selectedServiceType, setSelectedServiceType] = useState<string>('')
  const [notes,               setNotes]               = useState<string>('')
  const [saving,              setSaving]               = useState(false)
  const [confirmed, setConfirmed] = useState<{ profName: string; date: string; time: string; serviceName?: string } | null>(null)

  const selectedService = activeServiceTypes.find(s => s.id === selectedServiceType) ?? null
  // Use service type duration if selected, otherwise use clinic default
  const effectiveSlotDuration = selectedService?.durationMinutes ?? slotDuration
  const bookingQueryProfId = allowProfSelection ? selectedProf : '__auto__'

  const minDate = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const maxDate = format(addDays(new Date(), 90), 'yyyy-MM-dd')

  // Booked appointments for the selected day.
  // When the patient chooses the professional, fetch only that professional's bookings.
  // Otherwise, fetch bookings for all active professionals so we can auto-assign one
  // who is genuinely free for the chosen slot.
  const { data: bookedRanges = [], isLoading: loadingBooked } = useQuery({
    queryKey: QK.booking.slots(bookingQueryProfId, selectedDate),
    enabled: !!selectedDate && (allowProfSelection ? !!selectedProf : professionals.length > 0),
    queryFn: async (): Promise<BookedRange[]> => {
      const TZ = 'America/Sao_Paulo'
      const dayStartUTC = fromZonedTime(`${selectedDate}T00:00:00`, TZ).toISOString()
      const dayEndUTC   = fromZonedTime(`${selectedDate}T23:59:59`, TZ).toISOString()
      let query = supabase
        .from('appointments')
        .select('professional_id, starts_at, ends_at')
        .gte('starts_at', dayStartUTC)
        .lte('starts_at', dayEndUTC)
        .neq('status', 'cancelled')
      if (allowProfSelection) {
        query = query.eq('professional_id', selectedProf)
      } else {
        query = query.in('professional_id', professionals.map(p => p.id))
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map(a => ({
        professionalId: a.professional_id as string,
        startsMs: parseISO(a.starts_at as string).getTime(),
        endsMs:   parseISO(a.ends_at   as string).getTime(),
      }))
    },
  })

  // Availability slots for the explicitly selected professional.
  const { data: selectedProfAvailSlots = [] } = useAvailabilitySlots(selectedProf)
  // Clinic-wide availability for all professionals, used when the clinic auto-assigns.
  const { data: clinicAvailSlots = [] } = useClinicAvailabilitySlots()

  function isSlotBooked(professionalId: string, timeHHMM: string): boolean {
    if (bookedRanges.length === 0 || !selectedDate) return false
    const TZ = 'America/Sao_Paulo'
    const slotStartMs = fromZonedTime(`${selectedDate}T${timeHHMM}:00`, TZ).getTime()
    const slotEndMs   = slotStartMs + effectiveSlotDuration * 60_000
    return bookedRanges.some(r => (
      r.professionalId === professionalId
      && r.startsMs < slotEndMs
      && r.endsMs > slotStartMs
    ))
  }

  const availableProfessionalsByTime = useMemo(() => {
    const availableByTime = new Map<string, string[]>()
    if (!selectedDate || professionals.length === 0) return availableByTime

    const dt = new Date(`${selectedDate}T12:00:00`)
    const weekday = dt.getDay() // 0=Sun…6=Sat
    const weekNum = getISOWeek(dt)
    const dateParity = weekNum % 2 === 0 ? 'even' : 'odd'

    const pushTime = (time: string, professionalId: string) => {
      if (isSlotBooked(professionalId, time)) return
      const current = availableByTime.get(time)
      if (current) current.push(professionalId)
      else availableByTime.set(time, [professionalId])
    }

    if (allowProfSelection) {
      if (!selectedProf || selectedProfAvailSlots.length === 0) return availableByTime
      const daySlots = selectedProfAvailSlots.filter(
        s => s.weekday === weekday && s.active && (!s.weekParity || s.weekParity === dateParity)
      )
      for (const slot of daySlots) {
        const [sh, sm] = slot.startTime.split(':').map(Number)
        const [eh, em] = slot.endTime.split(':').map(Number)
        let cur = sh * 60 + sm
        const end = eh * 60 + em
        while (cur + effectiveSlotDuration <= end) {
          const time = `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`
          pushTime(time, selectedProf)
          cur += effectiveSlotDuration
        }
      }
      return availableByTime
    }

    for (const professional of professionals) {
      const daySlots = clinicAvailSlots.filter(
        s => s.professional_id === professional.id
          && s.weekday === weekday
          && s.active
          && (!s.week_parity || s.week_parity === dateParity)
      )
      for (const slot of daySlots) {
        const [sh, sm] = slot.start_time.split(':').map(Number)
        const [eh, em] = slot.end_time.split(':').map(Number)
        let cur = sh * 60 + sm
        const end = eh * 60 + em
        while (cur + effectiveSlotDuration <= end) {
          const time = `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`
          pushTime(time, professional.id)
          cur += effectiveSlotDuration
        }
      }
    }

    return availableByTime
  }, [
    selectedDate,
    professionals,
    allowProfSelection,
    selectedProf,
    selectedProfAvailSlots,
    clinicAvailSlots,
    effectiveSlotDuration,
    bookedRanges,
  ])

  const effectiveProf = allowProfSelection
    ? selectedProf
    : (selectedTime ? availableProfessionalsByTime.get(selectedTime)?.[0] ?? '' : '')

  // Derive visible time options from the available professionals map.
  const availableTimes = useMemo(() => {
    return Array.from(availableProfessionalsByTime.keys()).sort((a, b) => a.localeCompare(b))
  }, [availableProfessionalsByTime])

  // Clear time choice whenever the manually selected professional, date, or service changes.
  useEffect(() => { setSelectedTime('') }, [selectedProf, selectedDate, selectedServiceType])

  useEffect(() => {
    if (selectedTime && !availableProfessionalsByTime.has(selectedTime)) {
      setSelectedTime('')
    }
  }, [selectedTime, availableProfessionalsByTime])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!myPatient || !effectiveProf || !selectedDate || !selectedTime) return

    setSaving(true)

    const TZ = 'America/Sao_Paulo'
    const startsAt = fromZonedTime(`${selectedDate}T${selectedTime}:00`, TZ)
    const endsAt   = addMinutes(startsAt, effectiveSlotDuration)

    try {
      await create.mutateAsync({
        patientId:       myPatient.id,
        professionalId:  effectiveProf,
        startsAt:        startsAt.toISOString(),
        endsAt:          endsAt.toISOString(),
        status:          'scheduled',
        notes:           notes || null,
        serviceTypeId:   selectedServiceType || null,
      })
      const profName = professionals.find(p => p.id === effectiveProf)?.name ?? ''
      setConfirmed({ profName, date: selectedDate, time: selectedTime, serviceName: selectedService?.name })
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === '23P01') {
        toast.error('Este horário já está ocupado. Escolha outro.')
      } else {
        toast.error('Erro ao agendar. Tente novamente.')
      }
    } finally {
      setSaving(false)
    }
  }

  const selectedProfName = professionals.find(p => p.id === effectiveProf)?.name ?? ''

  // ── Confirmation screen ─────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto">
          <CheckCircle size={36} className="text-green-500" weight="fill" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Consulta agendada!</h1>
          <p className="text-sm text-gray-500 mt-1">Você receberá uma confirmação em breve.</p>
        </div>
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-sm text-left space-y-2">
          {confirmed.serviceName && (
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Serviço</span>
              <span className="font-medium text-gray-800">{confirmed.serviceName}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Profissional</span>
            <span className="font-medium text-gray-800">{confirmed.profName || 'A definir'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Data</span>
            <span className="font-medium text-gray-800 capitalize">
              {format(new Date(confirmed.date + 'T12:00:00'), "dd 'de' MMMM yyyy", { locale: ptBR })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Horário</span>
            <span className="font-medium text-gray-800">{confirmed.time}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            to="/minhas-consultas"
            className="flex items-center justify-center gap-2 text-white text-sm font-semibold py-2.5 rounded-xl transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
          >
            Ver minhas consultas <ArrowRight size={15} />
          </Link>
          <button
            onClick={() => {
              setConfirmed(null)
              setSelectedProf('')
              setSelectedDate('')
              setSelectedTime('')
              setSelectedServiceType('')
              setNotes('')
            }}
            className="text-sm text-gray-400 hover:text-gray-600 py-2 transition"
          >
            Agendar outra consulta
          </button>
        </div>
      </div>
    )
  }

  // Edge case: user logged in but no patient record linked to this account
  if (!myPatient && !loadingProfs) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-3">
        <CalendarCheck size={40} className="text-gray-300 mx-auto" />
        <p className="text-sm text-gray-500 font-medium">Cadastro de paciente não encontrado</p>
        <p className="text-xs text-gray-400 max-w-xs mx-auto">
          Seu e-mail de acesso não está vinculado a nenhum paciente nesta clínica.
          Entre em contato com a recepção para regularizar seu cadastro.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/minhas-consultas')}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold text-gray-800">Agendar Consulta</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">

        {/* Service type — optional, only shown if clinic has active service types */}
        {activeServiceTypes.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de serviço <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <Stethoscope size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={selectedServiceType}
                onChange={e => setSelectedServiceType(e.target.value)}
                className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
              >
                <option value="">Selecione um serviço</option>
                {activeServiceTypes.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            {selectedService?.priceCents && (
              <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                <CurrencyCircleDollar size={13} className="text-green-500" />
                Valor estimado: <span className="font-medium text-gray-700">{formatBRL(selectedService.priceCents)}</span>
              </p>
            )}
          </div>
        )}

        {/* Professional — only shown if clinic allows patient choice */}
        {allowProfSelection && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profissional</label>
            {loadingProfs ? (
              <p className="text-sm text-gray-400">Carregando profissionais...</p>
            ) : professionals.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum profissional disponível.</p>
            ) : (
              <select
                required
                value={selectedProf}
                onChange={e => setSelectedProf(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
              >
                <option value="">Selecione um profissional</option>
                {professionals.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.specialty ? ` — ${p.specialty}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
          <input
            type="date"
            required
            value={selectedDate}
            min={minDate}
            max={maxDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
          />
          {selectedDate && (
            <p className="text-xs text-gray-400 mt-1 capitalize">
              {format(new Date(selectedDate + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
          )}
        </div>

        {/* Time — derived from availability + clinic slot duration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Horário</label>
          {!effectiveProf || !selectedDate ? (
            <p className="text-xs text-gray-400">
              {allowProfSelection
                ? 'Selecione o profissional e a data para ver os horários.'
                : 'Selecione a data para ver os horários disponíveis entre os profissionais ativos.'}
            </p>
          ) : loadingBooked ? (
            <p className="text-xs text-gray-400">Carregando horários disponíveis...</p>
          ) : availableTimes.length === 0 ? (
            <p className="text-xs text-gray-400">Sem horários disponíveis nesta data. Tente outro dia.</p>
          ) : (
            <div className="grid grid-cols-5 gap-1.5">
              {availableTimes.map(t => {
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTime(t)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition ${
                      selectedTime === t
                        ? 'bg-[#0ea5b0] text-white border-transparent'
                        : 'border-gray-200 text-gray-600 hover:border-teal-300 hover:text-[#006970]'
                    }`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Observações <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Ex: retorno, dor de dente..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] resize-none"
          />
        </div>

        {/* Summary */}
        {effectiveProf && selectedDate && selectedTime && (
          <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 text-sm text-[#006970] space-y-1">
            <p className="font-medium flex items-center gap-1.5">
              <CalendarCheck size={15} /> Resumo do agendamento
            </p>
            {selectedService && (
              <p className="text-xs">
                Serviço: <span className="font-medium">{selectedService.name}</span>
                {selectedService.priceCents ? ` — ${formatBRL(selectedService.priceCents)}` : ''}
              </p>
            )}
            <p className="text-xs">
              {allowProfSelection
                ? <><span className="font-medium">{selectedProfName}</span> — </>
                : selectedProfName
                  ? <><span className="font-medium">{selectedProfName}</span> — alocado automaticamente — </>
                  : 'Profissional será alocado automaticamente pela disponibilidade — '
              }
              {format(new Date(selectedDate + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })} às {selectedTime}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !effectiveProf || !selectedDate || !selectedTime}
          className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 text-sm font-semibold transition disabled:opacity-40"
        >
          {saving ? 'Agendando...' : 'Confirmar agendamento'}
        </button>
      </form>
    </div>
  )
}
