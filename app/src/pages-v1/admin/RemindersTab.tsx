import { Bell, Warning } from '@phosphor-icons/react'
import type { Reminder } from './types'

interface RemindersTabProps {
  reminders: Reminder[]
}

export default function RemindersTab({ reminders }: RemindersTabProps) {
  const now = new Date()

  function getStatus(r: Reminder) {
    const msLeft   = r.expiresAt.getTime() - now.getTime()
    const daysLeft = Math.ceil(msLeft / 86_400_000)
    if (daysLeft < 0)              return { label: 'EXPIRADO',              color: 'bg-red-500/20 text-red-400 border-red-500/40',     urgent: true }
    if (daysLeft <= r.warnDaysBefore) return { label: `${daysLeft}d restantes`, color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', urgent: true }
    return { label: `${daysLeft}d restantes`, color: 'bg-gray-800 text-gray-400 border-gray-700', urgent: false }
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-400 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
        Lembretes de manutenção do sistema. O workflow no GitHub Actions também enviará uma
        notificação via Telegram 30 dias antes de cada expiração.
      </div>

      {reminders.map(r => {
        const status = getStatus(r)
        return (
          <div key={r.id}
            className={`border rounded-xl p-5 space-y-3 ${status.urgent ? 'bg-amber-950/20 border-amber-700/40' : 'bg-gray-900 border-gray-800'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                {status.urgent ? (
                  <Warning size={18} className="text-amber-400 flex-shrink-0" />
                ) : (
                  <Bell size={18} className="text-gray-500 flex-shrink-0" />
                )}
                <p className="font-medium text-gray-200 text-sm">{r.title}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${status.color}`}>
                {status.label}
              </span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">{r.description}</p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>Expira: <span className="text-gray-300">{r.expiresAt.toLocaleDateString('pt-BR')}</span></span>
              <span>Aviso: {r.warnDaysBefore} dias antes</span>
              {r.link && (
                <a href={r.link} target="_blank" rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline">
                  {r.linkLabel ?? r.link}
                </a>
              )}
            </div>
          </div>
        )
      })}

      <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-xs text-gray-400 space-y-1">
        <p className="font-medium text-gray-300">Adicionar novo lembrete</p>
        <p>
          Edite o array <span className="font-mono text-blue-400">REMINDERS</span> no topo de{' '}
          <span className="font-mono text-blue-400">AdminPage.tsx</span> e faça deploy.
        </p>
      </div>
    </div>
  )
}
