import { useEffect, useState } from 'react'
import { CheckCircle, EnvelopeSimple, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthContext } from '../contexts/AuthContext'
import { isEmailVerificationPending, markEmailAsVerified } from '../lib/emailVerification'
import { Seo } from '../components/seo/Seo'

type Status = 'waiting-session' | 'verifying' | 'success' | 'error'

export default function EmailVerificationPage() {
  const navigate = useNavigate()
  const { session } = useAuthContext()
  const [status, setStatus] = useState<Status>('waiting-session')

  useEffect(() => {
    if (!session) {
      setStatus('waiting-session')
      return
    }

    const activeSession = session

    if (!isEmailVerificationPending(activeSession)) {
      setStatus('success')
      const timeoutId = window.setTimeout(() => navigate('/', { replace: true }), 1800)
      return () => window.clearTimeout(timeoutId)
    }

    let cancelled = false
    async function verify() {
      setStatus('verifying')
      const { error } = await markEmailAsVerified(activeSession)
      if (cancelled) return

      if (error) {
        setStatus('error')
        return
      }

      setStatus('success')
      window.setTimeout(() => navigate('/', { replace: true }), 1800)
    }

    verify()
    return () => {
      cancelled = true
    }
  }, [navigate, session])

  const content = {
    'waiting-session': {
      icon: <SpinnerGap size={44} className="mx-auto animate-spin text-blue-600" />,
      title: 'Validando seu acesso...',
      description: 'Estamos confirmando o link do seu e-mail. Isso costuma levar só alguns segundos.',
    },
    verifying: {
      icon: <EnvelopeSimple size={44} className="mx-auto text-blue-600" />,
      title: 'Confirmando seu e-mail',
      description: 'Seu primeiro acesso continua liberado. Estamos só marcando este e-mail como validado.',
    },
    success: {
      icon: <CheckCircle size={44} className="mx-auto text-green-600" weight="fill" />,
      title: 'E-mail validado com sucesso',
      description: 'Tudo certo. Você será redirecionado para o Consultin agora.',
    },
    error: {
      icon: <WarningCircle size={44} className="mx-auto text-amber-600" weight="fill" />,
      title: 'Não conseguimos concluir a validação',
      description: 'Sua conta continua acessível. Entre no app e clique em reenviar e-mail para tentar de novo.',
    },
  }[status]

  return (
    <>
      <Seo
        title="Validação de e-mail | Consultin"
        description="Confirmação do e-mail de acesso ao Consultin."
        canonicalPath="/email-verificado"
        noindex
      />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-xl">
          {content.icon}
          <h1 className="mt-5 text-2xl font-bold text-gray-900">{content.title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">{content.description}</p>

          <div className="mt-6 flex flex-col gap-3">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Ir para o Consultin
            </Link>
            <Link
              to="/login"
              className="text-sm font-medium text-blue-600 transition hover:text-blue-700"
            >
              Voltar para login
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}