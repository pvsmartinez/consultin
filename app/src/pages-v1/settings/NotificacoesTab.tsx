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
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Notificações pessoais</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Receba alertas no seu próprio WhatsApp enviados pela clínica.
        </p>
      </div>

      {/* How it works */}
      <div className="flex gap-3 bg-teal-50 border border-teal-100 rounded-xl p-4 text-sm text-[#006970]">
        <Info size={16} className="flex-shrink-0 mt-0.5" />
        <p>
          As notificações são enviadas pela conta <strong>WhatsApp Business da clínica</strong>{' '}
          para o seu número pessoal. Você as recebe como qualquer outra mensagem — sem precisar
          abrir o sistema.
        </p>
      </div>

      {/* Phone number */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <WhatsappLogo size={16} className="text-green-500" />
          <p className="text-sm font-semibold text-gray-700">Seu número pessoal</p>
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
        <p className="text-xs text-gray-400">
          Formato internacional sem espaços — ex: <strong>5511999990000</strong>
        </p>
      </div>

      {/* Alert toggles */}
      <div className={`bg-white rounded-xl border divide-y divide-gray-100 ${!hasPhone ? 'opacity-50 pointer-events-none' : ''} border-gray-200`}>
        <div className="flex items-center gap-2 px-4 py-3">
          <Bell size={14} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">
            Quais eventos me avisam?
          </p>
          {!hasPhone && (
            <span className="ml-auto text-xs text-gray-400">Informe seu número primeiro</span>
          )}
        </div>
        {NOTIF_OPTIONS.map(({ field, camelKey, label, desc }) => {
          const value = profile[camelKey] as boolean
          return (
            <div key={field} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
              <button
                onClick={() => handleToggle(field, !value)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${value ? 'bg-[#0ea5b0]' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          )
        })}
      </div>

      {hasPhone && !anyToggleOn && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Nenhum alerta ativado — você não receberá mensagens até habilitar pelo menos um.
        </p>
      )}
    </div>
  )
}
