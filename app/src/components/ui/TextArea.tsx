import { TextArea as SharedTextArea, Label } from '@pvsmartinez/shared/ui'
import type { TextareaHTMLAttributes } from 'react'

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
}

export default function TextArea({ label, error, id, className, ...props }: TextAreaProps) {
  const textareaId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={textareaId} required={!!props.required}>{label}</Label>
      <SharedTextArea
        id={textareaId}
        rows={3}
        error={!!error}
        className={className}
        {...props}
      />
      {error && (
        <span className="text-xs" style={{ color: 'var(--ui-danger-text)' }}>{error}</span>
      )}
    </div>
  )
}

