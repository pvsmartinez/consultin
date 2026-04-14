import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Seo } from '../components/seo/Seo'
import { trackPublicEvent } from '../lib/publicAnalytics'
import { SEO_DEFAULT_IMAGE, SEO_SITE_URL } from '../lib/seo'
import {
  Stethoscope, CalendarBlank, Users, CurrencyDollar,
  ChartLine, WhatsappLogo, Heartbeat, Syringe,
  Tooth, Brain, Leaf, ArrowRight, CheckCircle,
  Sparkle, ShieldCheck, Lightning, Star,
  Buildings, UserCircle, Hospital, Headset,
} from '@phosphor-icons/react'

function trackLandingClick(event: MouseEvent<HTMLElement>) {
  if (!(event.target instanceof HTMLElement)) return

  const anchor = event.target.closest<HTMLElement>('[data-analytics-event]')

  if (!anchor) return

  const eventName = anchor.dataset.analyticsEvent
  const placement = anchor.dataset.analyticsPlacement ?? null

  if (eventName === 'login_cta_click' || eventName === 'signup_cta_click' || eventName === 'whatsapp_cta_click') {
    trackPublicEvent(eventName, {
      placement,
    })
  }
}

const homeFaqs = [
  {
    question: 'O Consultin serve para clínicas pequenas?',
    answer: 'Sim. O produto foi pensado para clínicas e consultórios brasileiros que precisam organizar agenda, pacientes, financeiro e equipe sem implantar um sistema pesado.',
  },
  {
    question: 'O sistema ajuda a reduzir faltas?',
    answer: 'Sim. O Consultin centraliza agenda e comunicação com suporte a confirmações e lembretes, o que ajuda a diminuir ausências e retrabalho da recepção.',
  },
  {
    question: 'Dá para usar em diferentes especialidades?',
    answer: 'Sim. O fluxo foi desenhado para odontologia, psicologia, estética, fisioterapia, clínica geral e outras operações de atendimento recorrente.',
  },
  {
    question: 'Preciso instalar alguma coisa?',
    answer: 'Não. A operação principal roda no navegador, com acesso simples para gestores, recepção e profissionais da clínica.',
  },
  {
    question: 'Posso cadastrar minha clínica pelo WhatsApp?',
    answer: 'Sim. Nosso assistente no WhatsApp cria sua conta, configura a clínica e envia o link de acesso em menos de 2 minutos — sem precisar preencher nenhum formulário.',
  },
]

const homeStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'Consultin',
      url: SEO_SITE_URL,
      image: SEO_DEFAULT_IMAGE,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'pt-BR',
      areaServed: 'BR',
      description: 'Software de gestão para clínicas e consultórios no Brasil com agenda, prontuário, financeiro e atendimento em um só lugar.',
      keywords: 'software para clínicas, sistema para consultório, agenda médica online, prontuário eletrônico, gestão de clínicas',
      offers: {
        '@type': 'Offer',
        availability: 'https://schema.org/InStock',
        priceCurrency: 'BRL',
        url: `${SEO_SITE_URL}/cadastro-clinica`,
      },
      publisher: {
        '@type': 'Organization',
        name: 'Consultin',
        url: SEO_SITE_URL,
      },
    },
    {
      '@type': 'Organization',
      name: 'Consultin',
      url: SEO_SITE_URL,
      logo: SEO_DEFAULT_IMAGE,
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'suporte@consultin.com.br',
        areaServed: 'BR',
        availableLanguage: 'pt-BR',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: homeFaqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    },
  ],
}

// ─── Navbar ──────────────────────────────────────────────────────────────────
function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Stethoscope size={18} weight="bold" className="text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">Consultin</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6 text-sm text-gray-600">
          <a href="#funcionalidades" className="hover:text-blue-600 transition">Funcionalidades</a>
          <a href="#como-funciona" className="hover:text-blue-600 transition">Como funciona</a>
          <a href="#precos" className="hover:text-blue-600 transition">Preços</a>
          <a href="#especialidades" className="hover:text-blue-600 transition">Especialidades</a>
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <Link to="/login"
            data-analytics-event="login_cta_click"
            data-analytics-placement="navbar-desktop"
            className="text-sm text-gray-600 hover:text-blue-600 font-medium transition px-3 py-2">
            Entrar
          </Link>
          <Link to="/cadastro-clinica"
            data-analytics-event="signup_cta_click"
            data-analytics-placement="navbar-desktop"
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition shadow-sm">
            Cadastrar clínica
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden p-2 text-gray-500"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Menu"
        >
          <div className="space-y-1.5">
            <span className={`block w-5 h-0.5 bg-current transition-transform ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-5 h-0.5 bg-current transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-current transition-transform ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </div>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3">
          <a href="#funcionalidades" className="block text-sm text-gray-600 py-2" onClick={() => setMenuOpen(false)}>Funcionalidades</a>
          <a href="#como-funciona" className="block text-sm text-gray-600 py-2" onClick={() => setMenuOpen(false)}>Como funciona</a>
          <a href="#precos" className="block text-sm text-gray-600 py-2" onClick={() => setMenuOpen(false)}>Preços</a>
          <a href="#especialidades" className="block text-sm text-gray-600 py-2" onClick={() => setMenuOpen(false)}>Especialidades</a>
          <div className="flex gap-2 pt-2">
            <Link to="/login" data-analytics-event="login_cta_click" data-analytics-placement="navbar-mobile" className="flex-1 text-sm text-center border border-gray-300 text-gray-700 font-medium px-4 py-2.5 rounded-lg">Entrar</Link>
            <Link to="/cadastro-clinica" data-analytics-event="signup_cta_click" data-analytics-placement="navbar-mobile" className="flex-1 text-sm text-center bg-blue-600 text-white font-medium px-4 py-2.5 rounded-lg">Cadastrar</Link>
          </div>
        </div>
      )}
    </nav>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="pt-24 pb-16 md:pt-32 md:pb-24 bg-gradient-to-br from-blue-50 via-white to-indigo-50 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Text content */}
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
              <Sparkle size={13} weight="fill" />
              Plataforma completa para clínicas brasileiras
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              Sua clínica{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                organizada
              </span>{' '}
              do jeito certo
            </h1>

            <p className="text-lg text-gray-500 mb-8 leading-relaxed">
              Agenda inteligente, prontuários digitais, gestão financeira e WhatsApp
              integrado — tudo em um só lugar para você focar no que importa:
              seus pacientes.
            </p>

            {/* Main CTAs */}
            <div className="flex flex-wrap gap-3 mb-8">
              <Link to="/cadastro-clinica"
                data-analytics-event="signup_cta_click"
                data-analytics-placement="hero-primary"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3.5 rounded-xl shadow-lg shadow-blue-200 transition text-sm">
                Começar gratuitamente
                <ArrowRight size={16} weight="bold" />
              </Link>
              <a href={WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                data-analytics-event="whatsapp_cta_click"
                data-analytics-placement="hero-whatsapp"
                className="inline-flex items-center gap-2 border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 font-medium px-6 py-3.5 rounded-xl transition text-sm">
                <WhatsappLogo size={18} weight="fill" />
                Cadastrar pelo WhatsApp
              </a>
            </div>

            {/* Profile type selector */}
            <div className="flex flex-wrap gap-3">
              <p className="w-full text-xs font-medium text-gray-400 uppercase tracking-wider">Quem você é?</p>
              <Link to="/cadastro-clinica" data-analytics-event="signup_cta_click" data-analytics-placement="persona-manager" className="group flex items-center gap-2 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-600 hover:text-blue-700 text-sm font-medium px-4 py-2.5 rounded-xl transition">
                <Buildings size={18} className="text-blue-500" />
                Sou gestor de clínica
              </Link>
              <Link to="/login" data-analytics-event="login_cta_click" data-analytics-placement="persona-professional" className="group flex items-center gap-2 bg-white border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 text-sm font-medium px-4 py-2.5 rounded-xl transition">
                <UserCircle size={18} className="text-indigo-500" />
                Sou profissional de saúde
              </Link>
              <Link to="/login" data-analytics-event="login_cta_click" data-analytics-placement="persona-patient" className="group flex items-center gap-2 bg-white border border-gray-200 hover:border-teal-400 hover:bg-teal-50 text-gray-600 hover:text-teal-700 text-sm font-medium px-4 py-2.5 rounded-xl transition">
                <Heartbeat size={18} className="text-teal-500" />
                Sou paciente
              </Link>
            </div>
          </div>

          {/* Visual mockup */}
          <div className="relative hidden md:block">
            <div className="relative z-10 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
              {/* Fake app header */}
              <div className="bg-gray-50 border-b border-gray-100 px-5 py-3 flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 bg-gray-200 h-5 rounded-md mx-8" />
              </div>

              {/* Fake dashboard content */}
              <div className="flex">
                {/* Sidebar */}
                <div className="w-14 bg-white border-r border-gray-100 py-4 flex flex-col items-center gap-5">
                  <div className="w-6 h-6 bg-blue-600 rounded-lg" />
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-5 h-5 bg-gray-200 rounded-md" />
                  ))}
                </div>

                {/* Content */}
                <div className="flex-1 p-5">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: 'Hoje', value: '12', color: 'bg-blue-500' },
                      { label: 'Pacientes', value: '438', color: 'bg-indigo-500' },
                      { label: 'Este mês', value: 'R$ 18k', color: 'bg-emerald-500' },
                    ].map(stat => (
                      <div key={stat.label} className="bg-gray-50 rounded-xl p-3">
                        <div className={`w-2 h-2 rounded-full ${stat.color} mb-2`} />
                        <p className="text-xs font-bold text-gray-800">{stat.value}</p>
                        <p className="text-[10px] text-gray-400">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Calendar preview */}
                  <div className="bg-gray-50 rounded-xl p-3 mb-3">
                    <p className="text-xs font-medium text-gray-600 mb-2">Próximas consultas</p>
                    {[
                      { time: '09:00', name: 'Maria Silva', type: 'Consulta' },
                      { time: '10:30', name: 'João Santos', type: 'Retorno' },
                      { time: '14:00', name: 'Ana Lima', type: 'Avaliação' },
                    ].map(appt => (
                      <div key={appt.time} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-blue-600 font-mono font-medium w-10">{appt.time}</span>
                          <span className="text-[10px] text-gray-700">{appt.name}</span>
                        </div>
                        <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">{appt.type}</span>
                      </div>
                    ))}
                  </div>

                  {/* Chart preview */}
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-medium text-gray-600 mb-2">Receita — últimos 7 dias</p>
                    <div className="flex items-end gap-1 h-10">
                      {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                        <div key={i}
                          className="flex-1 bg-blue-500 rounded-sm opacity-80"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Decorative blobs */}
            <div className="absolute -top-8 -right-8 w-64 h-64 bg-blue-200 rounded-full blur-3xl opacity-40 -z-10" />
            <div className="absolute -bottom-8 -left-8 w-48 h-48 bg-indigo-200 rounded-full blur-3xl opacity-40 -z-10" />

            {/* Floating badges */}
            <div className="absolute -left-6 top-1/3 bg-white rounded-xl shadow-lg px-3 py-2 flex items-center gap-2 text-xs font-medium text-gray-700 border border-gray-100">
              <CalendarBlank size={16} className="text-blue-500" weight="fill" />
              245 agendamentos este mês
            </div>
            <div className="absolute -right-4 bottom-1/4 bg-white rounded-xl shadow-lg px-3 py-2 flex items-center gap-2 text-xs font-medium text-gray-700 border border-gray-100">
              <WhatsappLogo size={16} className="text-green-500" weight="fill" />
              WhatsApp integrado
            </div>
          </div>
        </div>

        {/* Social proof */}
        <div className="mt-16 pt-8 border-t border-gray-200">
          <p className="text-center text-xs font-medium text-gray-400 uppercase tracking-wider mb-5">
            Confie nas mesmas ferramentas que clínicas usam para crescer
          </p>
          <div className="flex flex-wrap justify-center items-center gap-6 md:gap-12">
            {[
              { icon: <Tooth size={18} />, label: 'Odontologia' },
              { icon: <Heartbeat size={18} />, label: 'Cardiologia' },
              { icon: <Brain size={18} />, label: 'Psicologia' },
              { icon: <Leaf size={18} />, label: 'Estética' },
              { icon: <Syringe size={18} />, label: 'Fisioterapia' },
              { icon: <Hospital size={18} />, label: 'Clínica Geral' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2 text-gray-400 text-sm">
                {s.icon}
                {s.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Features ─────────────────────────────────────────────────────────────────
const features = [
  {
    icon: <CalendarBlank size={24} weight="duotone" />,
    color: 'text-blue-600 bg-blue-50',
    title: 'Agenda inteligente',
    desc: 'Visualização por dia, semana ou mês. Confirmação automática via WhatsApp. Sem conflitos, sem faltas.',
  },
  {
    icon: <Users size={24} weight="duotone" />,
    color: 'text-indigo-600 bg-indigo-50',
    title: 'Prontuários digitais',
    desc: 'Histórico completo de cada paciente. Fichas de anamnese personalizáveis por especialidade.',
  },
  {
    icon: <CurrencyDollar size={24} weight="duotone" />,
    color: 'text-emerald-600 bg-emerald-50',
    title: 'Financeiro integrado',
    desc: 'Cobranças via Pix e cartão, repasse para profissionais, fluxo de caixa em tempo real.',
  },
  {
    icon: <WhatsappLogo size={24} weight="duotone" />,
    color: 'text-green-600 bg-green-50',
    title: 'WhatsApp Business',
    desc: 'Lembretes e confirmações automáticos. Inbox centralizado para atender todos os chats da clínica.',
  },
  {
    icon: <ChartLine size={24} weight="duotone" />,
    color: 'text-violet-600 bg-violet-50',
    title: 'Relatórios detalhados',
    desc: 'Receita por profissional, taxa de ocupação, evolução de novos pacientes e muito mais.',
  },
  {
    icon: <ShieldCheck size={24} weight="duotone" />,
    color: 'text-rose-600 bg-rose-50',
    title: 'Multi-usuário seguro',
    desc: 'Permissões granulares por função: admin, profissional, recepcionista. Cada um vê só o que deve.',
  },
]

function Features() {
  return (
    <section id="funcionalidades" className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            <Lightning size={13} weight="fill" />
            Tudo que sua clínica precisa
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Uma plataforma completa,{' '}
            <span className="text-blue-600">sem complicação</span>
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Do primeiro agendamento ao fechamento financeiro do mês — o Consultin
            acompanha cada etapa da jornada da sua clínica.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(f => (
            <div key={f.title}
              className="group p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
              <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 ${f.color}`}>
                {f.icon}
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── How it works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      step: '01',
      title: 'Cadastre sua clínica',
      desc: 'Preencha os dados básicos e escolha seu tipo de especialidade. Leva menos de 2 minutos.',
      icon: <Buildings size={28} weight="duotone" className="text-blue-600" />,
    },
    {
      step: '02',
      title: 'Configure sua equipe',
      desc: 'Convide os profissionais da sua clínica por e-mail. Cada um tem seu acesso e agenda.',
      icon: <Users size={28} weight="duotone" className="text-indigo-600" />,
    },
    {
      step: '03',
      title: 'Comece a atender',
      desc: 'Crie agendamentos, cadastre pacientes e acompanhe o crescimento da sua clínica em tempo real.',
      icon: <CalendarBlank size={28} weight="duotone" className="text-emerald-600" />,
    },
  ]

  return (
    <section id="como-funciona" className="py-20 bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Simples de começar
          </h2>
          <p className="text-gray-500">Sua clínica pronta em minutos, não em semanas.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((s, i) => (
            <div key={s.step} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-6 left-[calc(100%_-_16px)] w-8 border-t-2 border-dashed border-blue-200 z-0" />
              )}
              <div className="relative z-10 bg-white rounded-2xl p-7 border border-gray-100 shadow-sm text-center hover:shadow-lg transition">
                <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  {s.icon}
                </div>
                <div className="text-xs font-bold text-blue-400 tracking-widest mb-2">{s.step}</div>
                <h3 className="text-base font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── WhatsApp Onboarding ────────────────────────────────────────────────────
const WA_LINK = 'https://wa.me/5511936213029?text=Oi%2C+quero+cadastrar+minha+cl%C3%ADnica+no+Consultin'

function WhatsAppOnboarding() {
  const steps = [
    {
      step: '01',
      title: 'Mande uma mensagem',
      desc: 'Envie "Oi" para o nosso assistente no WhatsApp. Sem formulário, sem senha — só uma conversa.',
    },
    {
      step: '02',
      title: 'Assistente configura tudo',
      desc: 'Nosso agente de IA pergunta o nome da clínica, especialidade e cria sua conta em segundos.',
    },
    {
      step: '03',
      title: 'Acesse o painel',
      desc: 'Você recebe o link de acesso direto para o Consultin. Clínica pronta para operar.',
    },
  ]

  return (
    <section id="whatsapp-onboarding" className="py-20 bg-green-50">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            <WhatsappLogo size={13} weight="fill" />
            Mais fácil do que você imagina
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Cadastre sua clínica{' '}
            <span className="text-green-600">pelo WhatsApp</span>
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Prefere não preencher formulário? Nosso assistente cria tudo pra você numa conversa simples.
            Em menos de 2 minutos sua clínica já está no ar.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {steps.map((s, i) => (
            <div key={s.step} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-6 left-[calc(100%_-_16px)] w-8 border-t-2 border-dashed border-green-200 z-0" />
              )}
              <div className="relative z-10 bg-white rounded-2xl p-7 border border-green-100 shadow-sm text-center hover:shadow-lg transition">
                <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <WhatsappLogo size={28} weight="duotone" className="text-green-600" />
                </div>
                <div className="text-xs font-bold text-green-400 tracking-widest mb-2">{s.step}</div>
                <h3 className="text-base font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            data-analytics-event="whatsapp_cta_click"
            data-analytics-placement="wa-section-cta"
            className="inline-flex items-center gap-3 bg-green-500 hover:bg-green-600 text-white font-bold px-8 py-4 rounded-xl shadow-lg shadow-green-200 transition text-base"
          >
            <WhatsappLogo size={22} weight="fill" />
            Começar pelo WhatsApp
          </a>
          <p className="text-xs text-gray-400">Grátis por 7 dias · Sem cartão de crédito</p>
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ─────────────────────────────────────────────────────────────────
const plans = [
  {
    name: 'Básico',
    price: 100,
    limit: 'Até 40 consultas/mês',
    color: 'border-gray-200',
    highlight: false,
    perks: [
      'Agenda online',
      'Cadastro de pacientes',
      'Controle financeiro',
      'Lembretes via WhatsApp',
      'Suporte por e-mail',
    ],
  },
  {
    name: 'Profissional',
    price: 200,
    limit: 'Até 100 consultas/mês',
    color: 'border-blue-500',
    highlight: true,
    perks: [
      'Agenda online',
      'Cadastro de pacientes',
      'Controle financeiro',
      'Lembretes via WhatsApp',
      'Relatórios avançados',
      'Múltiplos profissionais',
      'Suporte prioritário',
    ],
  },
  {
    name: 'Ilimitado',
    price: 300,
    limit: 'Consultas ilimitadas',
    color: 'border-gray-200',
    highlight: false,
    perks: [
      'Agenda online',
      'Cadastro de pacientes',
      'Controle financeiro',
      'Lembretes via WhatsApp',
      'Relatórios avançados',
      'Múltiplos profissionais',
      'Suporte dedicado',
    ],
  },
]

function Pricing() {
  return (
    <section id="precos" className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            <Sparkle size={13} weight="fill" />
            7 dias grátis em todos os planos
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Planos que crescem com{' '}
            <span className="text-blue-600">a sua clínica</span>
          </h2>
          <p className="text-gray-500 max-w-md mx-auto">
            Comece de graça por 7 dias. Sem cartão de crédito para testar.
            Escolha o plano ideal para o volume de atendimentos da sua clínica.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border-2 p-7 flex flex-col gap-6 ${
                plan.highlight
                  ? 'border-blue-500 shadow-xl shadow-blue-100'
                  : 'border-gray-200'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full shadow">
                    Mais popular
                  </span>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-gray-500 mb-1">{plan.name}</p>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-extrabold text-gray-900">R$&nbsp;{plan.price}</span>
                  <span className="text-gray-400 text-sm mb-1.5">/mês</span>
                </div>
                <p className="text-sm text-blue-600 font-medium">{plan.limit}</p>
              </div>

              <ul className="space-y-3 flex-1">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2.5 text-sm text-gray-700">
                    <CheckCircle
                      size={17}
                      weight="fill"
                      className={plan.highlight ? 'text-blue-500' : 'text-emerald-500'}
                    />
                    {perk}
                  </li>
                ))}
                <li className="flex items-center gap-2.5 text-sm text-gray-700">
                  <Headset
                    size={17}
                    weight="fill"
                    className={plan.highlight ? 'text-blue-500' : 'text-emerald-500'}
                  />
                  Acesso ao suporte
                </li>
              </ul>

              <Link
                to="/cadastro-clinica"
                data-analytics-event="signup_cta_click"
                data-analytics-placement={`pricing-${plan.name.toLowerCase()}`}
                className={`w-full text-center py-3 rounded-xl font-semibold text-sm transition ${
                  plan.highlight
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                Começar 7 dias grátis
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Cobrança mensal · Cancele quando quiser · Sem taxa de cancelamento
        </p>
      </div>
    </section>
  )
}

// ─── Specialties ─────────────────────────────────────────────────────────────
function Specialties() {
  const types = [
    { icon: <Tooth size={32} weight="duotone" />, name: 'Odontologia', color: 'text-sky-600 bg-sky-50' },
    { icon: <Brain size={32} weight="duotone" />, name: 'Psicologia', color: 'text-violet-600 bg-violet-50' },
    { icon: <Heartbeat size={32} weight="duotone" />, name: 'Cardiologia', color: 'text-rose-600 bg-rose-50' },
    { icon: <Leaf size={32} weight="duotone" />, name: 'Estética', color: 'text-emerald-600 bg-emerald-50' },
    { icon: <Syringe size={32} weight="duotone" />, name: 'Fisioterapia', color: 'text-orange-600 bg-orange-50' },
    { icon: <Hospital size={32} weight="duotone" />, name: 'Clínica geral', color: 'text-blue-600 bg-blue-50' },
    { icon: <Stethoscope size={32} weight="duotone" />, name: 'medicina ocupacional', color: 'text-indigo-600 bg-indigo-50' },
    { icon: <Star size={32} weight="duotone" />, name: 'E muito mais…', color: 'text-amber-600 bg-amber-50' },
  ]

  return (
    <section id="especialidades" className="py-20 bg-white">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Para qualquer especialidade
          </h2>
          <p className="text-gray-500 max-w-lg mx-auto">
            O Consultin se adapta ao vocabulário da sua área. Campos, fluxos e relatórios
            configurados para a sua realidade.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {types.map(t => (
            <div key={t.name}
              className="flex flex-col items-center gap-3 p-5 bg-gray-50 rounded-2xl hover:bg-white hover:shadow-md transition border border-transparent hover:border-gray-100">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${t.color}`}>
                {t.icon}
              </div>
              <p className="text-sm font-medium text-gray-700 text-center capitalize">{t.name}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Trust bar ─────────────────────────────────────────────────────────────
function TrustBar() {
  const items = [
    { icon: <ShieldCheck size={20} weight="fill" className="text-blue-600" />, text: 'Dados criptografados e seguros' },
    { icon: <Lightning size={20} weight="fill" className="text-yellow-500" />, text: 'Sem instalação — funciona no navegador' },
    { icon: <CheckCircle size={20} weight="fill" className="text-emerald-500" />, text: 'Suporte em português' },
  ]

  return (
    <section className="py-12 bg-blue-600">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex flex-wrap justify-center gap-8">
          {items.map(item => (
            <div key={item.text} className="flex items-center gap-2 text-white text-sm font-medium">
              {item.icon}
              {item.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SearchIntentSection() {
  const pages = [
    {
      href: '/sistema-para-clinicas',
      title: 'Sistema para clínicas',
      description: 'Página focada em gestão, operação e crescimento de clínicas brasileiras.',
    },
    {
      href: '/software-para-consultorios',
      title: 'Software para consultórios',
      description: 'Conteúdo direcionado a consultórios enxutos que precisam de mais controle sem burocracia.',
    },
    {
      href: '/agenda-medica-online',
      title: 'Agenda médica online',
      description: 'Fluxo de agendamento, confirmação e produtividade da recepção em uma página dedicada.',
    },
  ]

  return (
    <section className="py-20 bg-slate-50 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4">
        <div className="max-w-2xl mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 mb-3">
            Guias públicos
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Páginas feitas para quem está pesquisando solução para clínica no Brasil
          </h2>
          <p className="text-gray-500 leading-relaxed">
            Se você ainda está comparando opções, estes guias resumem os problemas mais comuns da
            operação de clínica e mostram onde o Consultin entra na rotina.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {pages.map((page) => (
            <a
              key={page.href}
              href={page.href}
              className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <p className="text-sm font-semibold text-blue-600 mb-3">Leitura recomendada</p>
              <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-blue-700 transition">
                {page.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-5">{page.description}</p>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition">
                Abrir página
                <ArrowRight size={16} weight="bold" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

function UseCaseSection() {
  const pages = [
    {
      href: '/clinica-odontologica',
      title: 'Clínica odontológica',
      description: 'Agenda recorrente, retorno, encaixes e coordenação entre recepção, profissional e financeiro.',
    },
    {
      href: '/clinica-de-psicologia',
      title: 'Clínica de psicologia',
      description: 'Fluxo para sessões recorrentes, agenda previsível, faltas e organização de pacientes.',
    },
    {
      href: '/clinica-de-estetica',
      title: 'Clínica de estética',
      description: 'Operação com procedimentos, recorrência, pacotes e rotina comercial mais próxima do atendimento.',
    },
    {
      href: '/clinica-de-fisioterapia',
      title: 'Clínica de fisioterapia',
      description: 'Visão clara de tratamentos em série, agenda da equipe e ocupação da clínica no dia a dia.',
    },
  ]

  return (
    <section className="py-20 bg-white border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4">
        <div className="max-w-2xl mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600 mb-3">
            Casos de uso
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Landings para realidades específicas de clínicas brasileiras
          </h2>
          <p className="text-gray-500 leading-relaxed">
            O Consultin não serve para um único tipo de operação. Estas páginas explicam o produto
            na linguagem de especialidades e rotinas que aparecem com frequência na busca orgânica.
          </p>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
          {pages.map((page) => (
            <a
              key={page.href}
              href={page.href}
              className="group rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm transition hover:-translate-y-1 hover:bg-white hover:shadow-xl"
            >
              <p className="text-sm font-semibold text-indigo-600 mb-3">Página por especialidade</p>
              <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-indigo-700 transition">
                {page.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-5">{page.description}</p>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition">
                Ver caso de uso
                <ArrowRight size={16} weight="bold" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQSection() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 mb-3">
            Perguntas frequentes
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Dúvidas comuns de clínicas e consultórios
          </h2>
          <p className="text-gray-500">
            Respostas objetivas para quem está avaliando um software de gestão em português.
          </p>
        </div>

        <div className="space-y-4">
          {homeFaqs.map((faq) => (
            <article key={faq.question} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">{faq.question}</h3>
              <p className="text-sm leading-relaxed text-gray-600">{faq.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Final CTA ───────────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="py-24 bg-gradient-to-br from-blue-600 to-indigo-700">
      <div className="max-w-3xl mx-auto px-4 text-center">
        <div className="inline-flex items-center gap-2 bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          <Sparkle size={13} weight="fill" />
          Comece agora mesmo
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-5 leading-tight">
          Sua clínica merece uma gestão à altura
        </h2>
        <p className="text-blue-100 text-lg mb-10 leading-relaxed">
          Simplifique o dia a dia da sua equipe, melhore a experiência dos seus pacientes
          e tome decisões com dados — não com papel.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/cadastro-clinica"
            data-analytics-event="signup_cta_click"
            data-analytics-placement="final-cta"
            className="inline-flex items-center gap-2 bg-white text-blue-700 hover:bg-blue-50 font-bold px-8 py-4 rounded-xl shadow-lg transition text-sm">
            Cadastrar minha clínica
            <ArrowRight size={16} weight="bold" />
          </Link>
          <a href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            data-analytics-event="whatsapp_cta_click"
            data-analytics-placement="final-cta-whatsapp"
            className="inline-flex items-center gap-2 border-2 border-white/40 text-white hover:bg-white/10 font-medium px-8 py-4 rounded-xl transition text-sm">
            <WhatsappLogo size={18} weight="fill" />
            Começar pelo WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-gray-950 text-gray-400 py-12">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                <Stethoscope size={15} weight="bold" className="text-white" />
              </div>
              <span className="text-white font-bold">Consultin</span>
            </div>
            <p className="text-sm max-w-xs leading-relaxed">
              A plataforma de gestão que clínicas brasileiras usam para crescer com
              organização e tecnologia.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
            <div>
              <p className="text-white font-medium mb-3">Produto</p>
              <ul className="space-y-2">
                <li><a href="#funcionalidades" className="hover:text-white transition">Funcionalidades</a></li>
                <li><a href="#como-funciona" className="hover:text-white transition">Como funciona</a></li>
                <li><a href="#precos" className="hover:text-white transition">Preços</a></li>
                <li><a href="#especialidades" className="hover:text-white transition">Especialidades</a></li>
              </ul>
            </div>
            <div>
              <p className="text-white font-medium mb-3">Acesso</p>
              <ul className="space-y-2">
                <li><Link to="/login" data-analytics-event="login_cta_click" data-analytics-placement="footer" className="hover:text-white transition">Entrar</Link></li>
                <li><Link to="/cadastro-clinica" data-analytics-event="signup_cta_click" data-analytics-placement="footer" className="hover:text-white transition">Cadastrar clínica</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-white font-medium mb-3">Suporte</p>
              <ul className="space-y-2">
                <li><a href="mailto:suporte@consultin.com.br" className="hover:text-white transition">Contato</a></li>
                <li><a href="/politica-de-privacidade" className="hover:text-white transition">Privacidade</a></li>
                <li><a href="/termos-de-uso" className="hover:text-white transition">Termos de Uso</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <p>© {new Date().getFullYear()} Consultin. Todos os direitos reservados.</p>
          <p>Feito com ❤️ para clínicas brasileiras</p>
        </div>
      </div>
    </footer>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <>
      <Seo
        title="Consultin | Software de gestão para clínicas no Brasil"
        description="Software para clínicas e consultórios brasileiros com agenda médica, prontuário, financeiro, equipe e atendimento em um só lugar."
        canonicalPath="/"
        keywords={[
          'software para clínicas',
          'sistema para consultório',
          'agenda médica online',
          'gestão de clínicas',
          'prontuário eletrônico para clínicas',
        ]}
        structuredData={homeStructuredData}
      />
      <div className="min-h-screen" onClickCapture={trackLandingClick}>
        <Navbar />
        <main>
          <Hero />
          <Features />
          <HowItWorks />
          <WhatsAppOnboarding />
          <Pricing />
          <Specialties />
          <UseCaseSection />
          <SearchIntentSection />
          <FAQSection />
          <TrustBar />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </>
  )
}
