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
  const [aiModel,      setAiModel]      = useState(clinic.waAiModel ?? 'google/gemini-2.0-flash-exp:free')
  const [customPrompt, setCustomPrompt] = useState(clinic.waAiCustomPrompt ?? '')
  const [saving,       setSaving]       = useState(false)
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
      <div className="space-y-6">
        {/* Status banner */}
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800">WhatsApp conectado</p>
            <p className="text-xs text-green-600">{clinic.whatsappPhoneDisplay}</p>
          </div>
          <button onClick={() => setStep('form')}
            className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 px-3 py-1.5 border border-green-300 rounded-lg">
            <ArrowClockwise size={13} /> Reconfigurar
          </button>
        </div>

        {/* Feature toggles — Para pacientes */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-4 py-2.5">Para pacientes</p>
          {([
            { key: 'waRemindersd1', label: 'Lembrete D-1 (véspera)',         desc: 'Envia lembrete 1 dia antes com botões Confirmar / Cancelar' },
            { key: 'waRemindersd0', label: 'Lembrete D-0 (dia da consulta)', desc: 'Envia lembrete no próprio dia às 07:00' },
          ] as { key: 'waRemindersd1'|'waRemindersd0'; label: string; desc: string }[]).map(({ key, label, desc }) => {
            const value = clinic[key] as boolean
            return (
              <div key={key} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-gray-700">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() => handleToggleReminders(key, !value)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-green-500' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            )
          })}
        </div>

        {/* Feature toggles — Para a equipe */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-4 py-2.5">Para a equipe</p>
          {([
            { key: 'waProfessionalAgenda', label: 'Agenda diária para profissionais', desc: 'Envia a agenda do dia para cada profissional às 07:30' },
            { key: 'waAttendantInbox',     label: 'Caixa de mensagens (atendentes)', desc: 'Conversas que a IA não resolveu aparecem na aba Mensagens' },
          ] as { key: 'waProfessionalAgenda'|'waAttendantInbox'; label: string; desc: string }[]).map(({ key, label, desc }) => {
            const value = clinic[key] as boolean
            return (
              <div key={key} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-gray-700">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() => handleToggleReminders(key, !value)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-green-500' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            )
          })}
          <div className="px-4 py-3 bg-gray-50 rounded-b-xl">
            <p className="text-xs text-gray-400">
              💡 Para receber alertas no <strong>seu próprio celular</strong>, configure em{' '}
              <strong>Configurações → Notificações</strong>.
            </p>
          </div>
        </div>

        {/* AI model picker */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700">Modelo de IA (via OpenRouter)</p>
          <p className="text-xs text-gray-400">Usado para entender mensagens dos pacientes e sugerir respostas.</p>
          <select
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            onBlur={() => update.mutateAsync({ waAiModel: aiModel })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white">
            {WA_AI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* AI personality */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Robot size={15} weight="fill" className="text-violet-500" /> Personalidade da IA
          </p>
          <p className="text-xs text-gray-400">
            Instruções adicionais para o assistente. Exemplo: &ldquo;Seja sempre gentil e termine com o nome da clínica.&rdquo;
          </p>
          <textarea
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            onBlur={() => update.mutateAsync({ waAiCustomPrompt: customPrompt || null })}
            rows={3}
            placeholder="Instruções de tom e personalidade..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none"
          />
        </div>

        {/* AI command toggles */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <p className="text-sm font-semibold text-gray-700 px-4 pt-3 pb-2">Ações permitidas para a IA</p>
          {([
            { field: 'waAiAllowConfirm'  as const, label: 'IA pode confirmar consultas',     desc: 'Confirma agendamentos via WhatsApp automaticamente' },
            { field: 'waAiAllowCancel'   as const, label: 'IA pode cancelar consultas',       desc: 'Cancela consultas a pedido do paciente' },
            { field: 'waAiAllowSchedule' as const, label: 'IA pode agendar novas consultas',  desc: 'Fluxo de agendamento completo via WhatsApp' },
          ]).map(({ field, label, desc }) => {
            const value = clinic[field] as boolean
            return (
              <div key={field} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-gray-700">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() => handleToggleAi(field, !value)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-green-500' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            )
          })}
        </div>

        {/* FAQ knowledge base */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <BookOpen size={15} weight="fill" className="text-[#0ea5b0]" /> Base de conhecimento (FAQ)
          </p>
          <p className="text-xs text-gray-400">Perguntas e respostas que a IA usará para responder dúvidas frequentes.</p>

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
        </div>

        <button onClick={handleDisconnect}
          className="text-sm text-red-500 hover:text-red-700 underline">
          Desconectar WhatsApp
        </button>
      </div>
    )
  }

  // ── Setup / guide state ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <WhatsappLogo size={20} weight="fill" className="text-green-500" />
          Conectar WhatsApp Business
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Autorize o Consultin a enviar e receber mensagens pelo número da sua clínica.
        </p>
      </div>

      {/* ── Primary: Meta Embedded Signup ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
          <WhatsappLogo size={28} weight="fill" className="text-green-500" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-800">Autorize com a Meta em 2 cliques</p>
          <p className="text-xs text-gray-400 max-w-xs">
            Faça login com o Facebook associado ao seu WhatsApp Business e selecione a conta.
            O Consultin configura tudo automaticamente — sem copiar IDs ou tokens.
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
            ⚠️ Configure{' '}
            <code className="font-mono text-xs">VITE_META_APP_ID</code> e{' '}
            <code className="font-mono text-xs">VITE_META_EMBEDDED_SIGNUP_CONFIG_ID</code>{' '}
            nas variáveis de ambiente.
          </p>
        )}
      </div>

      {/* ── Secondary: Manual config (collapsible) ────────────────────────── */}
      <div className="rounded-xl border border-dashed border-gray-200">
        <button
          onClick={() => setShowManual(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <span>Configuração manual (modo avançado)</span>
          <span className="text-xs">{showManual ? '▲' : '▼'}</span>
        </button>
        {showManual && (
          <div className="px-4 pb-4 space-y-4 border-t border-dashed border-gray-200 pt-4">

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">URL do Webhook</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <code className="text-xs text-gray-700 flex-1 break-all">{webhookUrl}</code>
                <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('Copiado!') }}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                  <Copy size={14} />
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Token de Verificação</p>
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
              <p className="text-xs text-gray-400 mt-1">Meta for Developers → Seu App → WhatsApp → Configuração</p>
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
              <p className="text-xs text-gray-400 mt-1">
                🔒 Armazenado de forma segura — nunca exposto no frontend.
              </p>
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
