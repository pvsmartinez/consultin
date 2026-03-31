/**
 * EntityFieldsPanel
 *
 * Shared component for editing builtin field visibility + custom fields for an entity
 * (patient or professional).
 *
 * Works in two modes:
 *   - Settings mode (onNext is undefined): shows a standalone "Salvar" button.
 *   - Wizard mode (onNext is provided): shows WizardNavBar with back/next buttons.
 */
import { useState, useEffect } from 'react'
import { Plus, Trash, ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useClinic } from '../../hooks/useClinic'
import type { Clinic, CustomFieldDef, CustomFieldType, FieldConfig } from '../../types'

// ─── Field type options ───────────────────────────────────────────────────────

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text',        label: 'Texto' },
  { value: 'textarea',    label: 'Texto longo / observação' },
  { value: 'number',      label: 'Número' },
  { value: 'date',        label: 'Data' },
  { value: 'select',      label: 'Lista de opções (1 escolha)' },
  { value: 'multiselect', label: 'Lista de opções (múltiplas escolhas)' },
  { value: 'boolean',     label: 'Sim / Não' },
]

// ─── FieldToggleList helper ───────────────────────────────────────────────────

function FieldToggleList({
  fields,
  isVisible,
  toggle,
}: {
  fields: { key: string; label: string }[]
  isVisible: (key: string) => boolean
  toggle: (key: string) => void
}) {
  return (
    <div className="space-y-1">
      {fields.map(f => (
        <label key={f.key}
          className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 cursor-pointer">
          <div className="relative inline-flex items-center cursor-pointer shrink-0">
            <input type="checkbox" className="sr-only peer"
              checked={isVisible(f.key)} onChange={() => toggle(f.key)} />
            <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-[#0ea5b0] transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </div>
          <span className={`text-sm ${isVisible(f.key) ? 'text-gray-700' : 'text-gray-400 line-through'}`}>
            {f.label}
          </span>
        </label>
      ))}
    </div>
  )
}

// ─── EntityFieldsPanel ───────────────────────────────────────────────────────

export interface EntityFieldsPanelProps {
  entityLabel: string
  builtinFields: { key: string; label: string; group?: string }[]
  fieldConfig: Record<string, boolean>
  customFields: CustomFieldDef[]
  /** Called with the updated config; returns the Partial<Clinic> to persist. */
  onSave: (config: FieldConfig, custom: CustomFieldDef[]) => Partial<Clinic>
  /** Wizard mode: title shown above the form. */
  title?: string
  /** Wizard mode: subtitle shown below the title. */
  subtitle?: string
  /** Wizard mode: navigates to the previous step. */
  onBack?: () => void
  /** Wizard mode: called after a successful save. When provided, WizardNavBar is shown instead of the standalone save button. */
  onNext?: () => void
}

export default function EntityFieldsPanel({
  entityLabel,
  builtinFields,
  fieldConfig,
  customFields,
  onSave,
  title,
  subtitle,
  onBack,
  onNext,
}: EntityFieldsPanelProps) {
  const { update } = useClinic()
  const [config, setConfig] = useState<FieldConfig>(fieldConfig)
  const [fields, setFields] = useState<CustomFieldDef[]>(customFields)
  const [saving, setSaving]  = useState(false)

  // Resync when parent data changes (e.g. switching entity sub-tab in settings)
  useEffect(() => { setConfig(fieldConfig) }, [fieldConfig])
  useEffect(() => { setFields(customFields)  }, [customFields])

  const [newField, setNewField] = useState<Partial<CustomFieldDef & { optionsRaw: string }>>({
    type: 'text', required: false, optionsRaw: '',
  })

  function isVisible(key: string) { return config[key] !== false }
  function toggle(key: string)    { setConfig(prev => ({ ...prev, [key]: !isVisible(key) })) }

  function addField() {
    if (!newField.label?.trim()) { toast.error('Informe o nome do campo'); return }
    const key = newField.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (fields.some(f => f.key === key)) { toast.error('Já existe um campo com esse nome'); return }
    const options = (newField.type === 'select' || newField.type === 'multiselect')
      ? (newField.optionsRaw ?? '').split('\n').map(s => s.trim()).filter(Boolean)
      : undefined
    setFields(prev => [...prev, {
      key,
      label:    newField.label!,
      type:     newField.type ?? 'text',
      required: newField.required ?? false,
      ...(options?.length ? { options } : {}),
    }])
    setNewField({ type: 'text', required: false, optionsRaw: '' })
  }

  function removeField(key: string) {
    setFields(prev => prev.filter(f => f.key !== key))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await update.mutateAsync(onSave(config, fields))
      if (onNext) {
        onNext()
      } else {
        toast.success('Configurações salvas!')
      }
    } catch {
      toast.error('Erro ao salvar campos')
    } finally {
      setSaving(false)
    }
  }

  const groups = Array.from(
    new Set(builtinFields.map(f => f.group ?? ''))
  ).filter(Boolean)
  const hasGroups = groups.length > 1
  const needsOptions = newField.type === 'select' || newField.type === 'multiselect'
  const isWizardMode = !!onNext

  return (
    <div className="space-y-6">
      {/* Wizard header */}
      {(title || subtitle) && (
        <div>
          {title   && <h2 className="text-lg font-semibold text-gray-800 mb-1">{title}</h2>}
          {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
        </div>
      )}

      {/* Built-in toggles */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
          Campos padrão
        </p>
        {hasGroups ? (
          groups.map(grp => (
            <div key={grp} className="mb-4">
              <p className="text-xs font-medium text-gray-400 mb-2">{grp}</p>
              <FieldToggleList
                fields={builtinFields.filter(f => f.group === grp)}
                isVisible={isVisible}
                toggle={toggle}
              />
            </div>
          ))
        ) : (
          <FieldToggleList fields={builtinFields} isVisible={isVisible} toggle={toggle} />
        )}
      </div>

      {/* Custom fields */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
          Campos extras para {entityLabel}s desta clínica
        </p>

        {fields.length > 0 && (
          <div className="space-y-2 mb-4">
            {fields.map(f => (
              <div key={f.key} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-700">{f.label}</p>
                  <p className="text-xs text-gray-400">
                    {FIELD_TYPES.find(t => t.value === f.type)?.label}
                    {f.required ? ' · Obrigatório' : ''}
                  </p>
                </div>
                <button onClick={() => removeField(f.key)} className="text-gray-400 hover:text-red-500">
                  <Trash size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new custom field form */}
        <div className="border border-dashed border-gray-300 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Adicionar campo personalizado</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nome do campo</label>
              <input
                value={newField.label ?? ''}
                onChange={e => setNewField(p => ({ ...p, label: e.target.value }))}
                placeholder={`ex: ${entityLabel === 'paciente' ? 'Plano de saúde' : 'Área de atuação'}`}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo</label>
              <select
                value={newField.type}
                onChange={e => setNewField(p => ({ ...p, type: e.target.value as CustomFieldType, optionsRaw: '' }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
              >
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {needsOptions && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Opções <span className="text-gray-400">(uma por linha)</span>
              </label>
              <textarea
                value={newField.optionsRaw ?? ''}
                onChange={e => setNewField(p => ({ ...p, optionsRaw: e.target.value }))}
                rows={3}
                placeholder={entityLabel === 'paciente' ? 'Particular\nUnimed\nBradesco Saúde' : 'Clínica Geral\nPediatra\nOrtodontista'}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] resize-none"
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={newField.required ?? false}
                onChange={e => setNewField(p => ({ ...p, required: e.target.checked }))} className="rounded" />
              Campo obrigatório
            </label>
            <button type="button" onClick={addField}
              className="flex items-center gap-2 text-sm text-[#006970] hover:text-[#004f55] font-medium">
              <Plus size={15} /> Adicionar
            </button>
          </div>
        </div>
      </div>

      {/* Footer: wizard nav or standalone save */}
      {isWizardMode ? (
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-4">
          <div>
            {onBack && (
              <button type="button" onClick={onBack}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                <ArrowLeft size={15} /> Voltar
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-all active:scale-[0.99]"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
          >
            {saving ? 'Salvando…' : 'Salvar e continuar'}
            {!saving && <ArrowRight size={15} />}
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm text-white rounded-xl disabled:opacity-40 transition-all active:scale-[0.99]"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
          >
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      )}
    </div>
  )
}
