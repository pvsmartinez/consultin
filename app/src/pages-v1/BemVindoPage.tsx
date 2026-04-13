import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, Envelope, CalendarBlank, ArrowRight, Stethoscope } from '@phosphor-icons/react'
import { Seo } from '../components/seo/Seo'
import { gtagEvent } from '../lib/gtag'

export default function BemVindoPage() {
  useEffect(() => {
    // Conversão rastreada via GA4 importado no Google Ads (conta AW-8115111041, evento: sign_up)
    gtagEvent('sign_up', { method: 'clinic_form' })
  }, [])

  return (
    <>
      <Seo
        title="Solicitação enviada | Consultin"
        description="Solicitação de acesso recebida. Em breve você receberá o convite por e-mail."
        canonicalPath="/bem-vindo"
      />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col">
        {/* Nav strip */}
        <header className="flex items-center gap-2 px-6 py-4 bg-white/80 backdrop-blur border-b border-gray-100">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Stethoscope size={15} weight="bold" className="text-white" />
            </div>
            <span className="text-base font-bold text-gray-900">Consultin</span>
          </Link>
        </header>

        {/* Main content */}
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-lg">
            {/* Success card */}
            <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 md:p-10 text-center mb-6">
              <div className="flex justify-center mb-5">
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
                  <CheckCircle size={48} weight="fill" className="text-green-500" />
                </div>
              </div>

              <h1 className="text-2xl font-extrabold text-gray-900 mb-3">
                Solicitação enviada!
              </h1>
              <p className="text-gray-500 leading-relaxed mb-2">
                Recebemos os dados da sua clínica. Nossa equipe revisará sua solicitação
                e você receberá o convite de acesso por e-mail em breve.
              </p>
              <p className="text-sm text-gray-400 mb-8">
                Seu período de <strong className="text-gray-600">7 dias grátis</strong> começa
                a partir do primeiro acesso.
              </p>

              {/* What happens next */}
              <ul className="space-y-4 text-left mb-8">
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center mt-0.5">
                    <Envelope size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Fique de olho no e-mail</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Você receberá um convite com link para criar sua senha e acessar a plataforma.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center mt-0.5">
                    <CalendarBlank size={16} className="text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Configure sua agenda</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Após o primeiro acesso, um assistente de configuração guia sua clínica em minutos.
                    </p>
                  </div>
                </li>
              </ul>

              <Link
                to="/"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition text-sm shadow-md shadow-blue-200">
                Voltar para o início
                <ArrowRight size={15} weight="bold" />
              </Link>
            </div>

            {/* Support callout */}
            <p className="text-center text-sm text-gray-400">
              Dúvidas?{' '}
              <a href="mailto:suporte@consultin.com.br" className="text-blue-600 hover:underline font-medium">
                suporte@consultin.com.br
              </a>
            </p>
          </div>
        </main>
      </div>
    </>
  )
}
