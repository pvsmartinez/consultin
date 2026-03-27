import { useRef, useState } from 'react'
import {
  NotePencil,
  Paperclip,
  Trash,
  DownloadSimple,
  FilePdf,
  FileImage,
  File,
  SpinnerGap,
  WarningCircle,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { usePatientRecords } from '../../hooks/usePatientRecords'
import { formatDateTime } from '../../utils/date'
import type { PatientRecord } from '../../types'

// ─── File icon helper ─────────────────────────────────────────────────────────
function FileIcon({ mime }: { mime: string | null }) {
  if (!mime) return <File size={18} className="text-gray-400" />
  if (mime.startsWith('image/')) return <FileImage size={18} className="text-[#0ea5b0]" />
  if (mime === 'application/pdf') return <FilePdf size={18} className="text-red-400" />
  return <File size={18} className="text-gray-400" />
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Single record card ───────────────────────────────────────────────────────
function RecordCard({
  record,
  onDelete,
  onDownload,
}: {
  record: PatientRecord
  onDelete: (record: PatientRecord) => void
  onDownload: (record: PatientRecord) => void
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete() {
    setDeletingId(record.id)
    try {
      await onDelete(record)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="group flex gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition">
      {/* Icon */}
      <div className="mt-0.5 flex-shrink-0">
        {record.type === 'note' ? (
          <NotePencil size={18} className="text-[#0ea5b0]" />
        ) : (
          <FileIcon mime={record.fileMime} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {record.type === 'note' ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.content}</p>
        ) : (
          <button
            onClick={() => onDownload(record)}
            className="flex items-center gap-1.5 text-sm text-[#006970] hover:text-[#004f55] font-medium truncate max-w-full"
          >
            <DownloadSimple size={14} />
            <span className="truncate">{record.fileName}</span>
          </button>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
          <span>{formatDateTime(record.createdAt)}</span>
          {record.createdByName && (
            <>
              <span>·</span>
              <span>{record.createdByName}</span>
            </>
          )}
          {record.fileSize && (
            <>
              <span>·</span>
              <span>{formatBytes(record.fileSize)}</span>
            </>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deletingId === record.id}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition flex-shrink-0 self-start mt-0.5 disabled:opacity-30"
        title="Excluir"
      >
        {deletingId === record.id ? (
          <SpinnerGap size={15} className="animate-spin" />
        ) : (
          <Trash size={15} />
        )}
      </button>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────
interface Props {
  patientId: string
  /** Optionally link new records to a specific appointment */
  appointmentId?: string
}

export default function PatientRecordsPanel({ patientId, appointmentId }: Props) {
  const { data: records = [], isLoading, isError, addNote, uploadFile, deleteRecord, getAttachmentUrl } =
    usePatientRecords(patientId)

  // Note form state
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleSaveNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    try {
      await addNote.mutateAsync({ content: noteText.trim(), appointmentId })
      setNoteText('')
      setShowNoteForm(false)
      toast.success('Anotação salva')
    } catch {
      toast.error('Erro ao salvar anotação')
    } finally {
      setSavingNote(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-selected if needed
    e.target.value = ''
    setUploading(true)
    try {
      await uploadFile.mutateAsync({ file, appointmentId })
      toast.success('Arquivo enviado')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar arquivo'
      toast.error(message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(record: PatientRecord) {
    if (!record.filePath) return
    try {
      const url = await getAttachmentUrl(record.filePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Não foi possível abrir o arquivo')
    }
  }

  async function handleDelete(record: PatientRecord) {
    try {
      await deleteRecord.mutateAsync(record)
      toast.success('Registro excluído')
    } catch {
      toast.error('Erro ao excluir registro')
    }
  }

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowNoteForm(v => !v); setNoteText('') }}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition ${showNoteForm ? 'bg-teal-50 border-teal-300 text-[#006970]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          <NotePencil size={15} />
          Nova anotação
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
        >
          {uploading ? (
            <SpinnerGap size={15} className="animate-spin" />
          ) : (
            <Paperclip size={15} />
          )}
          {uploading ? 'Enviando...' : 'Enviar arquivo'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Inline note form */}
      {showNoteForm && (
        <div className="border border-teal-200 bg-teal-50/40 rounded-xl p-4 space-y-3">
          <textarea
            autoFocus
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Digite a anotação..."
            rows={4}
            className="w-full border border-gray-200 bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowNoteForm(false); setNoteText('') }}
              className="px-4 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveNote}
              disabled={savingNote || !noteText.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white rounded-xl disabled:opacity-50 transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
            >
              {savingNote ? <SpinnerGap size={14} className="animate-spin" /> : null}
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Records list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
          <SpinnerGap size={16} className="animate-spin" />
          Carregando...
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 py-6 text-sm text-red-500">
          <WarningCircle size={16} />
          Erro ao carregar registros
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          <NotePencil size={32} className="mx-auto mb-2 text-gray-200" />
          Nenhuma anotação ou arquivo ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(record => (
            <RecordCard
              key={record.id}
              record={record}
              onDelete={handleDelete}
              onDownload={handleDownload}
            />
          ))}
        </div>
      )}
    </div>
  )
}
