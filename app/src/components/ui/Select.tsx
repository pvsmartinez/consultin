import { Select as SharedSelect, Label } from '@pvsmartinez/shared/ui'
import type { SelectHTMLAttributes } from 'react'

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export default function Select({
  label, error, options, placeholder, id, className, ...props
}: SelectProps) {
  const selectId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={selectId} required={!!props.required}>{label}</Label>
      <SharedSelect
        id={selectId}
        error={!!error}
        options={options}
        placeholder={placeholder}
        className={className}
        {...props}
      />
      {error && (
        <span className="text-xs" style={{ color: 'var(--ui-danger-text)' }}>{error}</span>
      )}
    </div>
  )
}

