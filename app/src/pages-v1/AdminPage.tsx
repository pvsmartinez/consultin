import { useState } from 'react'
import { Buildings, Users, Shield, ArrowLeft, ChartBar, Bell, ClockCountdown } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { useSignupRequests } from '../hooks/useAdmin'
import type { Tab, Reminder } from './admin/types'
import OverviewTab   from './admin/OverviewTab'
import RemindersTab  from './admin/RemindersTab'
import ClinicsTab    from './admin/ClinicsTab'
import UsersTab      from './admin/UsersTab'
import AprovacoesTab from './admin/AprovacoesTab'

// ─── Apple key expiry (update this date after each key rotation) ──────────────
const APPLE_KEY_EXPIRY = new Date('2026-08-28')

// ─── Reminders config — add new items here whenever needed ───────────────────
const REMINDERS: Reminder[] = [
  {
    id: 'apple-key',
    title: 'Apple OAuth Secret Key',
    description: 'A chave secreta do OAuth da Apple expira a cada 6 meses. Gere uma nova chave no Apple Developer Console e atualize no Supabase.',
    expiresAt: APPLE_KEY_EXPIRY,
    warnDaysBefore: 30,
    link: 'https://developer.apple.com/account/resources/authkeys/list',
    linkLabel: 'Apple Developer Console',
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('overview')

  const now = new Date()
  const activeReminders = REMINDERS.filter(r => {
    const daysLeft = (r.expiresAt.getTime() - now.getTime()) / 86_400_000
    return daysLeft <= r.warnDaysBefore
  })

  const { data: signupRequests = [] } = useSignupRequests()
  const pendingCount = signupRequests.filter(r => r.status === 'pending').length

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top bar */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <Link to="/dashboard" className="text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-amber-400" />
          <span className="font-medium text-sm">Painel do Desenvolvedor</span>
        </div>
        <span className="ml-auto text-xs text-gray-500 font-mono">/admin</span>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Warning banner */}
        <div className="bg-amber-950/50 border border-amber-700/50 rounded-xl px-4 py-3 text-amber-300 text-sm">
          ⚠️ Área restrita — apenas super admins têm acesso a esta página.
          Alterações aqui afetam diretamente o banco de dados.
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-900 p-1 rounded-xl flex-wrap">
          {([
            { id: 'overview'   as Tab, label: 'Overview',   icon: ChartBar },
            { id: 'clinics'    as Tab, label: 'Clínicas',   icon: Buildings },
            { id: 'users'      as Tab, label: 'Usuários',   icon: Users },
            { id: 'aprovacoes' as Tab, label: 'Aprovações', icon: ClockCountdown, badge: pendingCount },
            { id: 'reminders'  as Tab, label: 'Lembretes',  icon: Bell,            badge: activeReminders.length },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${tab === t.id ? 'bg-gray-700 text-white font-medium' : 'text-gray-400 hover:text-gray-200'}`}>
              <t.icon size={15} />
              {t.label}
              {t.badge ? (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === 'overview'   && <OverviewTab />}
        {tab === 'clinics'    && <ClinicsTab />}
        {tab === 'users'      && <UsersTab />}
        {tab === 'aprovacoes' && <AprovacoesTab />}
        {tab === 'reminders'  && <RemindersTab reminders={REMINDERS} />}
      </div>
    </div>
  )
}

