import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CalendarBlank, CheckCircle, GlobeHemisphereWest, UserCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import Input from '../components/ui/Input'
import TextArea from '../components/ui/TextArea'
import { PageLoader } from '../components/ui/PageLoader'
import { usePublicBookingSlots, useSubmitPublicBooking } from '../hooks/usePublicBooking'
import { usePublicPage } from '../hooks/useClinicPublicPage'

function tomorrowISODate() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function PublicBookingPage() {
  const { slug } = useParams()
  const { data: page, isLoading, error } = usePublicPage(slug)
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [patientEmail, setPatientEmail] = useState('')
  const [selectedDate, setSelectedDate] = useState(tomorrowISODate())
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('')
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState('')
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [confirmed, setConfirmed] = useState<{ patientName: string; professionalName: string; startsAt: string } | null>(null)

  const { data: slots = [], isLoading: loadingSlots } = usePublicBookingSlots(
    slug,
    selectedDate,
    selectedProfessionalId,
    selectedServiceTypeId,
  )
  const submitBooking = useSubmitPublicBooking()

  const selectedSlot = selectedSlotIndex !== null ? slots[selectedSlotIndex] : null

  const bookingEnabled = page?.showBooking && page.clinic.allowSelfRegistration
  const selectedService = page?.services.find((service) => service.id === selectedServiceTypeId) ?? null
  const maxDate = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 90)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!slug || !selectedSlot || !patientName.trim() || !patientPhone.trim()) return

    try {
      const result = await submitBooking.mutateAsync({
        slug,
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        patientEmail: patientEmail.trim() || undefined,
        professionalId: selectedSlot.professionalId,
        startsAt: selectedSlot.startsAt,
        endsAt: selectedSlot.endsAt,
        serviceTypeId: selectedServiceTypeId || undefined,
        notes: notes.trim() || undefined,
      })
      setConfirmed(result)
      setSelectedSlotIndex(null)
      toast.success('Consulta agendada com sucesso')
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : 'Erro ao agendar consulta')
    }
  }

  if (isLoading) return <PageLoader />

  if (error || !page || !bookingEnabled) {
    return (
      <div className="min-h-screen bg-[#f7f8f8] flex items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <GlobeHemisphereWest size={32} className="mx-auto text-gray-300" />
          <h1 className="mt-4 text-2xl font-semibold text-gray-900">Agendamento indisponível</h1>
          <p className="mt-2 text-sm text-gray-500">Essa clínica ainda não liberou agendamento público nesta página.</p>
          <Link to={slug ? `/p/${slug}` : '/'} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0ea5b0] px-4 py-2.5 text-sm font-medium text-white">
            Voltar para a página da clínica
          </Link>
        </div>
      </div>
    )
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-[#f4f8f8] flex items-center justify-center p-6">
        <div className="max-w-lg rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-[#0ea5b0]">
            <CheckCircle size={34} weight="fill" />
          </div>
          <h1 className="mt-5 text-3xl font-bold text-gray-900">Consulta agendada</h1>
          <p className="mt-3 text-sm text-gray-600">
            {confirmed.patientName}, seu horário foi reservado com {confirmed.professionalName} em{' '}
            {new Date(confirmed.startsAt).toLocaleString('pt-BR', {
              weekday: 'long',
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Sao_Paulo',
            })}.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to={`/p/${slug}`} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700">
              Ver página da clínica
            </Link>
            <button
              type="button"
              onClick={() => {
                setConfirmed(null)
                setPatientName('')
                setPatientPhone('')
                setPatientEmail('')
                setNotes('')
              }}
              className="min-h-11 rounded-2xl bg-[#0ea5b0] px-4 py-2.5 text-sm font-medium text-white"
            >
              Agendar outro horário
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f4f8f8] text-gray-900">
      <main className="mx-auto max-w-5xl px-4 py-8 pb-28 sm:px-6 sm:py-10 lg:px-8 lg:pb-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em]" style={{ color: page.primaryColor }}>
              Agendamento online
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">Agendar em {page.clinic.name}</h1>
            <p className="mt-3 max-w-2xl text-sm text-gray-600">
              Escolha o serviço, selecione um horário disponível e envie seus dados. A clínica recebe o agendamento automaticamente.
            </p>
          </div>
          <Link to={`/p/${slug}`} className="inline-flex min-h-11 items-center justify-center self-start rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700">
            Voltar à página
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <form id="public-booking-form" onSubmit={handleSubmit} className="space-y-6">
            <section className="rounded-[28px] border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900">1. Seus dados</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input label="Nome completo" value={patientName} onChange={(e) => setPatientName(e.target.value)} required className="min-h-12 px-4 py-3.5 text-base" />
                <Input label="WhatsApp" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} required className="min-h-12 px-4 py-3.5 text-base" />
                <div className="md:col-span-2">
                  <Input label="E-mail" type="email" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} className="min-h-12 px-4 py-3.5 text-base" />
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900">2. Escolha o atendimento</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Data</label>
                  <input
                    type="date"
                    min={tomorrowISODate()}
                    max={maxDate}
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value)
                      setSelectedSlotIndex(null)
                    }}
                    className="min-h-12 rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-800"
                  />
                </div>

                {page.clinic.allowProfessionalSelection && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Profissional</label>
                    <select
                      value={selectedProfessionalId}
                      onChange={(e) => {
                        setSelectedProfessionalId(e.target.value)
                        setSelectedSlotIndex(null)
                      }}
                      className="min-h-12 rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-800"
                    >
                      <option value="">Primeiro disponível</option>
                      {page.professionals.map((professional) => (
                        <option key={professional.id} value={professional.id}>
                          {professional.name}{professional.specialty ? ` • ${professional.specialty}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Serviço</label>
                  <select
                    value={selectedServiceTypeId}
                    onChange={(e) => {
                      setSelectedServiceTypeId(e.target.value)
                      setSelectedSlotIndex(null)
                    }}
                    className="min-h-12 rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-800"
                  >
                    <option value="">Consulta padrão</option>
                    {page.services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} • {service.durationMinutes} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-center gap-2">
                <CalendarBlank size={18} style={{ color: page.primaryColor }} />
                <h2 className="text-lg font-semibold text-gray-900">3. Horários disponíveis</h2>
              </div>
              <div className="mt-4">
                {loadingSlots ? (
                  <p className="text-sm text-gray-500">Buscando horários...</p>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum horário disponível para os filtros escolhidos.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {slots.map((slot, index) => {
                      const selected = selectedSlotIndex === index
                      return (
                        <button
                          key={`${slot.professionalId}-${slot.startsAt}`}
                          type="button"
                          onClick={() => setSelectedSlotIndex(index)}
                          className={`min-h-24 rounded-2xl border p-4 text-left transition ${selected ? 'border-teal-300 bg-teal-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{slot.displayDate} às {slot.displayTime}</p>
                              <p className="mt-1 text-xs leading-relaxed text-gray-500">{slot.professionalName}{slot.specialty ? ` • ${slot.specialty}` : ''}</p>
                            </div>
                            <UserCircle size={18} className={`shrink-0 ${selected ? 'text-[#0ea5b0]' : 'text-gray-300'}`} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
              <TextArea label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional. Ex: primeira consulta, retorno, preferência de horário." rows={4} className="px-4 py-3.5 text-base" />
            </section>
          </form>

          <aside className="space-y-6">
            <section className="rounded-[28px] border border-gray-200 bg-white p-4 shadow-sm sm:p-6 lg:sticky lg:top-4">
              <p className="text-sm font-semibold text-gray-900">Resumo</p>
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Clínica</p>
                  <p className="mt-1 font-medium text-gray-900">{page.clinic.name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Serviço</p>
                  <p className="mt-1 font-medium text-gray-900">{selectedService?.name || 'Consulta padrão'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Horário</p>
                  <p className="mt-1 font-medium text-gray-900">
                    {selectedSlot ? `${selectedSlot.displayDate} às ${selectedSlot.displayTime}` : 'Selecione um horário'}
                  </p>
                </div>
              </div>

              <button
                type="submit"
                form="public-booking-form"
                disabled={submitBooking.isPending || !selectedSlot || !patientName.trim() || !patientPhone.trim()}
                className="mt-6 min-h-12 w-full rounded-2xl px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: page.primaryColor }}
              >
                {submitBooking.isPending ? 'Agendando...' : 'Confirmar agendamento'}
              </button>

              <p className="mt-3 text-xs text-gray-400">
                Ao enviar, a clínica recebe a consulta na agenda e pode entrar em contato pelo WhatsApp informado.
              </p>
            </section>
          </aside>
        </div>

        {/* Mobile sticky submit bar — visible only below lg breakpoint */}
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/95 px-4 pt-3 backdrop-blur lg:hidden"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}>
          {selectedSlot && (
            <p className="mb-2 truncate text-center text-xs font-medium text-gray-500">
              {selectedSlot.displayDate} às {selectedSlot.displayTime}
            </p>
          )}
          <button
            type="submit"
            form="public-booking-form"
            disabled={submitBooking.isPending || !selectedSlot || !patientName.trim() || !patientPhone.trim()}
            className="min-h-12 w-full rounded-2xl px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: page.primaryColor }}
          >
            {submitBooking.isPending
              ? 'Agendando...'
              : selectedSlot
                ? `Confirmar — ${selectedSlot.displayDate} às ${selectedSlot.displayTime}`
                : 'Confirmar agendamento'}
          </button>
        </div>
      </main>
    </div>
  )
}
