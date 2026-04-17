import { useState, useRef } from 'react'
import { toast } from 'sonner'
import {
  Camera,
  Key,
  Link,
  Eye,
  EyeSlash,
  CheckCircle,
} from '@phosphor-icons/react'
import type { UserIdentity } from '@supabase/supabase-js'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'

type Tab = 'dados' | 'senha' | 'acessos'

// Initials avatar fallback
function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
  return (
    <div className="w-20 h-20 rounded-full bg-teal-100 flex items-center justify-center text-xl font-semibold text-[#006970] select-none">
      {initials}
    </div>
  )
}

function PasswordInput({
  label, value, onChange, show, onToggle, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void
  show: boolean; onToggle: () => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-base focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {show ? <EyeSlash size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}

export default function MinhaContaPage() {
  const { profile, session, refreshProfile } = useAuthContext()
  const [tab, setTab] = useState<Tab>('dados')

  // ─── Dados ────────────────────────────────────────────────────────────────
  const [name, setName]         = useState(profile?.name ?? '')
  const [previewUrl, setPreviewUrl] = useState<string | null>(profile?.avatarUrl ?? null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [savingDados, setSavingDados] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { toast.error('Imagem deve ter no máximo 3 MB.'); return }
    setAvatarFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleSaveDados = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session || !profile) return
    setSavingDados(true)
    try {
      let newAvatarUrl = profile.avatarUrl

      if (avatarFile) {
        const ext  = avatarFile.name.split('.').pop()
        const path = `${profile.id}/avatar.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type })
        if (uploadErr) throw uploadErr

        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        // add cache-bust so the browser reloads the image
        newAvatarUrl = `${urlData.publicUrl}?t=${Date.now()}`
      }

      const { error: profileErr } = await supabase
        .from('user_profiles')
        .update({ name: name.trim(), avatar_url: newAvatarUrl })
        .eq('id', profile.id)
      if (profileErr) throw profileErr

      await refreshProfile()
      setAvatarFile(null)
      toast.success('Dados salvos!')
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Erro ao salvar.')
    } finally {
      setSavingDados(false)
    }
  }

  // ─── Senha ────────────────────────────────────────────────────────────────
  const [oldPw,     setOldPw]     = useState('')
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showOld,   setShowOld]   = useState(false)
  const [showNew,   setShowNew]   = useState(false)
  const [showConf,  setShowConf]  = useState(false)
  const [savingSenha, setSavingSenha] = useState(false)

  const hasEmailProvider = session?.user.identities?.some(i => i.provider === 'email') ?? false

  const handleSaveSenha = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.user.email) return
    if (newPw.length < 8) { toast.error('Nova senha deve ter pelo menos 8 caracteres.'); return }
    if (newPw !== confirmPw) { toast.error('Confirmação da senha não confere.'); return }
    setSavingSenha(true)
    try {
      // Verify old password by re-authenticating
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: oldPw,
      })
      if (authErr) { toast.error('Senha antiga incorreta.'); return }

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw })
      if (updateErr) throw updateErr

      setOldPw(''); setNewPw(''); setConfirmPw('')
      toast.success('Senha alterada com sucesso!')
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Erro ao alterar senha.')
    } finally {
      setSavingSenha(false)
    }
  }

  // ─── Acessos ──────────────────────────────────────────────────────────────
  const identities: UserIdentity[] = session?.user.identities ?? []
  const hasGoogle = identities.some(i => i.provider === 'google')
  const hasApple  = identities.some(i => i.provider === 'apple')

  const handleLinkProvider = async (provider: 'google' | 'apple') => {
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: window.location.origin + '/minha-conta' },
    })
    // linkIdentity redirects on success — if we're still here, it failed
    if (error) toast.error(error.message)
  }

  const handleLinkGoogle = () => handleLinkProvider('google')
  const handleLinkApple  = () => handleLinkProvider('apple')

  const handleUnlink = async (identity: UserIdentity) => {
    if (identities.length <= 1) {
      toast.error('Você precisa ter ao menos um método de acesso.')
      return
    }
    const { error } = await supabase.auth.unlinkIdentity(identity)
    if (error) { toast.error(error.message); return }
    toast.success(`${providerLabel(identity.provider)} desvinculado.`)
    // force page reload so session.user.identities updates
    window.location.reload()
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!profile || !session) return null

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dados',   label: 'Dados pessoais' },
    { id: 'senha',   label: 'Senha' },
    { id: 'acessos', label: 'Formas de acesso' },
  ]

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-lg font-semibold text-gray-800">Minha Conta</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm rounded-lg transition-colors ${
              tab === t.id
                ? 'bg-white text-gray-800 shadow-sm font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: DADOS ─────────────────────────────────────────── */}
      {tab === 'dados' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <form onSubmit={handleSaveDados} className="space-y-5">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
                {previewUrl
                  ? <img src={previewUrl} alt="avatar" className="w-20 h-20 rounded-full object-cover" />
                  : <Initials name={name || profile.name} />
                }
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera size={20} className="text-white" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Foto de perfil</p>
                <p className="text-xs text-gray-400 mt-0.5">JPG, PNG ou WEBP · máx. 3 MB</p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="mt-1.5 text-xs text-[#006970] hover:underline"
                >
                  Alterar foto
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
              />
            </div>

            {/* E-mail (read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                type="email"
                value={session.user.email ?? ''}
                readOnly
                className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5 text-base text-gray-500 cursor-default"
              />
              <p className="text-xs text-gray-400 mt-1">O e-mail não pode ser alterado por aqui.</p>
            </div>

            <button
              type="submit"
              disabled={savingDados}
              className="w-full text-white rounded-xl py-2.5 text-sm font-medium transition-all active:scale-[0.99] disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
            >
              {savingDados ? 'Salvando...' : 'Salvar dados'}
            </button>
          </form>
        </div>
      )}

      {/* ── TAB: SENHA ─────────────────────────────────────────── */}
      {tab === 'senha' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {!hasEmailProvider ? (
            <div className="text-center py-6 space-y-2">
              <Key size={32} className="mx-auto text-gray-300" />
              <p className="text-sm text-gray-500">
                Sua conta não usa senha — você entra via Google ou Apple.
              </p>
              <p className="text-xs text-gray-400">
                Para adicionar senha, vá em <strong>Formas de acesso</strong> e vincule seu e-mail.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSaveSenha} className="space-y-4">
              <p className="text-sm text-gray-500 mb-2">
                Confirme sua senha atual e escolha uma nova.
              </p>
              <PasswordInput
                label="Senha atual"
                value={oldPw}
                onChange={setOldPw}
                show={showOld}
                onToggle={() => setShowOld(v => !v)}
                placeholder="••••••••"
              />
              <PasswordInput
                label="Nova senha"
                value={newPw}
                onChange={setNewPw}
                show={showNew}
                onToggle={() => setShowNew(v => !v)}
                placeholder="Mínimo 8 caracteres"
              />
              <PasswordInput
                label="Confirmar nova senha"
                value={confirmPw}
                onChange={setConfirmPw}
                show={showConf}
                onToggle={() => setShowConf(v => !v)}
                placeholder="Repita a nova senha"
              />
              <button
                type="submit"
                disabled={savingSenha || !oldPw || !newPw || !confirmPw}
                className="w-full text-white rounded-xl py-2.5 text-sm font-medium transition-all active:scale-[0.99] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
              >
                {savingSenha ? 'Salvando...' : 'Alterar senha'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── TAB: ACESSOS ───────────────────────────────────────── */}
      {tab === 'acessos' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm text-gray-500">
            Adicione formas de entrar na conta. Com múltiplos acessos, você pode usar e-mail/senha
            <em> ou</em> Google <em>ou</em> Apple — com a mesma conta.
          </p>

          <ProviderRow
            icon={<GoogleIcon />}
            label="Google"
            linked={hasGoogle}
            identity={identities.find(i => i.provider === 'google')}
            canUnlink={identities.length > 1}
            onLink={handleLinkGoogle}
            onUnlink={handleUnlink}
          />

          <ProviderRow
            icon={<AppleIcon />}
            label="Apple"
            linked={hasApple}
            identity={identities.find(i => i.provider === 'apple')}
            canUnlink={identities.length > 1}
            onLink={handleLinkApple}
            onUnlink={handleUnlink}
          />

          {identities.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">Métodos vinculados</p>
              <div className="flex flex-wrap gap-2">
                {identities.map(i => (
                  <span key={i.identity_id} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 capitalize">
                    <CheckCircle size={12} className="text-green-500" />
                    {providerLabel(i.provider)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProviderRow({
  icon, label, linked, identity, canUnlink, onLink, onUnlink,
}: {
  icon: React.ReactNode
  label: string
  linked: boolean
  identity: UserIdentity | undefined
  canUnlink: boolean
  onLink: () => void
  onUnlink: (identity: UserIdentity) => void
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center">{icon}</div>
        <div>
          <p className="text-sm font-medium text-gray-800">{label}</p>
          <p className="text-xs text-gray-400">{linked ? 'Vinculado' : 'Não vinculado'}</p>
        </div>
      </div>
      {linked ? (
        <button
          onClick={() => identity && onUnlink(identity)}
          disabled={!canUnlink}
          title={!canUnlink ? 'Mantenha ao menos um método de acesso' : undefined}
          className="text-xs text-red-500 hover:text-red-700 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Remover
        </button>
      ) : (
        <button
          onClick={onLink}
          className="flex items-center gap-1.5 text-xs text-[#006970] hover:text-[#004f55] font-medium transition-colors"
        >
          <Link size={13} />
          Conectar
        </button>
      )}
    </div>
  )
}

function providerLabel(provider: string): string {
  const map: Record<string, string> = {
    email: 'E-mail',
    google: 'Google',
    apple: 'Apple',
    github: 'GitHub',
  }
  return map[provider] ?? provider
}

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.2 0 5.8 1.1 7.9 2.9l5.9-5.9C34.2 3.5 29.5 1.5 24 1.5 14.8 1.5 7 7.3 3.7 15.4l6.9 5.4C12.3 14.1 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.8-2.1 5.2-4.5 6.8l7 5.4C42.8 37 46.1 31.2 46.1 24.5z" />
    <path fill="#FBBC05" d="M10.6 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-6.9-5.4A22.5 22.5 0 001.5 24c0 3.6.9 7 2.4 9.9l6.7-5.2z" />
    <path fill="#34A853" d="M24 46.5c5.5 0 10.1-1.8 13.5-4.9l-7-5.4c-1.9 1.3-4.3 2-6.5 2-6.3 0-11.6-4.6-13.6-10.8l-6.7 5.2C7 40.7 14.8 46.5 24 46.5z" />
  </svg>
)

const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 814 1000" fill="currentColor" aria-hidden="true">
    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 376.5 0 246.5 0 122.7c0-71.2 26.1-136.6 73.1-183.6C120.1-14.2 186.4-42 256-42c66.5 0 122.7 40.1 164 40.1 39.2 0 101.2-42.4 180.3-42.4 28 0 106.9 2.6 164 76zm-87.5-221.8c35.5-41.5 61.6-100.5 61.6-159.3 0-7.8-.7-15.9-1.9-22.7-57.8 2.6-128.5 37.6-171.7 86.5-32.1 36.2-62.5 96.1-62.5 155.9 0 8.4 1.3 16.9 1.9 19.5 3.2.6 8.4 1.3 13.6 1.3 51.8 0 116.1-33.7 158.9-81.2z" />
  </svg>
)
