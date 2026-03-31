import type { CustomFieldDef } from '../../types'
import Input from './Input'
import Select from './Select'
import TextArea from './TextArea'

interface Props {
  field: CustomFieldDef
  value: unknown
  onChange: (key: string, value: unknown) => void
}

/**
 * Renders the appropriate input for a clinic-defined custom field.
 * Supports: text, textarea, number, date, boolean, select, multiselect.
 */
export default function CustomFieldInput({ field, value, onChange }: Props) {

  if (field.type === 'boolean') {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-gray-300 accent-blue-600"
            checked={Boolean(value)}
            onChange={e => onChange(field.key, e.target.checked)}
          />
          <span className="text-sm text-gray-600">Sim</span>
        </label>
      </div>
    )
  }

  if (field.type === 'select') {
    const options = (field.options ?? []).map(o => ({ value: o, label: o }))
    return (
      <Select
        label={field.label}
        required={field.required}
        value={String(value ?? '')}
        onChange={e => onChange(field.key, e.target.value || null)}
        placeholder="Selecione..."
        options={options}
      />
    )
  }

  if (field.type === 'multiselect') {
    const selected: string[] = Array.isArray(value) ? (value as string[]) : []
    const options = field.options ?? []

    function toggle(opt: string) {
      const next = selected.includes(opt)
        ? selected.filter(s => s !== opt)
        : [...selected, opt]
      onChange(field.key, next.length ? next : null)
    }

    return (
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="flex flex-wrap gap-2">
          {options.map(opt => (
            <label key={opt} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition
              ${selected.includes(opt)
                ? 'bg-teal-50 border-[#0ea5b0] text-[#006970]'
                : 'border-gray-300 text-gray-600 hover:border-[#0ea5b0]'}`}>
              <input
                type="checkbox"
                className="sr-only"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    )
  }

  if (field.type === 'number') {
    return (
      <Input
        label={field.label}
        required={field.required}
        type="number"
        value={value != null ? String(value) : ''}
        onChange={e => onChange(field.key, e.target.value ? Number(e.target.value) : null)}
      />
    )
  }

  if (field.type === 'date') {
    return (
      <Input
        label={field.label}
        required={field.required}
        type="date"
        value={value != null ? String(value) : ''}
        onChange={e => onChange(field.key, e.target.value || null)}
      />
    )
  }

  if (field.type === 'textarea') {
    return (
      <div className="sm:col-span-2">
        <TextArea
          label={field.label}
          required={field.required}
          value={value != null ? String(value) : ''}
          onChange={e => onChange(field.key, e.target.value || null)}
        />
      </div>
    )
  }

  // default: text
  return (
    <Input
      label={field.label}
      required={field.required}
      value={value != null ? String(value) : ''}
      onChange={e => onChange(field.key, e.target.value || null)}
    />
  )
}
