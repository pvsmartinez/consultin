import { useState, useEffect } from 'react'
import { IMaskInput } from 'react-imask'
import { toast } from 'sonner'
import { useMyPatient } from '../hooks/usePatients'

interface ProfileForm {
  name: string
  phone: string
  email: string
  cpf: string
}

export default function MeuPerfilPage() {
  const { patient, loading, updatePatient, updating } = useMyPatient()
  const [form, setForm] = useState<ProfileForm>({ name: '', phone: '', email: '', cpf: '' })

  // Sync form once patient data loads
  useEffect(() => {
    if (patient) {
      setForm({
        name:  patient.name ?? '',
        phone: patient.phone ?? '',
        email: patient.email ?? '',
        cpf:   patient.cpf ?? '',
      })
    }
  }, [patient])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updatePatient({ name: form.name, phone: form.phone, email: form.email, cpf: form.cpf || null })
      toast.success('Perfil atualizado!')
    } catch {
      toast.error('Erro ao salvar perfil.')
    }
  }

  if (loading) {
    return <p className="text-center text-gray-400 text-sm py-12">Carregando...</p>
  }

  if (!patient) {
    return (
      <p className="text-center text-gray-400 text-sm py-12">
        Nenhum cadastro de paciente vinculado à sua conta.
      </p>
    )
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-800 mb-6">Meu Perfil</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
            <IMaskInput
              mask="000.000.000-00"
              value={form.cpf}
              onAccept={(val: string) => setForm(p => ({ ...p, cpf: val }))}
              placeholder="000.000.000-00"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
            <IMaskInput
              mask="{(}00{)} 00000-0000"
              value={form.phone}
              onAccept={(val: string) => setForm(p => ({ ...p, phone: val }))}
              placeholder="(11) 99999-9999"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
            />
          </div>

          <button
            type="submit"
            disabled={updating}
            className="w-full text-white rounded-xl py-2.5 text-sm font-medium transition-all active:scale-[0.99] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
          >
            {updating ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>
      </div>
    </div>
  )
}
