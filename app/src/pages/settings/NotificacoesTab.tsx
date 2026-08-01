import { useState } from 'react'
import { WhatsappLogo, Bell, Info } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { supabase } from '../../services/supabase'
import { useAuthContext } from '../../contexts/AuthContext'

type NotifField = 'notif_new_appointment' | 'notif_cancellation' | 'notif_no_show' | 'notif_payment_overdue'

const NOTIF_OPTIONS: { field: NotifField; camelKey: 'notifNewAppointment' | 'notifCancellation' | 'notifNoShow' | 'notifPaymentOverdue'; label: string; desc: string }[] = [
  {
    field:    'notif_new_appointment',
    camelKey: 'notifNewAppointment',
    label:    'Nova consulta agendada',
    desc:     'Avisa quando um paciente agenda uma consulta',
  },
  {
    field:    'notif_cancellation',
    camelKey: 'notifCancellation',
    label:    'Consulta cancelada',
    desc:     'Avisa quando um paciente cancela',
  },
  {
    field:    'notif_no_show',
    camelKey: 'notifNoShow',
    label:    'Paciente faltou',
    desc:     'Avisa quando uma consulta é marcada como falta',
  },
  {
    field:    'notif_payment_overdue',
    camelKey: 'notifPaymentOverdue',
    label:    'Pagamento em atraso',
    desc:     'Avisa quando um pagamento fica em aberto por mais de 24 h',
  },
]

function ToggleRow({
  label,
  desc,
  value,
  disabled,
  onToggle,
}: {
  label: string
  desc: string
  value: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="mt-1 text-xs text-gray-500">{desc}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${value ? 'bg-[#0ea5b0]' : 'bg-gray-200'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

export default function NotificacoesTab() {
  const { profile, refreshProfile } = useAuthContext()

  const [phone,   setPhone]   = useState(profile?.notificationPhone ?? '')
  const [saving,  setSaving]  = useState(false)

  if (!profile) return null

  async function handleSavePhone() {
    if (!profile) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ notification_phone: phone.trim() || null } as unknown as Record<string, unknown>)
        .eq('id', profile.id)
      if (error) throw error
      await refreshProfile()
      toast.success('Número salvo!')
    } catch (err) {
      toast.error((err as Error).message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(field: NotifField, value: boolean) {
    if (!profile) return
    const { error } = await supabase
      .from('user_profiles')
      .update({ [field]: value } as unknown as Record<string, unknown>)
      .eq('id', profile.id)
    if (error) { toast.error('Erro ao salvar'); return }
    await refreshProfile()
    toast.success('Preferência salva')
  }

  const hasPhone = !!profile.notificationPhone
  const anyToggleOn = NOTIF_OPTIONS.some(o => profile[o.camelKey])

  return (
    <div className="max-w-2xl space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(247,250,252,0.98))] px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold text-gray-900">Notificações pessoais</h2>
        <p className="mt-1 text-sm text-gray-500">Escolha quais alertas você quer receber no WhatsApp.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${hasPhone ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>
            {hasPhone ? 'Número salvo' : 'Sem número'}
          </span>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${anyToggleOn ? 'bg-green-50 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {anyToggleOn ? 'Alertas ativos' : 'Nenhum alerta ativo'}
          </span>
        </div>
      </section>

      <div className="flex gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm text-[#006970]">
        <Info size={16} className="flex-shrink-0 mt-0.5" />
        <p>
          Os alertas saem do WhatsApp Business da clínica para o seu número pessoal.
        </p>
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <WhatsappLogo size={16} className="text-green-500" />
          <p className="text-sm font-semibold text-gray-700">Seu número</p>
        </div>
        <div className="flex gap-2">
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="5511999990000"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-300 font-mono"
          />
          <button
            onClick={handleSavePhone}
            disabled={saving}
            className="px-4 py-2 text-white text-sm font-medium rounded-xl transition-all active:scale-[0.99] disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p className="text-xs text-gray-400">Use o formato 5511999990000.</p>
      </section>

      <section className={`bg-white rounded-2xl border divide-y divide-gray-100 ${!hasPhone ? 'opacity-50 pointer-events-none' : ''} border-gray-200`}>
        <div className="flex items-center gap-2 px-4 py-3">
          <Bell size={14} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">
            Eventos que disparam aviso
          </p>
          {!hasPhone && (
            <span className="ml-auto text-xs text-gray-400">Salve um número antes</span>
          )}
        </div>
        {NOTIF_OPTIONS.map(({ field, camelKey, label, desc }) => {
          const value = profile[camelKey] as boolean
          return (
            <ToggleRow
              key={field}
              label={label}
              desc={desc}
              value={value}
              disabled={!hasPhone}
              onToggle={() => handleToggle(field, !value)}
            />
          )
        })}
      </section>

      {hasPhone && !anyToggleOn && (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-600">
          Nenhum alerta ativado. Você não receberá mensagens até ligar pelo menos um evento.
        </p>
      )}
    </div>
  )
}
