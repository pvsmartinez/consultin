import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Stethoscope, Buildings, CalendarBlank, CurrencyDollar,
  Users, WhatsappLogo, CheckCircle, Heartbeat,
  ArrowRight, UserCircle, Eye, EyeSlash,
} from '@phosphor-icons/react'
import { z } from 'zod'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { IMaskInput } from 'react-imask'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { trackPublicEvent } from '../lib/publicAnalytics'
import { gtagEvent } from '../lib/gtag'
import { sendEmailVerificationLink } from '../lib/emailVerification'
import { Seo } from '../components/seo/Seo'

const schema = z.object({
  clinicName:      z.string().min(2, 'Nome obrigatório'),
  cnpj:            z.string().optional(),
  phone:           z.string().optional(),
  email:           z.string().email('E-mail inválido'),
  password:        z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
  confirmPassword: z.string().min(1, 'Confirme sua senha'),
  responsibleName: z.string().optional(),
}).refine(values => values.password === values.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
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
    persona: 'Para profissionais liberais',
    headline: 'Trabalhe sozinho.\nOpere como clínica.',
    sub: 'Gerencie sua agenda, seus pacientes e seu financeiro sem depender de secretária ou planilha.',
    icon: <UserCircle size={28} weight="duotone" className="text-violet-300" />,
    color: 'from-violet-700 to-purple-800',
    accent: 'bg-violet-500',
    perks: [
      { icon: <CalendarBlank size={16} weight="fill" />, text: 'Agenda própria com link de agendamento' },
      { icon: <WhatsappLogo size={16} weight="fill" />, text: 'Pacientes confirmam sozinhos via WhatsApp' },
      { icon: <CurrencyDollar size={16} weight="fill" />, text: 'Controle financeiro sem contador nem planilha' },
    ],
    mockup: [
      { label: 'Esta semana', value: '24 consultas',  color: 'bg-violet-400' },
      { label: 'Confirmados', value: '22 de 24',      color: 'bg-purple-400' },
      { label: 'Recebido',    value: 'R$ 6.800',      color: 'bg-fuchsia-400' },
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
  const [params] = useSearchParams()
  const [serverError, setServerError] = useState<string | null>(null)
  const [emailAlreadyExists, setEmailAlreadyExists] = useState(false)
  const [isSolo, setIsSolo] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const personaIndex = PERSONA_SLIDE[params.get('persona') ?? ''] ?? 0
  const activePersona = slides[personaIndex]

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    setEmailAlreadyExists(false)
    try {
      // Submit via Edge Function (service role insert + Telegram notification)
      const { error } = await supabase.functions.invoke('submit-clinic-signup', {
        body: {
          clinicName:          values.clinicName,
          responsibleName:     isSolo ? values.clinicName : (values.responsibleName || values.clinicName),
          email:               values.email,
          password:            values.password,
          cnpj:                values.cnpj    || undefined,
          phone:               values.phone   || undefined,
          isSoloPractitioner:  isSolo,
        },
      })

      if (error) {
        // Parse body — supabase.functions returns raw body text as error.message
        let msg: string = error.message ?? ''
        try { msg = (JSON.parse(msg) as { error?: string }).error ?? msg } catch { /* not JSON */ }
        if (msg.includes('já possui uma conta')) {
          setEmailAlreadyExists(true)
          return
        }
        throw new Error(msg)
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email:    values.email.trim().toLowerCase(),
        password: values.password,
      })
      if (signInError) {
        throw new Error('Conta criada, mas não foi possível entrar automaticamente. Faça login com seu e-mail e senha.')
      }

      const { error: verificationError } = await sendEmailVerificationLink(values.email.trim().toLowerCase())
      if (verificationError) {
        console.error('Email verification send failed:', verificationError)
      }

      trackPublicEvent('clinic_signup_submit')
      gtagEvent('sign_up', { method: 'clinic_form' })
      navigate('/', { replace: true })
    } catch (e: unknown) {
      setServerError((e as Error).message ?? 'Erro ao enviar solicitação. Tente novamente.')
    }
  }

  return (
    <>
      <Seo
        title="Criar conta | Consultin"
        description="Crie sua conta no Consultin e comece agora a organizar agenda, pacientes, prontuário e financeiro da sua clínica ou consultório."
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

            <h1 className="text-xl font-bold text-gray-900 mb-1">Criar sua conta</h1>
            <p className="text-sm text-gray-500 mb-6">
              Preencha os dados, escolha sua senha e acesse na hora.
            </p>

            <div className="lg:hidden mb-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 mb-3 shadow-sm">
                {activePersona.icon}
                {activePersona.persona}
              </div>
              <p className="text-sm font-semibold text-gray-900 mb-1">{activePersona.sub}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {activePersona.perks.map(perk => (
                  <span key={perk.text} className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-gray-600 shadow-sm">
                    {perk.text}
                  </span>
                ))}
              </div>
            </div>

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
              {/* Solo / Clinic toggle */}
              <div className="flex items-center border border-gray-200 rounded-xl p-1 bg-gray-50 gap-1">
                <button
                  type="button"
                  onClick={() => setIsSolo(false)}
                  className={`flex-1 py-3 text-sm font-medium rounded-lg transition-colors ${!isSolo ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Tenho uma clínica
                </button>
                <button
                  type="button"
                  onClick={() => setIsSolo(true)}
                  className={`flex-1 py-3 text-sm font-medium rounded-lg transition-colors ${isSolo ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Profissional liberal
                </button>
              </div>

              {/* Clinic / professional name */}
              <Field label={isSolo ? 'Seu nome profissional *' : 'Nome da clínica *'} error={errors.clinicName?.message}>
                <input
                  {...register('clinicName')}
                  placeholder={isSolo ? 'Ex: Dra. Ana Costa' : 'Ex: Clínica Saúde & Vida'}
                  className={inputClass(!!errors.clinicName)}
                />
              </Field>

              {/* CNPJ / CPF */}
              <Field label={isSolo ? 'CPF (opcional)' : 'CNPJ'}>
                <Controller control={control} name="cnpj" render={({ field }) => (
                  <IMaskInput
                    mask={isSolo ? '000.000.000-00' : '00.000.000/0000-00'}
                    value={field.value ?? ''}
                    onAccept={(val: string) => field.onChange(val)}
                    placeholder={isSolo ? '000.000.000-00' : '00.000.000/0001-00'}
                    className={inputClass(false)}
                  />
                )} />
              </Field>

              {/* Email */}
              <Field label="E-mail *" error={errors.email?.message}>
                <input
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                  placeholder="contato@suaclinica.com"
                  className={inputClass(!!errors.email)}
                />
              </Field>

              <Field label="Senha *" error={errors.password?.message}>
                <div className="relative">
                  <input
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    className={`${inputClass(!!errors.password)} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(current => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>

              <Field label="Confirmar senha *" error={errors.confirmPassword?.message}>
                <input
                  {...register('confirmPassword')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repita sua senha"
                  className={inputClass(!!errors.confirmPassword)}
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

              <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <p className="font-semibold mb-1">Você já entra direto no sistema.</p>
                <p className="text-blue-800/80 leading-relaxed">
                  Sem esperar aprovação, sem e-mail travando o teste. O objetivo aqui é você conseguir usar e experimentar agora.
                </p>
              </div>

              {/* Responsible name — hidden for solo (clinicName IS the person) */}
              {!isSolo && (
                <Field label="Nome do responsável *" error={errors.responsibleName?.message}>
                  <input
                    {...register('responsibleName')}
                    placeholder="Nome do responsável pela clínica"
                    className={inputClass(!!errors.responsibleName)}
                  />
                </Field>
              )}

              {emailAlreadyExists && (
                <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-amber-800 font-medium">Este e-mail já possui uma conta.</p>
                  <p className="text-amber-700 mt-0.5">
                    <Link to="/login" className="underline font-medium">Faça login</Link>
                    {' '}para acessar sua clínica.
                  </p>
                </div>
              )}

              {serverError && (
                <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition-colors">
                {isSubmitting ? 'Criando sua conta...' : 'Criar conta e entrar'}
              </button>

              <p className="text-xs text-center text-gray-500 leading-relaxed">
                Você entra agora e pode validar seu e-mail depois, sem travar o primeiro acesso.
              </p>
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
  return `w-full border rounded-lg px-3 py-3 text-base text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 ${
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
