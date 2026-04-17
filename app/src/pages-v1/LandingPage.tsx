import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Seo } from '../components/seo/Seo'
import { trackPublicEvent } from '../lib/publicAnalytics'
import { gtagEvent } from '../lib/gtag'
import { SEO_DEFAULT_IMAGE, SEO_SITE_URL } from '../lib/seo'
import {
  Stethoscope, CalendarBlank, Users, CurrencyDollar,
  WhatsappLogo, Heartbeat, Syringe,
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
    trackPublicEvent(eventName, { placement })
    if (eventName === 'signup_cta_click') {
      gtagEvent('generate_lead', { placement: placement ?? undefined })
    } else if (eventName === 'whatsapp_cta_click') {
      gtagEvent('whatsapp_cta_click', { placement: placement ?? undefined })
    }
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
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-1">
          <a href="#funcionalidades" className="block text-sm text-gray-600 py-3" onClick={() => setMenuOpen(false)}>Funcionalidades</a>
          <a href="#como-funciona" className="block text-sm text-gray-600 py-3" onClick={() => setMenuOpen(false)}>Como funciona</a>
          <a href="#precos" className="block text-sm text-gray-600 py-3" onClick={() => setMenuOpen(false)}>Preços</a>
          <a href="#especialidades" className="block text-sm text-gray-600 py-3" onClick={() => setMenuOpen(false)}>Especialidades</a>
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
              Para clínicas e profissionais liberais de saúde
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
              <Link to="/cadastro-clinica?persona=gestor" data-analytics-event="signup_cta_click" data-analytics-placement="persona-manager" className="group flex items-center gap-2 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-600 hover:text-blue-700 text-sm font-medium px-4 py-2.5 rounded-xl transition">
                <Buildings size={18} className="text-blue-500" />
                Sou gestor de clínica
              </Link>
              <Link to="/cadastro-clinica?persona=profissional" data-analytics-event="signup_cta_click" data-analytics-placement="persona-professional" className="group flex items-center gap-2 bg-white border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 text-sm font-medium px-4 py-2.5 rounded-xl transition">
                <UserCircle size={18} className="text-indigo-500" />
                Sou profissional liberal
              </Link>
              <Link to="/cadastro-clinica?persona=recepcao" data-analytics-event="signup_cta_click" data-analytics-placement="persona-patient" className="group flex items-center gap-2 bg-white border border-gray-200 hover:border-teal-400 hover:bg-teal-50 text-gray-600 hover:text-teal-700 text-sm font-medium px-4 py-2.5 rounded-xl transition">
                <Heartbeat size={18} className="text-teal-500" />
                Sou recepcionista
              </Link>
            </div>

            <div className="mt-10 md:hidden">
              <div className="relative rounded-3xl border border-blue-100 bg-white p-4 shadow-xl shadow-blue-100/60">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Hoje', value: '12 consultas', tone: 'bg-blue-500' },
                    { label: 'Confirmadas', value: '10 de 12', tone: 'bg-emerald-500' },
                    { label: 'Receita', value: 'R$ 2.840', tone: 'bg-indigo-500' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-2xl bg-gray-50 p-3">
                      <div className={`mb-2 h-2 w-2 rounded-full ${stat.tone}`} />
                      <p className="text-xs font-bold text-gray-900 leading-tight">{stat.value}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl bg-slate-900 p-4 text-white shadow-inner">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-300">
                    <WhatsappLogo size={16} weight="fill" className="text-emerald-400" />
                    Assistente no WhatsApp
                  </div>
                  <div className="space-y-2">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-emerald-500/20 px-3 py-2 text-sm text-emerald-50">
                      confirma as consultas de amanhã e me mostra quem faltou essa semana
                    </div>
                    <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-white/10 px-3 py-2 text-sm text-slate-100">
                      Amanhã tem 12 consultas. 10 já confirmadas. Nesta semana, 3 pacientes faltaram e 2 precisam de retorno.
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {['Agenda em tempo real', 'Cobrança do dia', 'Lembretes automáticos'].map((item) => (
                    <span key={item} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
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

const assistantCommands = [
  'confirma as consultas de amanhã',
  'me mostra quem faltou essa semana',
  'agenda retorno da Maria para terça',
  'quanto entrou hoje?',
  'manda lembrete para os pacientes das 14h',
]

function AssistantShowcase() {
  return (
    <section id="funcionalidades" className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 mb-5">
              <WhatsappLogo size={13} weight="fill" />
              Seu assistente de WhatsApp entra na operação junto com você
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight mb-5">
              O WhatsApp não fica só no lembrete.
              <span className="block text-blue-600">Ele ajuda a tocar a clínica.</span>
            </h2>
            <p className="text-gray-500 text-lg leading-relaxed mb-6">
              Em vez de mostrar só uma telinha bonita, o Consultin mostra serviço: confirma agenda,
              encontra faltas, acompanha receita, dispara mensagens e organiza o dia da recepção.
            </p>

            <div className="space-y-3 mb-8">
              {[
                'Peça ações operacionais reais em linguagem natural, sem decorar tela ou menu.',
                'Veja confirmações, faltas, retornos e lembretes no mesmo fluxo da agenda.',
                'Use o WhatsApp como atalho de operação para quem atende, recebe e acompanha caixa.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <CheckCircle size={18} weight="fill" className="mt-0.5 text-emerald-500 shrink-0" />
                  <p className="text-sm leading-relaxed text-gray-700">{item}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/cadastro-clinica"
                data-analytics-event="signup_cta_click"
                data-analytics-placement="assistant-section"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
              >
                Criar conta e entrar
                <ArrowRight size={16} weight="bold" />
              </Link>
              <a
                href={WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                data-analytics-event="whatsapp_cta_click"
                data-analytics-placement="assistant-section"
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-3.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
              >
                <WhatsappLogo size={18} weight="fill" />
                Começar pelo WhatsApp
              </a>
            </div>
          </div>

          <div className="rounded-[28px] bg-slate-950 p-5 shadow-2xl shadow-slate-200">
            <div className="mb-4 flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-sm text-white/90">
              <div>
                <p className="font-semibold">Assistente Consultin</p>
                <p className="text-xs text-white/60">Operação da clínica em linguagem natural</p>
              </div>
              <div className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                online agora
              </div>
            </div>

            <div className="space-y-3">
              <div className="max-w-[75%] rounded-3xl rounded-bl-md bg-emerald-500/20 px-4 py-3 text-sm leading-relaxed text-emerald-50">
                confirma as consultas de amanhã e me mostra quem faltou essa semana
              </div>
              <div className="ml-auto max-w-[88%] rounded-3xl rounded-br-md bg-white/10 px-4 py-3 text-sm leading-relaxed text-slate-100">
                Amanhã você tem 12 consultas. 10 já confirmadas. Nesta semana, 3 pacientes faltaram.
                Quer que eu mande retorno para eles agora?
              </div>
              <div className="max-w-[75%] rounded-3xl rounded-bl-md bg-emerald-500/20 px-4 py-3 text-sm leading-relaxed text-emerald-50">
                agenda retorno da Maria para terça e quanto entrou hoje?
              </div>
              <div className="ml-auto max-w-[88%] rounded-3xl rounded-br-md bg-white/10 px-4 py-3 text-sm leading-relaxed text-slate-100">
                Retorno da Maria reservado para terça às 14h30. Hoje entraram R$ 2.840, com 4 pagamentos já conciliados.
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-white/10 p-4 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-white/50 mb-2">Exemplos do que pedir</p>
                <div className="flex flex-wrap gap-2">
                  {assistantCommands.map((command) => (
                    <span key={command} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                      {command}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-4 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-blue-100 mb-2">O ganho no dia a dia</p>
                <ul className="space-y-2 text-sm text-blue-50">
                  <li>Menos retrabalho da recepção</li>
                  <li>Mais respostas e confirmações rápidas</li>
                  <li>Operação e financeiro visíveis sem abrir mil telas</li>
                </ul>
              </div>
            </div>
          </div>
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
      desc: 'Escolha se você atende sozinho ou se opera uma clínica. O cadastro ficou direto ao ponto.',
      icon: <Buildings size={28} weight="duotone" className="text-blue-600" />,
    },
    {
      step: '02',
      title: 'Entre na hora',
      desc: 'Você define sua senha, entra automaticamente e já começa a experimentar o sistema sem trava por e-mail.',
      icon: <Users size={28} weight="duotone" className="text-indigo-600" />,
    },
    {
      step: '03',
      title: 'Configure em minutos',
      desc: 'Ajuste agenda, equipe, pacientes e módulos essenciais no onboarding inicial, sem implantação longa.',
      icon: <Lightning size={28} weight="duotone" className="text-emerald-600" />,
    },
    {
      step: '04',
      title: 'Comece a atender',
      desc: 'Agenda, pacientes, financeiro e WhatsApp entram na rotina desde o primeiro dia de teste.',
      icon: <CalendarBlank size={28} weight="duotone" className="text-teal-600" />,
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

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-8">
          {steps.map((s, i) => (
            <div key={s.step} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden xl:block absolute top-6 left-[calc(100%_-_16px)] w-8 border-t-2 border-dashed border-blue-200 z-0" />
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
  const capabilities = [
    {
      icon: <CalendarBlank size={22} weight="duotone" className="text-blue-600" />,
      title: 'Agenda e atendimento sem ruído',
      description: 'Veja retornos, encaixes, confirmações e faltas sem depender de planilha ou troca de mensagens solta.',
      example: 'Exemplo: confirmar o dia seguinte, localizar faltas da semana e reagendar retorno em segundos.',
      tone: 'from-blue-50 to-indigo-50',
    },
    {
      icon: <Users size={22} weight="duotone" className="text-indigo-600" />,
      title: 'Pacientes e histórico organizados',
      description: 'Cadastro, prontuário e acompanhamento ficam no mesmo sistema, com contexto para recepção e profissional.',
      example: 'Exemplo: abrir a ficha da Maria, ver último atendimento e preparar o próximo retorno sem retrabalho.',
      tone: 'from-indigo-50 to-sky-50',
    },
    {
      icon: <CurrencyDollar size={22} weight="duotone" className="text-emerald-600" />,
      title: 'Financeiro visível no mesmo fluxo',
      description: 'Cobrança, entrada do dia, repasses e visão por profissional deixam de ficar espalhados em outros lugares.',
      example: 'Exemplo: perguntar quanto entrou hoje e já saber o que está pendente antes do fechamento do dia.',
      tone: 'from-emerald-50 to-teal-50',
    },
    {
      icon: <Buildings size={22} weight="duotone" className="text-violet-600" />,
      title: 'Equipe, salas e operação sob controle',
      description: 'Cada pessoa vê o que precisa, cada profissional acompanha sua agenda e a clínica mantém a visão geral.',
      example: 'Exemplo: recepção acompanha o fluxo, profissional vê sua agenda e o admin enxerga a operação inteira.',
      tone: 'from-violet-50 to-fuchsia-50',
    },
    {
      icon: <WhatsappLogo size={22} weight="duotone" className="text-green-600" />,
      title: 'Automações que realmente economizam tempo',
      description: 'O WhatsApp deixa de ser um gargalo e vira canal operacional para confirmação, lembrete e resposta rápida.',
      example: 'Exemplo: disparar lembretes das 14h, acompanhar respostas e manter a agenda viva sem correr atrás de todo mundo.',
      tone: 'from-green-50 to-emerald-50',
    },
  ]

  return (
    <section className="py-20 bg-slate-50 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4">
        <div className="max-w-3xl mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 mb-3">
            O que você passa a ter depois do cadastro
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Funcionalidades fortes, mostradas com contexto de uso real
          </h2>
          <p className="text-gray-500 leading-relaxed">
            Em vez de uma grade genérica de recursos, aqui está o que o Consultin ajuda sua clínica
            a fazer no dia a dia: operar agenda, cuidar de pacientes, acompanhar caixa, coordenar equipe
            e usar o WhatsApp como parte da rotina.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-4">
            {capabilities.map((capability) => (
              <article
                key={capability.title}
                className={`rounded-3xl bg-gradient-to-br ${capability.tone} p-6 shadow-sm ring-1 ring-white/70`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                    {capability.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{capability.title}</h3>
                    <p className="text-sm leading-relaxed text-gray-600 mb-3">{capability.description}</p>
                    <p className="text-sm font-medium text-gray-800">{capability.example}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="rounded-[32px] bg-white p-5 shadow-xl ring-1 ring-slate-200/80 lg:sticky lg:top-24">
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Confirmações', value: '10 / 12', tone: 'bg-emerald-500' },
                { label: 'Faltas da semana', value: '3', tone: 'bg-rose-500' },
                { label: 'Receita do dia', value: 'R$ 2.840', tone: 'bg-blue-500' },
                { label: 'Mensagens ativas', value: '18', tone: 'bg-indigo-500' },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl bg-slate-50 p-4">
                  <div className={`mb-2 h-2.5 w-2.5 rounded-full ${card.tone}`} />
                  <p className="text-sm font-bold text-gray-900">{card.value}</p>
                  <p className="mt-1 text-xs text-gray-500">{card.label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-3xl bg-slate-950 p-4 text-white mb-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
                <WhatsappLogo size={16} weight="fill" className="text-emerald-400" />
                fluxo operacional
              </div>
              <div className="space-y-2 text-sm">
                <div className="rounded-2xl rounded-bl-md bg-emerald-500/20 px-3 py-2 text-emerald-50">
                  manda lembrete para os pacientes das 14h
                </div>
                <div className="ml-auto rounded-2xl rounded-br-md bg-white/10 px-3 py-2 text-slate-100 max-w-[88%]">
                  5 lembretes enviados. 3 pacientes já responderam confirmando presença.
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-600 p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-100 mb-3">Por que isso converte melhor</p>
              <ul className="space-y-2 text-sm leading-relaxed text-blue-50">
                <li>O visitante entende o valor operacional, não só a promessa.</li>
                <li>O produto parece mais completo porque mostra rotina real, não lista vaga.</li>
                <li>Clínica e profissional liberal conseguem se enxergar usando o sistema.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function UseCaseSection() {
  const audiences = [
    {
      title: 'Para clínicas e consultórios com equipe',
      description: 'Quando existe recepção, mais de um profissional, necessidade de repasse e uma operação inteira acontecendo ao mesmo tempo.',
      icon: <Buildings size={28} weight="duotone" className="text-blue-600" />,
      accent: 'bg-blue-50 text-blue-700',
      cta: '/cadastro-clinica?persona=gestor',
      bullets: [
        'Agenda compartilhada com visão do dia, da semana e dos encaixes.',
        'Equipe com acessos separados para recepção, admin e profissional.',
        'Financeiro consolidado com visão por profissional e por clínica.',
        'WhatsApp como apoio à operação, não só canal de lembrete.',
      ],
    },
    {
      title: 'Para profissional liberal que atende sozinho',
      description: 'Quando você quer operar com organização de clínica, mas sem depender de secretária, planilha ou vários apps paralelos.',
      icon: <UserCircle size={28} weight="duotone" className="text-indigo-600" />,
      accent: 'bg-indigo-50 text-indigo-700',
      cta: '/cadastro-clinica?persona=profissional',
      bullets: [
        'Agenda própria com confirmação e retorno sem esforço manual.',
        'Paciente, histórico e financeiro no mesmo lugar.',
        'Mais previsibilidade para o dia sem precisar operar tudo no braço.',
        'Entrada direta no sistema para testar agora, sem implantação pesada.',
      ],
    },
  ]

  return (
    <section className="py-20 bg-white border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4">
        <div className="max-w-2xl mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600 mb-3">
            Dois caminhos, o mesmo produto
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            O Consultin se adapta ao tamanho da sua operação
          </h2>
          <p className="text-gray-500 leading-relaxed">
            A página precisa deixar claro quando o ganho vem de organizar uma clínica inteira e quando
            o ganho vem de um profissional liberal parar de operar tudo sozinho no improviso.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {audiences.map((audience) => (
            <article key={audience.title} className="rounded-[30px] border border-slate-200 bg-slate-50 p-7 shadow-sm">
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${audience.accent} mb-5`}>
                {audience.icon}
                Direção de uso
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">{audience.title}</h3>
              <p className="text-sm leading-relaxed text-gray-600 mb-6">{audience.description}</p>

              <div className="space-y-3 mb-8">
                {audience.bullets.map((bullet) => (
                  <div key={bullet} className="flex items-start gap-3">
                    <CheckCircle size={18} weight="fill" className="mt-0.5 text-emerald-500 shrink-0" />
                    <p className="text-sm leading-relaxed text-gray-700">{bullet}</p>
                  </div>
                ))}
              </div>

              <Link
                to={audience.cta}
                data-analytics-event="signup_cta_click"
                data-analytics-placement={audience.title.includes('clínicas') ? 'audience-clinic' : 'audience-solo'}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                Ver esse fluxo
                <ArrowRight size={16} weight="bold" />
              </Link>
            </article>
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
          <AssistantShowcase />
          <SearchIntentSection />
          <UseCaseSection />
          <HowItWorks />
          <WhatsAppOnboarding />
          <Pricing />
          <Specialties />
          <FAQSection />
          <TrustBar />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </>
  )
}
