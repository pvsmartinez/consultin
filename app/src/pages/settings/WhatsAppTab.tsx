import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { WhatsappLogo, Copy, ArrowClockwise, Robot, BookOpen, Plus, Trash, PencilSimple, Check } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useClinic } from '../../hooks/useClinic'
import { storeWhatsAppToken, completeEmbeddedSignup } from '../../services/whatsapp'
import { QK } from '../../lib/queryKeys'
import { WA_AI_MODELS } from '../../types'
import type { Clinic } from '../../types'
import {
  useWhatsappFaqs,
  useCreateWhatsappFaq,
  useUpdateWhatsappFaq,
  useDeleteWhatsappFaq,
} from '../../hooks/useWhatsappFaqs'

function ToggleRow({
  label,
  hint,
  value,
  onToggle,
}: {
  label: string
  hint: string
  value: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="mt-1 text-xs text-gray-500">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-green-500' : 'bg-gray-200'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

// ─── Meta FB SDK helpers ────────────────────────────────────────────────────

interface FBSDKType {
  init: (cfg: { appId: string; cookie: boolean; version: string }) => void
  login: (
    cb: (resp: { authResponse?: { code?: string } }) => void,
    opts: { config_id: string; response_type: string; override_default_response_type: boolean },
  ) => void
}

function loadFbSdk(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { FB?: FBSDKType; fbAsyncInit?: () => void }
    if (w.FB) { resolve(); return }
    w.fbAsyncInit = () => {
      w.FB!.init({ appId, cookie: true, version: 'v21.0' })
      resolve()
    }
    if (!document.getElementById('facebook-jssdk')) {
      const script   = document.createElement('script')
      script.id      = 'facebook-jssdk'
      script.src     = 'https://connect.facebook.net/en_US/sdk.js'
      script.async   = true
      script.onerror = () => reject(new Error('Falha ao carregar SDK da Meta'))
      document.body.appendChild(script)
    }
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WhatsAppTab({ clinic }: { clinic: Clinic }) {
  const { update } = useClinic()
  const [step,         setStep]         = useState<'guide' | 'form'>('guide')
  const [accessToken,  setAccessToken]  = useState('')
  const [phoneId,      setPhoneId]      = useState(clinic.whatsappPhoneNumberId ?? '')
  const [phoneDisplay, setPhoneDisplay] = useState(clinic.whatsappPhoneDisplay ?? '')
  const [wabaId,       setWabaId]       = useState(clinic.whatsappWabaId ?? '')
  const [aiModel,         setAiModel]         = useState(clinic.waAiModel ?? 'google/gemini-2.0-flash-exp:free')
  const [customPrompt,    setCustomPrompt]    = useState(clinic.waAiCustomPrompt ?? '')
  const [reminderD1Text,  setReminderD1Text]  = useState(
    clinic.waReminderD1Text ??
    'Olá, {{nome}}! 👋 Lembramos que você tem uma consulta amanhã, {{data}}, às {{hora}}, com {{profissional}}. Para confirmar, responda *SIM*. Para cancelar, responda *NÃO*.'
  )
  const [reminderD0Text,  setReminderD0Text]  = useState(
    clinic.waReminderD0Text ??
    'Bom dia, {{nome}}! 😊 Sua consulta de hoje é às {{hora}} com {{profissional}}. Te esperamos!'
  )
  const [saving,           setSaving]          = useState(false)
  const [connecting,   setConnecting]   = useState(false)
  const [showManual,   setShowManual]   = useState(false)
  const capturedSignup = useRef<{ wabaId: string; phoneNumberId: string } | null>(null)
  const queryClient    = useQueryClient()

  // FAQ hooks
  const { data: faqs = [] }   = useWhatsappFaqs()
  const createFaq             = useCreateWhatsappFaq()
  const updateFaq             = useUpdateWhatsappFaq()
  const deleteFaq             = useDeleteWhatsappFaq()
  const [faqQ,    setFaqQ]    = useState('')
  const [faqA,    setFaqA]    = useState('')
  const [editId,  setEditId]  = useState<string | null>(null)
  const [editQ,   setEditQ]   = useState('')
  const [editA,   setEditA]   = useState('')

  const verifyToken = clinic.whatsappVerifyToken
    ?? `consultin_${clinic.id.replace(/-/g, '').slice(0, 16)}`

  const projectUrl = (window as { VITE_SUPABASE_URL?: string }).VITE_SUPABASE_URL
    ?? import.meta.env.VITE_SUPABASE_URL ?? ''
  const webhookUrl = projectUrl
    ? `${projectUrl}/functions/v1/whatsapp-webhook`
    : 'https://<project>.supabase.co/functions/v1/whatsapp-webhook'

  async function handleSave() {
    if (!phoneId || !phoneDisplay || !wabaId) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    setSaving(true)
    try {
      await update.mutateAsync({
        whatsappPhoneNumberId: phoneId,
        whatsappPhoneDisplay:  phoneDisplay,
        whatsappWabaId:        wabaId,
        whatsappVerifyToken:   verifyToken,
        waAiModel:             aiModel,
      })

      if (accessToken.trim()) {
        await storeWhatsAppToken(clinic.id, accessToken.trim())
      }

      toast.success('WhatsApp configurado com sucesso!')
      setStep('guide')
      setAccessToken('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleReminders(
    field: 'waRemindersd1' | 'waRemindersd0' | 'waProfessionalAgenda' | 'waAttendantInbox',
    value: boolean,
  ) {
    await update.mutateAsync({ [field]: value })
    toast.success('Configuração salva')
  }

  async function handleToggleAi(
    field: 'waAiAllowSchedule' | 'waAiAllowConfirm' | 'waAiAllowCancel',
    value: boolean,
  ) {
    await update.mutateAsync({ [field]: value })
    toast.success('Configuração salva')
  }

  async function handleDisconnect() {
    await update.mutateAsync({ whatsappEnabled: false })
    toast.success('WhatsApp desconectado')
  }

  async function handleEmbeddedSignup() {
    setConnecting(true)
    capturedSignup.current = null
    try {
      await loadFbSdk(import.meta.env.VITE_META_APP_ID as string)
    } catch {
      toast.error('Não foi possível carregar o SDK da Meta')
      setConnecting(false)
      return
    }

    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return
      try {
        const raw  = typeof event.data === 'string' ? event.data : JSON.stringify(event.data)
        const data = JSON.parse(raw) as {
          type?: string
          event?: string
          data?: { waba_id?: string; phone_number_id?: string }
        }
        if (
          data.type === 'WA_EMBEDDED_SIGNUP' &&
          data.event === 'FINISH' &&
          data.data?.waba_id &&
          data.data?.phone_number_id
        ) {
          capturedSignup.current = {
            wabaId:        data.data.waba_id,
            phoneNumberId: data.data.phone_number_id,
          }
        }
      } catch { /* ignore malformed messages */ }
    }

    window.addEventListener('message', messageHandler)
    ;(window as unknown as { FB: FBSDKType }).FB.login(async (response) => {
      window.removeEventListener('message', messageHandler)

      if (!response.authResponse?.code) {
        toast.error('Autorização cancelada')
        setConnecting(false)
        return
      }
      if (!capturedSignup.current) {
        toast.error('Dados do WhatsApp Business não recebidos — tente novamente')
        setConnecting(false)
        return
      }

      try {
        await completeEmbeddedSignup({
          clinicId:      clinic.id,
          code:          response.authResponse.code,
          wabaId:        capturedSignup.current.wabaId,
          phoneNumberId: capturedSignup.current.phoneNumberId,
        })
        await queryClient.invalidateQueries({ queryKey: QK.clinic.detail(clinic.id) })
        toast.success('WhatsApp conectado com sucesso! 🟢')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Falha ao conectar WhatsApp')
        setConnecting(false)
      }
    }, {
      config_id:                    import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID as string,
      response_type:                'code',
      override_default_response_type: true,
    })
  }

  if (clinic.whatsappEnabled && step !== 'form') {
    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-green-200 bg-green-50 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-green-600">
                <WhatsappLogo size={20} weight="fill" />
              </span>
              <div>
                <p className="text-sm font-semibold text-green-900">WhatsApp conectado</p>
                <p className="text-sm text-green-700">{clinic.whatsappPhoneDisplay}</p>
              </div>
            </div>
            <button onClick={() => setStep('form')}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-green-300 bg-white px-3 py-2 text-sm font-medium text-green-800 hover:bg-green-100">
              <ArrowClockwise size={13} /> Reconfigurar
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-800">Automação com pacientes</p>
            <p className="mt-1 text-xs text-gray-500">Ative só o que quer rodando no WhatsApp.</p>
          </div>
          {([
            { key: 'waRemindersd1', label: 'Lembrete D-1', desc: 'Mensagem na véspera com confirmar ou cancelar.' },
            { key: 'waRemindersd0', label: 'Lembrete D-0', desc: 'Mensagem no dia da consulta pela manhã.' },
          ] as { key: 'waRemindersd1'|'waRemindersd0'; label: string; desc: string }[]).map(({ key, label, desc }) => {
            const value = clinic[key] as boolean
            return (
              <ToggleRow key={key} label={label} hint={desc} value={value} onToggle={() => handleToggleReminders(key, !value)} />
            )
          })}
        </section>

        {(clinic.waRemindersd1 || clinic.waRemindersd0) && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Textos dos lembretes</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-gray-500">
                <code className="rounded bg-gray-100 px-1.5 py-1 font-mono">{'{{nome}}'}</code>
                <code className="rounded bg-gray-100 px-1.5 py-1 font-mono">{'{{data}}'}</code>
                <code className="rounded bg-gray-100 px-1.5 py-1 font-mono">{'{{hora}}'}</code>
                <code className="rounded bg-gray-100 px-1.5 py-1 font-mono">{'{{profissional}}'}</code>
              </div>
            </div>
            {clinic.waRemindersd1 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Lembrete D-1 (véspera)</label>
                <textarea
                  value={reminderD1Text}
                  onChange={e => setReminderD1Text(e.target.value)}
                  onBlur={() => update.mutateAsync({ waReminderD1Text: reminderD1Text || null })}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                />
              </div>
            )}
            {clinic.waRemindersd0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Lembrete D-0 (dia da consulta)</label>
                <textarea
                  value={reminderD0Text}
                  onChange={e => setReminderD0Text(e.target.value)}
                  onBlur={() => update.mutateAsync({ waReminderD0Text: reminderD0Text || null })}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                />
              </div>
            )}
          </div>
        )}

        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-800">Rotina da equipe</p>
            <p className="mt-1 text-xs text-gray-500">Use o WhatsApp como apoio interno, sem excesso.</p>
          </div>
          {([
            { key: 'waProfessionalAgenda', label: 'Agenda diária para profissionais', desc: 'Resumo diário no começo da manhã.' },
            { key: 'waAttendantInbox',     label: 'Caixa de mensagens da recepção', desc: 'Conversa não resolvida cai na aba Mensagens.' },
          ] as { key: 'waProfessionalAgenda'|'waAttendantInbox'; label: string; desc: string }[]).map(({ key, label, desc }) => {
            const value = clinic[key] as boolean
            return (
              <ToggleRow key={key} label={label} hint={desc} value={value} onToggle={() => handleToggleReminders(key, !value)} />
            )
          })}
          <div className="px-4 py-3 bg-gray-50">
            <p className="text-xs text-gray-500">
              Alertas pessoais ficam na aba Notificações.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">Modelo de IA</p>
            <p className="mt-1 text-xs text-gray-500">Escolha o modelo que vai interpretar as conversas.</p>
          </div>
          <select
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            onBlur={() => update.mutateAsync({ waAiModel: aiModel })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white">
            {WA_AI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </section>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Robot size={15} weight="fill" className="text-violet-500" /> Instruções da IA
          </p>
          <p className="text-xs text-gray-500">Defina tom e limites do atendimento automático.</p>
          <textarea
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            onBlur={() => update.mutateAsync({ waAiCustomPrompt: customPrompt || null })}
            rows={3}
            placeholder="Instruções de tom e personalidade..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none"
          />
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-800">O que a IA pode fazer</p>
          </div>
          {([
            { field: 'waAiAllowConfirm'  as const, label: 'Confirmar consultas', desc: 'Permite confirmação automática.' },
            { field: 'waAiAllowCancel'   as const, label: 'Cancelar consultas', desc: 'Permite cancelamento via conversa.' },
            { field: 'waAiAllowSchedule' as const, label: 'Agendar novas consultas', desc: 'Permite montar um agendamento completo.' },
          ]).map(({ field, label, desc }) => {
            const value = clinic[field] as boolean
            return (
              <ToggleRow key={field} label={label} hint={desc} value={value} onToggle={() => handleToggleAi(field, !value)} />
            )
          })}
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <BookOpen size={15} weight="fill" className="text-[#0ea5b0]" /> Base de respostas
          </p>
          <p className="text-xs text-gray-500">Perguntas frequentes que ajudam a IA a responder com consistência.</p>

          {/* Existing FAQs */}
          <div className="space-y-2">
            {faqs.map(faq => (
              <div key={faq.id} className="border border-gray-100 rounded-lg p-3 space-y-1">
                {editId === faq.id ? (
                  <div className="space-y-2">
                    <input
                      value={editQ}
                      onChange={e => setEditQ(e.target.value)}
                      placeholder="Pergunta"
                      className="w-full border border-teal-200 rounded-xl px-3 py-1.5 text-sm"
                    />
                    <textarea
                      value={editA}
                      onChange={e => setEditA(e.target.value)}
                      placeholder="Resposta"
                      rows={2}
                      className="w-full border border-teal-200 rounded-xl px-3 py-1.5 text-sm resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await updateFaq.mutateAsync({ id: faq.id, question: editQ, answer: editA })
                          setEditId(null)
                          toast.success('FAQ atualizado')
                        }}
                        className="flex items-center gap-1 text-xs text-white px-3 py-1.5 rounded-xl transition-all active:scale-[0.98]"
                        style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
                      >
                        <Check size={12} /> Salvar
                      </button>
                      <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-700">{faq.question}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{faq.answer}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setEditId(faq.id); setEditQ(faq.question); setEditA(faq.answer) }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-[#006970] hover:bg-teal-50 transition"
                      >
                        <PencilSimple size={13} />
                      </button>
                      <button
                        onClick={async () => { await deleteFaq.mutateAsync(faq.id); toast.success('FAQ removido') }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* New FAQ form */}
          <div className="border border-dashed border-gray-200 rounded-lg p-3 space-y-2">
            <input
              value={faqQ}
              onChange={e => setFaqQ(e.target.value)}
              placeholder="Nova pergunta..."
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            />
            <textarea
              value={faqA}
              onChange={e => setFaqA(e.target.value)}
              placeholder="Resposta..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm resize-none"
            />
            <button
              onClick={async () => {
                if (!faqQ.trim() || !faqA.trim()) return
                await createFaq.mutateAsync({ question: faqQ.trim(), answer: faqA.trim() })
                setFaqQ(''); setFaqA('')
                toast.success('FAQ adicionado')
              }}
              disabled={!faqQ.trim() || !faqA.trim()}
              className="flex items-center gap-1.5 text-xs text-white px-3 py-1.5 rounded-xl disabled:opacity-40 transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
            >
              <Plus size={12} /> Adicionar
            </button>
          </div>
        </section>

        <button onClick={handleDisconnect}
          className="text-sm text-red-500 hover:text-red-700 underline">
          Desconectar WhatsApp
        </button>
      </div>
    )
  }

  // ── Setup / guide state ─────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-3xl">
      <section className="rounded-2xl border border-gray-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(247,250,252,0.98))] px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <WhatsappLogo size={20} weight="fill" className="text-green-500" />
          WhatsApp da clínica
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Conecte uma vez e controle lembretes, mensagens e IA no mesmo lugar.
        </p>
      </section>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
          <WhatsappLogo size={28} weight="fill" className="text-green-500" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-800">Conexão rápida pela Meta</p>
          <p className="text-xs text-gray-500 max-w-sm">
            Faça login, escolha a conta do WhatsApp Business e deixe o restante com o Consultin.
          </p>
        </div>
        <button
          onClick={handleEmbeddedSignup}
          disabled={connecting || !import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors w-full"
        >
          {connecting
            ? <><ArrowClockwise size={15} className="animate-spin" /> Conectando...</>
            : <><WhatsappLogo size={15} weight="fill" /> Conectar com Meta</>
          }
        </button>
        {!import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID && (
          <p className="text-xs text-amber-600">
            Configure{' '}
            <code className="font-mono text-xs">VITE_META_APP_ID</code> e{' '}
            <code className="font-mono text-xs">VITE_META_EMBEDDED_SIGNUP_CONFIG_ID</code>{' '}
            no ambiente.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-dashed border-gray-200 bg-white">
        <button
          onClick={() => setShowManual(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          <span>Modo avançado</span>
          <span className="text-xs">{showManual ? '▲' : '▼'}</span>
        </button>
        {showManual && (
          <div className="px-4 pb-4 space-y-4 border-t border-dashed border-gray-200 pt-4">

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Webhook</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <code className="text-xs text-gray-700 flex-1 break-all">{webhookUrl}</code>
                <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('Copiado!') }}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                  <Copy size={14} />
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Token de verificação</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <code className="text-xs text-gray-700 flex-1">{verifyToken}</code>
                <button onClick={() => { navigator.clipboard.writeText(verifyToken); toast.success('Copiado!') }}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                  <Copy size={14} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                Phone Number ID <span className="text-red-400">*</span>
              </label>
              <input
                value={phoneId}
                onChange={(e) => setPhoneId(e.target.value)}
                placeholder="123456789012345"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-300"
              />
              <p className="text-xs text-gray-400 mt-1">Meta → seu app → WhatsApp.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                Número de telefone (exibição) <span className="text-red-400">*</span>
              </label>
              <input
                value={phoneDisplay}
                onChange={(e) => setPhoneDisplay(e.target.value)}
                placeholder="+55 11 91234-5678"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                WhatsApp Business Account ID (WABA ID) <span className="text-red-400">*</span>
              </label>
              <input
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="987654321098765"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                Token de Acesso Permanente <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAAxxxxxxxxxxxxxxx..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-300"
              />
              <p className="text-xs text-gray-400 mt-1">Armazenado de forma segura.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Modelo de IA</label>
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white">
                {WA_AI_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !phoneId || !phoneDisplay || !wabaId || !accessToken}
                className="flex-1 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 disabled:opacity-40 transition-colors">
                {saving ? 'Salvando...' : 'Conectar WhatsApp'}
              </button>
              {clinic.whatsappEnabled && (
                <button onClick={() => setStep('guide')}
                  className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
