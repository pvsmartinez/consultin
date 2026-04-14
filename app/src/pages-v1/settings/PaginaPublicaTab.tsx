import { useEffect, useMemo, useState } from 'react'
import { GlobeHemisphereWest, ImageSquare, Link, UploadSimple, WhatsappLogo } from '@phosphor-icons/react'
import { toast } from 'sonner'
import Input from '../../components/ui/Input'
import TextArea from '../../components/ui/TextArea'
import { useAuthContext } from '../../contexts/AuthContext'
import { useClinicPublicPage } from '../../hooks/useClinicPublicPage'
import { useProfessionals } from '../../hooks/useProfessionals'
import { supabase } from '../../services/supabase'
import type { Clinic, Professional } from '../../types'

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  description: string
  value: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${disabled ? 'opacity-50' : ''}`}>
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${value ? 'bg-[#0ea5b0]' : 'bg-gray-200'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

async function uploadClinicAsset(clinicId: string, folder: string, file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension) ? extension : 'jpg'
  const fileName = `${Date.now()}.${safeExt}`
  const storagePath = `${clinicId}/${folder}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('clinic-assets')
    .upload(storagePath, file, { upsert: true })

  if (uploadError) throw uploadError

  return supabase.storage.from('clinic-assets').getPublicUrl(storagePath).data.publicUrl
}

export default function PaginaPublicaTab({ clinic }: { clinic: Clinic }) {
  const { profile } = useAuthContext()
  const { data: page, upsert, isLoading } = useClinicPublicPage()
  const { data: professionals = [], update: updateProfessional } = useProfessionals()

  const [slug, setSlug] = useState('')
  const [tagline, setTagline] = useState('')
  const [published, setPublished] = useState(false)
  const [primaryColor, setPrimaryColor] = useState('#0ea5b0')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [showProfessionals, setShowProfessionals] = useState(true)
  const [showLocation, setShowLocation] = useState(true)
  const [showServices, setShowServices] = useState(true)
  const [showHours, setShowHours] = useState(true)
  const [showBooking, setShowBooking] = useState(true)
  const [showWhatsapp, setShowWhatsapp] = useState(true)
  const [uploadingField, setUploadingField] = useState<string | null>(null)
  const [savingProfessionalId, setSavingProfessionalId] = useState<string | null>(null)
  const [professionalDrafts, setProfessionalDrafts] = useState<Record<string, { bio: string; photoUrl: string | null }>>({})

  useEffect(() => {
    const fallbackSlug = slugify(clinic.name || 'clinica')
    setSlug(page?.slug ?? fallbackSlug)
    setTagline(page?.tagline ?? '')
    setPublished(page?.published ?? false)
    setPrimaryColor(page?.primaryColor ?? '#0ea5b0')
    setLogoUrl(page?.logoUrl ?? null)
    setCoverUrl(page?.coverUrl ?? null)
    setShowProfessionals(page?.showProfessionals ?? true)
    setShowLocation(page?.showLocation ?? true)
    setShowServices(page?.showServices ?? true)
    setShowHours(page?.showHours ?? true)
    setShowBooking(page?.showBooking ?? clinic.allowSelfRegistration)
    setShowWhatsapp(page?.showWhatsapp ?? !!clinic.whatsappPhoneDisplay)
  }, [page, clinic.name, clinic.allowSelfRegistration, clinic.whatsappPhoneDisplay])

  useEffect(() => {
    setProfessionalDrafts(Object.fromEntries(
      professionals.map((professional) => [
        professional.id,
        {
          bio: professional.bio ?? '',
          photoUrl: professional.photoUrl ?? null,
        },
      ]),
    ))
  }, [professionals])

  const publicUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://consultin.app'
    return `${origin}/p/${slug || 'minha-clinica'}`
  }, [slug])

  const publicBookingUrl = useMemo(() => `${publicUrl}/agendar`, [publicUrl])

  async function handleUpload(field: 'logo' | 'cover', file: File | null) {
    if (!file || !profile?.clinicId) return
    try {
      setUploadingField(field)
      const url = await uploadClinicAsset(profile.clinicId, field, file)
      if (field === 'logo') setLogoUrl(url)
      else setCoverUrl(url)
      toast.success(field === 'logo' ? 'Logo enviada' : 'Capa enviada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar imagem')
    } finally {
      setUploadingField(null)
    }
  }

  async function handleProfessionalPhotoUpload(professionalId: string, file: File | null) {
    if (!file || !profile?.clinicId) return
    try {
      setUploadingField(professionalId)
      const url = await uploadClinicAsset(profile.clinicId, `professionals/${professionalId}`, file)
      setProfessionalDrafts((current) => ({
        ...current,
        [professionalId]: {
          bio: current[professionalId]?.bio ?? '',
          photoUrl: url,
        },
      }))
      toast.success('Foto do profissional enviada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar foto')
    } finally {
      setUploadingField(null)
    }
  }

  async function handleSavePage() {
    try {
      const normalizedSlug = slugify(slug) || slugify(clinic.name) || 'clinica'
      await upsert.mutateAsync({
        slug: normalizedSlug,
        published,
        logoUrl,
        coverUrl,
        primaryColor,
        tagline: tagline.trim() || null,
        showProfessionals,
        showLocation,
        showServices,
        showHours,
        showBooking: clinic.allowSelfRegistration ? showBooking : false,
        showWhatsapp: clinic.whatsappPhoneDisplay ? showWhatsapp : false,
      })
      setSlug(normalizedSlug)
      toast.success('Página pública salva')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar página pública')
    }
  }

  async function handleSaveProfessional(professional: Professional) {
    try {
      setSavingProfessionalId(professional.id)
      const draft = professionalDrafts[professional.id]
      await updateProfessional.mutateAsync({
        id: professional.id,
        name: professional.name,
        specialty: professional.specialty,
        councilId: professional.councilId,
        phone: professional.phone,
        email: professional.email,
        active: professional.active,
        customFields: professional.customFields,
        userId: professional.userId,
        photoUrl: draft?.photoUrl ?? null,
        bio: draft?.bio?.trim() || null,
      })
      toast.success('Profissional atualizado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar profissional')
    } finally {
      setSavingProfessionalId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-white p-2 text-[#0ea5b0] shadow-sm">
            <GlobeHemisphereWest size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Página pública da clínica</p>
            <p className="text-xs text-gray-500 mt-1 max-w-2xl">
              Esta é a página que você pode divulgar no Instagram, WhatsApp e Google. Ela concentra a apresentação da clínica,
              contato e, quando ativado, o caminho para o agendamento online.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Slug da página"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="minha-clinica"
                hint="URL final: consultin.app/p/seu-slug"
              />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Cor principal</label>
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5">
                  <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-12 rounded border-0 bg-transparent p-0" />
                  <span className="text-sm font-medium text-gray-700">{primaryColor}</span>
                </div>
              </div>
            </div>

            <TextArea
              label="Frase de destaque"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Ex: Atendimento humanizado em odontologia estética e clínica geral."
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <ImageSquare size={16} className="text-gray-400" />
                  Logo da clínica
                </div>
                {logoUrl ? <img src={logoUrl} alt="Logo da clínica" className="h-20 w-20 rounded-2xl object-cover border border-gray-200" /> : <div className="h-20 w-20 rounded-2xl bg-gray-100 border border-dashed border-gray-300" />}
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
                  <UploadSimple size={16} />
                  {uploadingField === 'logo' ? 'Enviando...' : 'Enviar logo'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload('logo', e.target.files?.[0] ?? null)} />
                </label>
              </div>

              <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <ImageSquare size={16} className="text-gray-400" />
                  Foto de capa
                </div>
                {coverUrl ? <img src={coverUrl} alt="Capa da clínica" className="h-20 w-full rounded-2xl object-cover border border-gray-200" /> : <div className="h-20 w-full rounded-2xl bg-gray-100 border border-dashed border-gray-300" />}
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
                  <UploadSimple size={16} />
                  {uploadingField === 'cover' ? 'Enviando...' : 'Enviar capa'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload('cover', e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
            <div className="px-4 py-3">
              <p className="text-sm font-semibold text-gray-800">Seções visíveis</p>
              <p className="text-xs text-gray-400 mt-1">Você não monta site; só liga ou desliga os blocos do template.</p>
            </div>
            <ToggleRow value={showProfessionals} onChange={setShowProfessionals} label="Profissionais" description="Mostra equipe com foto, especialidade e descrição curta." />
            <ToggleRow value={showLocation} onChange={setShowLocation} label="Endereço e mapa" description="Exibe endereço e botão para abrir rota no Google Maps." />
            <ToggleRow value={showServices} onChange={setShowServices} label="Serviços" description="Lista os tipos de atendimento cadastrados na clínica." />
            <ToggleRow value={showHours} onChange={setShowHours} label="Horários" description="Mostra os horários de funcionamento configurados na agenda." />
            <ToggleRow value={showWhatsapp} onChange={setShowWhatsapp} label="WhatsApp" description="Exibe botão direto para contato pelo WhatsApp da clínica." disabled={!clinic.whatsappPhoneDisplay} />
            <ToggleRow value={showBooking} onChange={setShowBooking} label="Agendamento online" description="Exibe CTA para o portal do paciente quando o autocadastro estiver ativado." disabled={!clinic.allowSelfRegistration} />
            <ToggleRow value={published} onChange={setPublished} label="Publicar página" description="Quando desligado, o link deixa de ficar acessível publicamente." />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Equipe na página pública</p>
                <p className="text-xs text-gray-400 mt-1">Fotos e mini-bio passam muito mais confiança que só nome e especialidade.</p>
              </div>
            </div>

            <div className="space-y-4">
              {professionals.filter((professional) => professional.active).map((professional) => {
                const draft = professionalDrafts[professional.id] ?? { bio: '', photoUrl: null }
                return (
                  <div key={professional.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row">
                      <div className="w-full lg:w-44 space-y-3">
                        {draft.photoUrl ? (
                          <img src={draft.photoUrl} alt={professional.name} className="h-32 w-32 rounded-2xl object-cover border border-gray-200" />
                        ) : (
                          <div className="h-32 w-32 rounded-2xl bg-gray-100 border border-dashed border-gray-300" />
                        )}
                        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
                          <UploadSimple size={16} />
                          {uploadingField === professional.id ? 'Enviando...' : 'Enviar foto'}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleProfessionalPhotoUpload(professional.id, e.target.files?.[0] ?? null)} />
                        </label>
                      </div>

                      <div className="flex-1 space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{professional.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{professional.specialty || 'Especialidade não informada'}</p>
                        </div>
                        <TextArea
                          label="Descrição curta"
                          value={draft.bio}
                          onChange={(e) => setProfessionalDrafts((current) => ({
                            ...current,
                            [professional.id]: {
                              bio: e.target.value,
                              photoUrl: current[professional.id]?.photoUrl ?? null,
                            },
                          }))}
                          placeholder="Ex: Atua com foco em odontologia estética, reabilitação e atendimento humanizado."
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleSaveProfessional(professional)}
                            disabled={savingProfessionalId === professional.id}
                            className="px-4 py-2 text-sm text-white rounded-xl disabled:opacity-40 transition-all active:scale-[0.99]"
                            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
                          >
                            {savingProfessionalId === professional.id ? 'Salvando...' : 'Salvar profissional'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {professionals.filter((professional) => professional.active).length === 0 && (
                <p className="text-sm text-gray-500">Nenhum profissional ativo cadastrado.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4 sticky top-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Link size={16} className="text-gray-400" />
              URL pública
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 break-all">
              {publicUrl}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(publicUrl).then(() => toast.success('Link copiado'))}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Copiar link
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Abrir preview
              </a>
            </div>

            <div className="space-y-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 break-all">
                {publicBookingUrl}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(publicBookingUrl).then(() => toast.success('Link de agendamento copiado'))}
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Copiar link de agendamento
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Agende sua consulta aqui: ${publicBookingUrl}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Compartilhar no WhatsApp
                </a>
              </div>
            </div>

            <div className="rounded-3xl overflow-hidden border border-gray-200 bg-[#f6fbfb] shadow-sm">
              <div className="h-36" style={{ background: coverUrl ? `center / cover no-repeat url(${coverUrl})` : `linear-gradient(135deg, ${primaryColor}22 0%, ${primaryColor}55 100%)` }} />
              <div className="px-5 pb-5 -mt-8">
                <div className="h-16 w-16 rounded-2xl border-4 border-white bg-white shadow-sm overflow-hidden flex items-center justify-center">
                  {logoUrl ? <img src={logoUrl} alt={clinic.name} className="h-full w-full object-cover" /> : <span className="text-xl font-bold" style={{ color: primaryColor }}>{clinic.name.charAt(0)}</span>}
                </div>
                <div className="mt-3">
                  <p className="text-lg font-semibold text-gray-900">{clinic.name}</p>
                  <p className="text-sm text-gray-600 mt-1">{tagline || 'Sua apresentação pública para atrair novos pacientes.'}</p>
                </div>

                <div className="mt-4 space-y-2">
                  {showWhatsapp && clinic.whatsappPhoneDisplay && (
                    <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white" style={{ background: primaryColor }}>
                      <WhatsappLogo size={16} weight="fill" />
                      Falar no WhatsApp
                    </div>
                  )}
                  {showBooking && clinic.allowSelfRegistration && (
                    <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
                      Agendamento online pelo portal
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSavePage}
              disabled={upsert.isPending || isLoading}
              className="w-full px-5 py-2.5 text-sm text-white rounded-xl disabled:opacity-40 transition-all active:scale-[0.99]"
              style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
            >
              {upsert.isPending ? 'Salvando...' : 'Salvar página pública'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
