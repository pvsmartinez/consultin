import * as Dialog from '@radix-ui/react-dialog'
import { Warning } from '@phosphor-icons/react'

interface Props {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export default function ConfirmDialog({
  open, title, description,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  danger = false, onConfirm, onCancel,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={o => { if (!o) onCancel() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-xl p-6 w-[90vw] max-w-md">
          <div className="flex items-start gap-3 mb-5">
            {danger && (
              <span className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <Warning size={16} weight="fill" />
              </span>
            )}
            <div>
              <Dialog.Title className="text-sm font-semibold text-gray-900 mb-1">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="text-sm text-gray-500">{description}</Dialog.Description>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors ${
                danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#006970] hover:bg-[#004f55]'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
