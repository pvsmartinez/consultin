import { ArrowClockwise, ClockCountdown, Check, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { formatDateTime } from '../../utils/date'
import {
  useSignupRequests, useApproveSignupRequest, useRejectSignupRequest,
  type ClinicSignupRequest,
} from '../../hooks/useAdmin'

// ─── Aprovações Tab ───────────────────────────────────────────────────────────

export default function AprovacoesTab() {
  const { data: requests = [], isLoading, refetch, isFetching } = useSignupRequests()
  const approve = useApproveSignupRequest()
  const reject  = useRejectSignupRequest()

  const pending  = requests.filter(r => r.status === 'pending')
  const reviewed = requests.filter(r => r.status !== 'pending')

  async function handleApprove(r: ClinicSignupRequest) {
    if (!confirm(`Aprovar "${r.name}"? Um convite será enviado para ${r.email}.`)) return
    try {
      await approve.mutateAsync(r.id)
      toast.success(`"${r.name}" aprovada! Convite enviado para ${r.email}`)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao aprovar')
    }
  }

  async function handleReject(r: ClinicSignupRequest) {
    if (!confirm(`Rejeitar a solicitação de "${r.name}"?`)) return
    try {
      await reject.mutateAsync(r.id)
      toast.success(`"${r.name}" rejeitada`)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao rejeitar')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">
          Solicitações de cadastro de novas clínicas
        </h2>
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-40">
          <ArrowClockwise size={13} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading && (
        <p className="text-sm text-gray-500 text-center py-8">Carregando…</p>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-amber-400 uppercase tracking-wider">
            Aguardando revisão ({pending.length})
          </p>
          {pending.map(r => (
            <RequestCard key={r.id} r={r}
              onApprove={() => handleApprove(r)}
              onReject={() => handleReject(r)}
              isPending={approve.isPending || reject.isPending}
            />
          ))}
        </div>
      )}

      {!isLoading && pending.length === 0 && (
        <div className="text-center py-10 text-gray-600">
          <ClockCountdown size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhuma solicitação pendente.</p>
        </div>
      )}

      {/* Reviewed */}
      {reviewed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-4">
            Histórico
          </p>
          {reviewed.map(r => (
            <div key={r.id}
              className="flex items-center justify-between px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl opacity-60">
              <div>
                <p className="text-sm text-gray-200">{r.name}</p>
                <p className="text-xs text-gray-500">{r.email}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                r.status === 'approved'
                  ? 'bg-green-900/40 text-green-400'
                  : 'bg-red-900/40 text-red-400'
              }`}>
                {r.status === 'approved' ? 'Aprovada' : 'Rejeitada'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  r, onApprove, onReject, isPending,
}: {
  r: ClinicSignupRequest
  onApprove: () => void
  onReject: () => void
  isPending: boolean
}) {
  const date = formatDateTime(r.createdAt)

  return (
    <div className="bg-gray-900 border border-amber-700/30 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-gray-100">{r.name}</p>
          {r.cnpj && <p className="text-xs text-gray-500 font-mono">{r.cnpj}</p>}
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-700/40 whitespace-nowrap flex-shrink-0 font-medium">
          PENDENTE
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-xs text-gray-500">Responsável</span>
          <p className="text-gray-200">{r.responsibleName}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">E-mail</span>
          <p className="text-gray-200 break-all">{r.email}</p>
        </div>
        {r.phone && (
          <div>
            <span className="text-xs text-gray-500">Telefone</span>
            <p className="text-gray-200">{r.phone}</p>
          </div>
        )}
        <div>
          <span className="text-xs text-gray-500">Recebido em</span>
          <p className="text-gray-400 text-xs">{date}</p>
        </div>
      </div>

      {r.message && (
        <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-sm text-gray-300 italic">
          "{r.message}"
        </div>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onReject} disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 border border-red-700/50 hover:border-red-600 rounded-lg transition-colors disabled:opacity-40">
          <X size={14} /> Rejeitar
        </button>
        <button onClick={onApprove} disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-40">
          <Check size={14} /> Aprovar
        </button>
      </div>
    </div>
  )
}
