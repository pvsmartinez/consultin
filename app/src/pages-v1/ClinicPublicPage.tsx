import { Link, useParams } from 'react-router-dom'
import {
  CalendarBlank,
  Clock,
  GlobeHemisphereWest,
  MapPin,
  Phone,
  Stethoscope,
  UserCircle,
  WhatsappLogo,
} from '@phosphor-icons/react'
import { usePublicPage } from '../hooks/useClinicPublicPage'
import { PageLoader } from '../components/ui/PageLoader'
import { formatCurrency } from '../utils/currency'

function formatWhatsAppLink(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits}`
}

function formatMapsLink(addressParts: Array<string | null | undefined>) {
  const query = addressParts.filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function formatWorkingHours(workingHours: Record<string, unknown> | null) {
  if (!workingHours) return []
  const days: Array<{ key: string; label: string }> = [
    { key: 'mon', label: 'Segunda' },
    { key: 'tue', label: 'Terça' },
    { key: 'wed', label: 'Quarta' },
    { key: 'thu', label: 'Quinta' },
    { key: 'fri', label: 'Sexta' },
    { key: 'sat', label: 'Sábado' },
    { key: 'sun', label: 'Domingo' },
  ]

  return days
    .map(({ key, label }) => {
      const slot = workingHours[key] as { start?: string; end?: string } | undefined
      if (!slot?.start || !slot?.end) return null
      return `${label}: ${slot.start} às ${slot.end}`
    })
    .filter(Boolean) as string[]
}

export default function ClinicPublicPage() {
  const { slug } = useParams()
  const { data: page, isLoading, error } = usePublicPage(slug)

  if (isLoading) return <PageLoader />

  if (error || !page) {
    return (
      <div className="min-h-screen bg-[#f7f8f8] flex items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <GlobeHemisphereWest size={32} className="mx-auto text-gray-300" />
          <h1 className="mt-4 text-2xl font-semibold text-gray-900">Página não encontrada</h1>
          <p className="mt-2 text-sm text-gray-500">Esse perfil público não existe ou ainda não foi publicado.</p>
          <Link to="/" className="mt-5 inline-flex rounded-xl bg-[#0ea5b0] px-4 py-2 text-sm font-medium text-white">
            Voltar para o Consultin
          </Link>
        </div>
      </div>
    )
  }

  const workingHours = formatWorkingHours(page.clinic.workingHours)
  const addressLine = [page.clinic.address, page.clinic.city, page.clinic.state].filter(Boolean).join(' • ')
  const whatsappHref = page.clinic.whatsappPhoneDisplay ? formatWhatsAppLink(page.clinic.whatsappPhoneDisplay) : null
  const mapsHref = formatMapsLink([page.clinic.address, page.clinic.city, page.clinic.state])
  const bookingHref = `/p/${slug}/agendar`
  const bookingLabel = 'Agendar consulta online'

  return (
    <div className="min-h-screen bg-[#f4f8f8] text-gray-900">
      <section className="relative overflow-hidden">
        <div
          className="h-[260px] w-full"
          style={{
            background: page.coverUrl
              ? `center / cover no-repeat url(${page.coverUrl})`
              : `linear-gradient(135deg, ${page.primaryColor}20 0%, ${page.primaryColor}70 100%)`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#f4f8f8] via-transparent to-transparent" />
      </section>

      <main className="mx-auto -mt-24 max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <section className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="flex gap-4">
                  <div className="h-24 w-24 overflow-hidden rounded-[28px] border-4 border-white bg-white shadow-sm flex items-center justify-center">
                    {page.logoUrl ? (
                      <img src={page.logoUrl} alt={page.clinic.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-3xl font-bold" style={{ color: page.primaryColor }}>
                        {page.clinic.name.charAt(0)}
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em]" style={{ color: page.primaryColor }}>
                      Página oficial
                    </p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{page.clinic.name}</h1>
                    <p className="mt-3 max-w-2xl text-base text-gray-600">
                      {page.tagline || 'Conheça a clínica, veja a equipe e fale diretamente pelo WhatsApp.'}
                    </p>
                    {addressLine && (
                      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin size={15} />
                          {addressLine}
                        </span>
                        {page.clinic.phone && (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone size={15} />
                            {page.clinic.phone}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  {page.showWhatsapp && whatsappHref && (
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-sm"
                      style={{ background: page.primaryColor }}
                    >
                      <WhatsappLogo size={18} weight="fill" />
                      Falar no WhatsApp
                    </a>
                  )}
                  {page.showBooking && page.clinic.allowSelfRegistration && (
                    <Link
                      to={bookingHref}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-800"
                    >
                      <CalendarBlank size={18} />
                      {bookingLabel}
                    </Link>
                  )}
                </div>
              </div>
            </section>

            {page.showProfessionals && page.professionals.length > 0 && (
              <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <UserCircle size={18} style={{ color: page.primaryColor }} />
                  <h2 className="text-xl font-semibold text-gray-900">Profissionais</h2>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {page.professionals.map((professional) => (
                    <article key={professional.id} className="rounded-3xl border border-gray-200 bg-[#fbfcfc] p-4">
                      <div className="flex items-start gap-4">
                        <div className="h-16 w-16 overflow-hidden rounded-2xl bg-gray-100 flex items-center justify-center shrink-0">
                          {professional.photoUrl ? (
                            <img src={professional.photoUrl} alt={professional.name} className="h-full w-full object-cover" />
                          ) : (
                            <UserCircle size={32} className="text-gray-300" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">{professional.name}</h3>
                          <p className="mt-1 text-sm font-medium" style={{ color: page.primaryColor }}>
                            {professional.specialty || 'Especialidade não informada'}
                          </p>
                          {professional.bio && <p className="mt-2 text-sm text-gray-600">{professional.bio}</p>}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {page.showServices && page.services.length > 0 && (
              <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <Stethoscope size={18} style={{ color: page.primaryColor }} />
                  <h2 className="text-xl font-semibold text-gray-900">Atendimentos</h2>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {page.services.map((service) => (
                    <div key={service.id} className="rounded-2xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{service.name}</p>
                          <p className="mt-1 text-xs text-gray-500">Duração média de {service.durationMinutes} min</p>
                        </div>
                        {service.priceCents !== null && (
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                            {formatCurrency(service.priceCents)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            {page.showLocation && addressLine && (
              <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <MapPin size={18} style={{ color: page.primaryColor }} />
                  <h2 className="text-lg font-semibold text-gray-900">Localização</h2>
                </div>
                <p className="mt-4 text-sm text-gray-600">{addressLine}</p>
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800"
                >
                  <MapPin size={16} />
                  Abrir no Google Maps
                </a>
              </section>
            )}

            {page.showHours && workingHours.length > 0 && (
              <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <Clock size={18} style={{ color: page.primaryColor }} />
                  <h2 className="text-lg font-semibold text-gray-900">Horários</h2>
                </div>
                <div className="mt-4 space-y-2">
                  {workingHours.map((line) => (
                    <div key={line} className="rounded-2xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      {line}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-gray-900">Contato rápido</p>
              <p className="mt-2 text-sm text-gray-500">
                Compartilhe esta página com novos pacientes para centralizar apresentação, localização e contato.
              </p>
              <div className="mt-4 space-y-2">
                {page.showWhatsapp && whatsappHref && (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white"
                    style={{ background: page.primaryColor }}
                  >
                    <WhatsappLogo size={18} weight="fill" />
                    Conversar agora
                  </a>
                )}
                {page.showBooking && page.clinic.allowSelfRegistration && (
                  <Link
                    to={bookingHref}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800"
                  >
                    <CalendarBlank size={18} />
                    {bookingLabel}
                  </Link>
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
