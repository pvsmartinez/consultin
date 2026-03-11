import { Input as SharedInput, Label } from '@pvsmartinez/shared/ui'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  error?: string
  hint?: string
}

export default function Input({ label, error, hint, id, className, ...props }: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={inputId} required={!!props.required}>{label}</Label>
      <SharedInput
        id={inputId}
        error={!!error}
        className={className}
        {...props}
      />
      {hint && !error && (
        <span className="text-xs" style={{ color: 'var(--ui-text-muted)' }}>{hint}</span>
      )}
      {error && (
        <span className="text-xs" style={{ color: 'var(--ui-danger-text)' }}>{error}</span>
      )}
    </div>
  )
}

