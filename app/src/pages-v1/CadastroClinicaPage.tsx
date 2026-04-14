import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Stethoscope, Buildings, CalendarBlank, CurrencyDollar,
  Users, WhatsappLogo, CheckCircle, Heartbeat,
  ArrowRight, UserCircle,
} from '@phosphor-icons/react'
import { z } from 'zod'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { IMaskInput } from 'react-imask'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { trackPublicEvent } from '../lib/publicAnalytics'
import { gtagEvent } from '../lib/gtag'
import { Seo } from '../components/seo/Seo'

const schema = z.object({
  clinicName:      z.string().min(2, 'Nome da clínica obrigatório'),
  cnpj:            z.string().optional(),
  phone:           z.string().optional(),
  email:           z.string().email('E-mail inválido'),
  responsibleName: z.string().min(2, 'Nome do responsável obrigatório'),
  message:         z.string().optional(),
})
type FormValues = z.infer<typeof schema>

// ─── Carousel slides ─────────────────────────────────────────────────────────
const slides = [
  {
    persona: 'Para gestores de clínica',
    headline: 'Sua clínica toda\norganizada em um lugar',
    sub: 'Agenda, pacientes, financeiro e equipe — tudo sem papel e sem confusão.',
    icon: <Buildings size={28} weight="duotone" className="text-blue-300" />,
    color: 'from-blue-700 to-indigo-800',
    accent: 'bg-blue-500',
    perks: [
      { icon: <CalendarBlank size={16} weight="fill" />, text: 'Agenda inteligente com confirmação automática' },
      { icon: <CurrencyDollar size={16} weight="fill" />, text: 'Financeiro integrado por profissional' },
      { icon: <Users size={16} weight="fill" />, text: 'Multi-profissionais, permissões por função' },
    ],
    mockup: [
      { label: 'Hoje',       value: '14 consultas',  color: 'bg-blue-400' },
      { label: 'Pacientes',  value: '312 ativos',    color: 'bg-indigo-400' },
      { label: 'Este mês',   value: 'R$ 22.400',     color: 'bg-sky-400' },
    ],
  },
  {
    persona: 'Para profissionais de saúde',
    headline: 'Seus atendimentos,\ndo seu jeito',
    sub: 'Veja sua agenda, os pacientes do dia e prontuários em segundos.',
    icon: <UserCircle size={28} weight="duotone" className="text-violet-300" />,
    color: 'from-violet-700 to-purple-800',
    accent: 'bg-violet-500',
    perks: [
      { icon: <CalendarBlank size={16} weight="fill" />, text: 'Agenda pessoal com disponibilidade configurável' },
      { icon: <Users size={16} weight="fill" />, text: 'Prontuário digital por paciente' },
      { icon: <WhatsappLogo size={16} weight="fill" />, text: 'Pacientes confirmam pelo WhatsApp automaticamente' },
    ],
    mockup: [
      { label: 'Amanhã',     value: '8 consultas',   color: 'bg-violet-400' },
      { label: 'Sem conflito', value: '100%',         color: 'bg-purple-400' },
      { label: 'Confirmados', value: '6 de 8',        color: 'bg-fuchsia-400' },
    ],
  },
  {
    persona: 'Para a recepção',
    headline: 'Zero ligação.\nTudo pelo WhatsApp.',
    sub: 'Pacientes confirmam, remarcam e recebem lembretes direto no celular deles.',
    icon: <WhatsappLogo size={28} weight="duotone" className="text-green-300" />,
    color: 'from-green-700 to-teal-800',
    accent: 'bg-green-500',
    perks: [
      { icon: <WhatsappLogo size={16} weight="fill" />, text: 'Lembretes automáticos D-1 e no dia' },
      { icon: <CheckCircle size={16} weight="fill" />, text: 'Confirmação em 1 mensagem, sem app' },
      { icon: <Heartbeat size={16} weight="fill" />, text: 'Redução de faltas sem esforço da equipe' },
    ],
    mockup: [
      { label: 'Enviados hoje', value: '28 lembretes', color: 'bg-green-400' },
      { label: 'Confirmados',   value: '24',            color: 'bg-teal-400' },
      { label: 'Faltas evitadas', value: '-60%',        color: 'bg-emerald-400' },
    ],
  },
]

const PERSONA_SLIDE: Record<string, number> = { gestor: 0, profissional: 1, recepcao: 2 }

function LeftPanel() {
  const [params] = useSearchParams()
  const initial = PERSONA_SLIDE[params.get('persona') ?? ''] ?? 0
  const [active, setActive] = useState(initial)

  useEffect(() => {
    const id = setInterval(() => setActive(v => (v + 1) % slides.length), 5000)
    return () => clearInterval(id)
  }, [])

  const s = slides[active]

  return (
    <div className={`relative hidden lg:flex flex-col justify-between bg-gradient-to-br ${s.color} transition-all duration-700 p-10 overflow-hidden`}>
      {/* Background decoration */}
      <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-white/5 blur-3xl" />

      {/* Logo */}
      <div className="relative z-10 flex items-center gap-2">
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <Stethoscope size={16} weight="bold" className="text-white" />
        </div>
        <span className="text-white font-bold text-lg">Consultin</span>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center py-10">
        {/* Persona tag */}
        <div className="inline-flex items-center gap-2 bg-white/15 text-white/80 text-xs font-semibold px-3 py-1.5 rounded-full mb-5 w-fit">
          {s.icon}
          {s.persona}
        </div>

        {/* Headline */}
        <h2 className="text-3xl font-extrabold text-white leading-tight mb-4 whitespace-pre-line">
          {s.headline}
        </h2>
        <p className="text-white/70 text-sm leading-relaxed mb-8 max-w-xs">{s.sub}</p>

        {/* Perks */}
        <ul className="space-y-3 mb-10">
          {s.perks.map(p => (
            <li key={p.text} className="flex items-start gap-3 text-white/85 text-sm">
              <span className="mt-0.5 text-white/60">{p.icon}</span>
              {p.text}
            </li>
          ))}
        </ul>

        {/* Mock stat card */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
          <p className="text-white/50 text-xs font-medium mb-3 uppercase tracking-wider">Visão geral</p>
          <div className="grid grid-cols-3 gap-3">
            {s.mockup.map(m => (
              <div key={m.label} className="bg-white/10 rounded-xl p-3">
                <div className={`w-2 h-2 rounded-full ${m.color} mb-2`} />
                <p className="text-white text-sm font-bold leading-tight">{m.value}</p>
                <p className="text-white/50 text-[10px] mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dots */}
      <div className="relative z-10 flex items-center gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? 'bg-white w-6' : 'bg-white/30 w-1.5'}`}
          />
        ))}
      </div>
    </div>
  )
}

export default function CadastroClinicaPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    try {
      // Submit via Edge Function (service role insert + Telegram notification)
      const { error } = await supabase.functions.invoke('submit-clinic-signup', {
        body: {
          clinicName:      values.clinicName,
          responsibleName: values.responsibleName,
          email:           values.email,
          cnpj:            values.cnpj    || undefined,
          phone:           values.phone   || undefined,
          message:         values.message || undefined,
        },
      })

      if (error) throw new Error(error.message)

      trackPublicEvent('clinic_signup_submit')
      gtagEvent('sign_up', { method: 'clinic_form' })
      navigate('/bem-vindo')
    } catch (e: unknown) {
      setServerError((e as Error).message ?? 'Erro ao enviar solicitação. Tente novamente.')
    }
  }

  return (
    <>
      <Seo
        title="Cadastro de clínica | Consultin"
        description="Peça acesso ao Consultin e comece a organizar agenda, pacientes, prontuário, financeiro e atendimento da sua clínica no Brasil."
        canonicalPath="/cadastro-clinica"
        keywords={[
          'cadastro de clínica',
          'software para clínicas',
          'sistema para consultório',
          'agenda médica online',
        ]}
      />
      <div className="min-h-screen grid lg:grid-cols-[3fr_2fr]">
        {/* Left — visual carousel */}
        <LeftPanel />

        {/* Right — form */}
        <div className="flex flex-col justify-center items-center bg-white p-8 min-h-screen lg:min-h-0">
          <div className="w-full max-w-sm">
            {/* Header */}
            <div className="flex items-center gap-2 mb-6 lg:hidden">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                <Stethoscope size={15} weight="bold" className="text-white" />
              </div>
              <span className="text-base font-bold text-gray-900">Consultin</span>
            </div>

            <h1 className="text-xl font-bold text-gray-900 mb-1">Cadastre sua clínica</h1>
            <p className="text-sm text-gray-500 mb-6">
              Preencha os dados abaixo. Nossa equipe revisará e entrará em contato em breve.
            </p>

            {/* WhatsApp shortcut */}
            <a
              href="https://wa.me/5511936213029?text=Oi%2C+quero+cadastrar+minha+cl%C3%ADnica+no+Consultin"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 w-full border border-green-200 bg-green-50 hover:bg-green-100 text-green-800 rounded-xl px-4 py-3 mb-5 transition"
            >
              <WhatsappLogo size={20} weight="fill" className="text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">Prefere pelo WhatsApp?</p>
                <p className="text-xs text-green-700/70 truncate">Nosso assistente configura tudo em 2 min</p>
              </div>
              <ArrowRight size={14} className="text-green-600 shrink-0" />
            </a>

            <div className="relative flex items-center mb-5">
              <div className="flex-1 border-t border-gray-200" />
              <span className="mx-3 text-xs text-gray-400">ou preencha o formulário</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Clinic name */}
              <Field label="Nome da clínica *" error={errors.clinicName?.message}>
                <input
                  {...register('clinicName')}
                  placeholder="Ex: Clínica Saúde & Vida"
                  className={inputClass(!!errors.clinicName)}
                />
              </Field>

              {/* CNPJ */}
              <Field label="CNPJ">
                <Controller control={control} name="cnpj" render={({ field }) => (
                  <IMaskInput
                    mask="00.000.000/0000-00"
                    value={field.value ?? ''}
                    onAccept={(val: string) => field.onChange(val)}
                    placeholder="00.000.000/0001-00"
                    className={inputClass(false)}
                  />
                )} />
              </Field>

              {/* Email */}
              <Field label="E-mail *" error={errors.email?.message}>
                <input
                  {...register('email')}
                  type="email"
                  placeholder="contato@suaclinica.com"
                  className={inputClass(!!errors.email)}
                />
              </Field>

              {/* Phone */}
              <Field label="Telefone">
                <Controller control={control} name="phone" render={({ field }) => (
                  <IMaskInput
                    mask={[{ mask: '(00) 0000-0000' }, { mask: '(00) 00000-0000' }]}
                    value={field.value ?? ''}
                    onAccept={(val: string) => field.onChange(val)}
                    placeholder="(11) 99999-9999"
                    className={inputClass(false)}
                  />
                )} />
              </Field>

              {/* Responsible name */}
              <Field label="Seu nome completo *" error={errors.responsibleName?.message}>
                <input
                  {...register('responsibleName')}
                  placeholder="Nome do responsável pela clínica"
                  className={inputClass(!!errors.responsibleName)}
                />
              </Field>

              {/* Message */}
              <Field label="Mensagem (opcional)">
                <textarea
                  {...register('message')}
                  rows={3}
                  placeholder="Conte um pouco sobre sua clínica, especialidade, número de profissionais..."
                  className={`${inputClass(false)} resize-none`}
                />
              </Field>

              {serverError && (
                <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition-colors">
                {isSubmitting ? 'Enviando solicitação...' : 'Enviar solicitação'}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-gray-500">
              Já tem acesso?{' '}
              <Link to="/login" className="text-blue-600 hover:underline font-medium">
                Fazer login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function inputClass(hasError: boolean) {
  return `w-full border rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 ${
    hasError ? 'border-red-400' : 'border-gray-300'
  }`
}

function Field({
  label, error, children, className,
}: {
  label: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
