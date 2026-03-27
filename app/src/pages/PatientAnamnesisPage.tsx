/**
 * PatientAnamnesisPage  —  /pacientes/:id/anamnese
 *
 * Staff fills / edits the anamnesis questionnaire for a patient.
 * Questions are configured per-clinic in Configurações → Anamnese.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ClipboardText, Gear } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { usePatient, useUpdateAnamnesis } from '../hooks/usePatients'
import { useClinic } from '../hooks/useClinic'
import CustomFieldInput from '../components/ui/CustomFieldInput'

export default function PatientAnamnesisPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { patient, loading: loadingPatient } = usePatient(id!)
  const { data: clinic, isLoading: loadingClinic } = useClinic()
  const updateAnamnesis = useUpdateAnamnesis()

  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  // Seed form with existing answers when patient loads
  useEffect(() => {
    if (patient?.anamnesisData) setAnswers(patient.anamnesisData)
  }, [patient])

  if (loadingPatient || loadingClinic) {
    return <div className="text-center text-gray-400 text-sm mt-20">Carregando...</div>
  }

  if (!patient) {
    return (
      <div className="text-center mt-20">
        <p className="text-gray-500 mb-4">Paciente não encontrado.</p>
        <button onClick={() => navigate('/pacientes')} className="text-[#006970] text-sm hover:underline">
          Voltar para Pacientes
        </button>
      </div>
    )
  }

  const questions = clinic?.anamnesisFields ?? []

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateAnamnesis.mutateAsync({ patientId: id!, data: answers })
      toast.success('Anamnese salva!')
    } catch {
      toast.error('Erro ao salvar anamnese.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(`/pacientes/${id}`)}
          className="text-gray-400 hover:text-gray-600 transition"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Anamnese</h1>
          <p className="text-sm text-gray-400">{patient.name}</p>
        </div>
      </div>

      {questions.length === 0 ? (
        /* Empty state — nudge admin to configure */
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-3">
          <ClipboardText size={36} className="text-gray-200 mx-auto" />
          <p className="text-sm font-medium text-gray-700">
            Nenhuma pergunta de anamnese configurada
          </p>
          <p className="text-xs text-gray-400 max-w-xs mx-auto">
            Configure as perguntas em Configurações → Anamnese e elas aparecerão aqui para
            cada paciente.
          </p>
          <Link
            to="/configuracoes"
            className="inline-flex items-center gap-2 mt-2 text-sm text-[#006970] hover:underline"
          >
            <Gear size={14} />
            Ir para Configurações
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSave}
          className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">

          {questions.map(q => (
            <CustomFieldInput
              key={q.key}
              field={q}
              value={answers[q.key] ?? null}
              onChange={(key, value) => setAnswers(prev => ({ ...prev, [key]: value }))}
            />
          ))}

          <div className="pt-2 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-50 transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
            >
              {saving ? 'Salvando...' : 'Salvar anamnese'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/pacientes/${id}`)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
