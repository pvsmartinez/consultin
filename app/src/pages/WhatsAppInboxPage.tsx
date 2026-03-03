import { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { WhatsappLogo, Check, Checks, ArrowBendUpRight, User, Robot, Headset, CheckCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useClinic } from '../hooks/useClinic'
import {
  fetchActiveSessions,
  fetchMessages,
  resolveSession,
  escalateSession,
  sendAttendantMessage,
  subscribeToSession,
  subscribeToSessions,
} from '../services/whatsapp'
import type { WhatsAppSession, WhatsAppMessage } from '../types'

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WhatsAppInboxPage() {
  const { data: clinic } = useClinic()

  const [sessions,        setSessions]        = useState<WhatsAppSession[]>([])
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [messages,        setMessages]        = useState<WhatsAppMessage[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)

  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null

  // ── Load sessions ──────────────────────────────────────────────────────────
  // Keep a ref so the auto-select logic can read the latest selectedId without
  // making it a dep of useCallback (which would cause a refetch on every click).
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  const loadSessions = useCallback(async () => {
    if (!clinic?.id) return
    try {
      const data = await fetchActiveSessions(clinic.id)
      setSessions(data)
      // Auto-select first if nothing selected
      if (!selectedIdRef.current && data.length > 0) setSelectedId(data[0].id)
    } catch {
      // silently retry via realtime
    } finally {
      setLoadingSessions(false)
    }
  }, [clinic?.id])

  useEffect(() => { loadSessions() }, [loadSessions])

  // ── Realtime: session list ─────────────────────────────────────────────────
  useEffect(() => {
    if (!clinic?.id) return
    return subscribeToSessions(clinic.id, loadSessions)
  }, [clinic?.id, loadSessions])

  // ── Load messages for selected session ────────────────────────────────────
  // Uses a cancellation flag to prevent stale responses from a previous session
  // overwriting messages when the user switches sessions quickly.
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setLoadingMessages(true)
    fetchMessages(selectedId)
      .then((msgs) => { if (!cancelled) setMessages(msgs) })
      .catch(() => { if (!cancelled) toast.error('Erro ao carregar mensagens') })
      .finally(() => { if (!cancelled) setLoadingMessages(false) })
    return () => { cancelled = true }
  }, [selectedId])

  // ── Realtime: new messages in selected session ────────────────────────────
  useEffect(() => {
    if (!selectedId) return
    return subscribeToSession(selectedId, (msg) => {
      setMessages((prev) => [...prev, msg])
    })
  }, [selectedId])

  if (!clinic) return null

  if (!clinic.whatsappEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <WhatsappLogo size={40} className="text-gray-300" />
        <p className="text-sm text-gray-500">WhatsApp não está configurado nesta clínica.</p>
        <a href="/configuracoes" className="text-sm text-green-600 underline">Ir para Configurações → WhatsApp</a>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Session list */}
      <aside className="w-72 flex-shrink-0 border-r border-gray-100 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100">
          <h1 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <WhatsappLogo size={16} weight="fill" className="text-green-500" />
            Caixa de Mensagens
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">{sessions.length} conversas abertas</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingSessions && (
            <p className="text-xs text-gray-400 text-center py-8">Carregando...</p>
          )}
          {!loadingSessions && sessions.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
              <CheckCircle size={28} className="text-gray-300" />
              <p className="text-xs text-gray-400">Nenhuma conversa pendente. 🎉</p>
            </div>
          )}
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              active={s.id === selectedId}
              onClick={() => setSelectedId(s.id)}
            />
          ))}
        </div>
      </aside>

      {/* Chat panel */}
      {selectedSession ? (
        <ChatPanel
          session={selectedSession}
          messages={messages}
          loading={loadingMessages}
          clinicId={clinic.id}
          onResolve={async () => {
            try {
              await resolveSession(selectedSession.id)
              setSessions((prev) => prev.filter((s) => s.id !== selectedSession.id))
              setSelectedId(sessions.find((s) => s.id !== selectedSession.id)?.id ?? null)
              toast.success('Conversa resolvida')
            } catch {
              toast.error('Erro ao resolver conversa')
            }
          }}
          onEscalate={async () => {
            try {
              await escalateSession(selectedSession.id)
              setSessions((prev) =>
                prev.map((s) => s.id === selectedSession.id ? { ...s, status: 'human' } : s)
              )
              toast.success('Conversa atribuída para atendimento humano')
            } catch {
              toast.error('Erro ao assumir conversa')
            }
          }}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
          Selecione uma conversa
        </div>
      )}
    </div>
  )
}

// ─── Session row ──────────────────────────────────────────────────────────────

function SessionRow({
  session,
  active,
  onClick,
}: {
  session: WhatsAppSession
  active:  boolean
  onClick: () => void
}) {
  const statusColor = session.status === 'human' ? 'bg-amber-400' : 'bg-blue-400'
  const displayName = session.patientName ?? formatPhone(session.waPhone)
  const timeStr     = format(new Date(session.lastMessageAt), 'HH:mm', { locale: ptBR })

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 ${active ? 'bg-green-50' : ''}`}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
          <User size={16} className="text-gray-400" />
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${statusColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
          <span className="text-xs text-gray-400 flex-shrink-0">{timeStr}</span>
        </div>
        <p className="text-xs text-gray-400 truncate">
          {session.status === 'human' ? '👤 Atendente' : '🤖 AI'}
        </p>
      </div>
    </button>
  )
}

// ─── Chat panel ───────────────────────────────────────────────────────────────

function ChatPanel({
  session,
  messages,
  loading,
  clinicId,
  onResolve,
  onEscalate,
}: {
  session:    WhatsAppSession
  messages:   WhatsAppMessage[]
  loading:    boolean
  clinicId:   string
  onResolve:  () => Promise<void>
  onEscalate: () => Promise<void>
}) {
  const [text,    setText]    = useState('')
  const [sending, setSending] = useState('')  // 'resolve' | 'escalate' | 'send' | ''
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Pre-fill with AI draft if available
  useEffect(() => {
    if (session.aiDraft && !text) setText(session.aiDraft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  async function handleSend() {
    if (!text.trim()) return
    setSending('send')
    try {
      await sendAttendantMessage({
        clinicId,
        sessionId: session.id,
        to:        session.waPhone,
        text:      text.trim(),
      })
      setText('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar mensagem')
    } finally {
      setSending('')
    }
  }

  const displayName = session.patientName ?? formatPhone(session.waPhone)

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <User size={14} className="text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{displayName}</p>
            <p className="text-xs text-gray-400">{formatPhone(session.waPhone)}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            session.status === 'human'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {session.status === 'human' ? '👤 Humano' : '🤖 AI'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {session.status !== 'human' && (
            <button
              onClick={() => { setSending('escalate'); onEscalate().finally(() => setSending('')) }}
              disabled={!!sending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 disabled:opacity-50">
              <Headset size={13} />
              {sending === 'escalate' ? 'Atribuindo...' : 'Assumir'}
            </button>
          )}
          <button
            onClick={() => { setSending('resolve'); onResolve().finally(() => setSending('')) }}
            disabled={!!sending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-green-700 border border-green-200 rounded-lg hover:bg-green-50 disabled:opacity-50">
            <CheckCircle size={13} />
            {sending === 'resolve' ? 'Resolvendo...' : 'Resolver'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {loading && <p className="text-xs text-gray-400 text-center py-4">Carregando mensagens...</p>}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100">
        {session.aiDraft && text === session.aiDraft && (
          <div className="flex items-center gap-1.5 text-xs text-blue-600 mb-2 bg-blue-50 rounded-lg px-3 py-1.5">
            <Robot size={12} />
            Resposta sugerida pela IA — você pode editar antes de enviar.
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder="Digite uma mensagem... (Enter para enviar)"
            rows={2}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending === 'send'}
            className="px-4 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-40 transition-colors flex-shrink-0">
            <ArrowBendUpRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: WhatsAppMessage }) {
  const isInbound = message.direction === 'inbound'
  const timeStr   = format(new Date(message.createdAt), 'HH:mm')

  const SentByIcon = message.sentBy === 'ai'
    ? Robot
    : message.sentBy === 'attendant'
    ? Headset
    : null

  return (
    <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[72%] space-y-1 ${isInbound ? '' : ''}`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isInbound
            ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
            : 'bg-green-500 text-white rounded-tr-sm'
        }`}>
          {message.body ?? <span className="italic opacity-60">[mensagem removida — LGPD]</span>}
        </div>
        <div className={`flex items-center gap-1.5 ${isInbound ? 'justify-start pl-1' : 'justify-end pr-1'}`}>
          <span className="text-[11px] text-gray-400">{timeStr}</span>
          {SentByIcon && <SentByIcon size={11} className="text-gray-400" />}
          {!isInbound && message.deliveryStatus === 'read'      && <Checks size={12} className="text-blue-400" />}
          {!isInbound && message.deliveryStatus === 'delivered' && <Checks size={12} className="text-gray-400" />}
          {!isInbound && message.deliveryStatus === 'sent'      && <Check  size={12} className="text-gray-400" />}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('55') && d.length === 13) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  }
  if (d.startsWith('55') && d.length === 12) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  }
  return `+${phone}`
}
