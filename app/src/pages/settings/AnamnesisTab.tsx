/**
 * AnamnesisTab — Settings tab for configuring the clinic's anamnesis questionnaire.
 *
 * The clinic defines questions here (label, type, required).
 * Professionals fill the questionnaire per patient at /pacientes/:id/anamnese.
 * By default the list is empty — no questions are imposed on any clinic.
 */
import { useState, useEffect } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useClinic } from '../../hooks/useClinic'
import type { Clinic, CustomFieldDef, CustomFieldType } from '../../types'

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text',        label: 'Texto livre' },
  { value: 'boolean',     label: 'Sim / Não' },
  { value: 'select',      label: 'Lista de opções (1 escolha)' },
  { value: 'multiselect', label: 'Lista de opções (múltiplas escolhas)' },
  { value: 'number',      label: 'Número' },
  { value: 'date',        label: 'Data' },
]

interface NewField {
  label:      string
  type:       CustomFieldType
  required:   boolean
  optionsRaw: string  // comma-separated, only for select/multiselect
}

const EMPTY_FIELD: NewField = { label: '', type: 'text', required: false, optionsRaw: '' }

export default function AnamnesisTab({ clinic }: { clinic: Clinic }) {
  const { update } = useClinic()
  const [fields, setFields]   = useState<CustomFieldDef[]>(clinic.anamnesisFields ?? [])
  const [newField, setNewField] = useState<NewField>(EMPTY_FIELD)
  const [saving, setSaving]   = useState(false)

  // Resync when clinic data reloads
  useEffect(() => { setFields(clinic.anamnesisFields ?? []) }, [clinic.anamnesisFields])

  function addField() {
    const label = newField.label.trim()
    if (!label) { toast.error('Informe o nome da pergunta.'); return }
    const key = `anamnesis_${Date.now()}`
    const options = (newField.type === 'select' || newField.type === 'multiselect')
      ? newField.optionsRaw.split(',').map(o => o.trim()).filter(Boolean)
      : undefined

    setFields(prev => [
      ...prev,
      { key, label, type: newField.type, required: newField.required, ...(options ? { options } : {}) },
    ])
    setNewField(EMPTY_FIELD)
  }

  function removeField(key: string) {
    setFields(prev => prev.filter(f => f.key !== key))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await update.mutateAsync({ anamnesisFields: fields })
      toast.success('Anamnese salva!')
    } catch {
      toast.error('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const needsOptions = newField.type === 'select' || newField.type === 'multiselect'

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Configure as perguntas do formulário de anamnese que seus profissionais preencherão
        por paciente. Por padrão nenhuma pergunta está ativa — adicione apenas o que for
        relevante para a especialidade da sua clínica.
      </p>

      {/* Current questions */}
      {fields.length > 0 ? (
        <ul className="space-y-2">
          {fields.map(f => (
            <li key={f.key}
              className="flex items-center gap-3 px-3 py-2.5 bg-white border border-gray-200 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{f.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {FIELD_TYPES.find(t => t.value === f.type)?.label ?? f.type}
                  {f.required && <span className="ml-2 text-red-400">obrigatório</span>}
                  {f.options?.length ? ` · opções: ${f.options.join(', ')}` : ''}
                </p>
              </div>
              <button
                onClick={() => removeField(f.key)}
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                title="Remover pergunta"
              >
                <Trash size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400 italic">Nenhuma pergunta configurada ainda.</p>
      )}

      {/* Add new question */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nova pergunta</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pergunta</label>
            <input
              type="text"
              value={newField.label}
              onChange={e => setNewField(p => ({ ...p, label: e.target.value }))}
              placeholder="Ex: Tem alguma alergia?"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de resposta</label>
            <select
              value={newField.type}
              onChange={e => setNewField(p => ({ ...p, type: e.target.value as CustomFieldType, optionsRaw: '' }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
            >
              {FIELD_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {needsOptions && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Opções <span className="font-normal text-gray-400">(separadas por vírgula)</span>
            </label>
            <input
              type="text"
              value={newField.optionsRaw}
              onChange={e => setNewField(p => ({ ...p, optionsRaw: e.target.value }))}
              placeholder="Ex: Sim, Não, Às vezes"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
            />
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
          <input
            type="checkbox"
            checked={newField.required}
            onChange={e => setNewField(p => ({ ...p, required: e.target.checked }))}
            className="rounded border-gray-300 accent-blue-600"
          />
          Resposta obrigatória
        </label>

        <button
          onClick={addField}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#006970] border border-teal-200 rounded-xl hover:bg-teal-50 transition"
        >
          <Plus size={14} />
          Adicionar pergunta
        </button>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
          className="px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-50 transition-all active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
      >
        {saving ? 'Salvando...' : 'Salvar anamnese'}
      </button>
    </div>
  )
}
