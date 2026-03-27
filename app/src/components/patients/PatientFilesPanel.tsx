import { useRef, useState } from 'react'
import { DownloadSimple, Trash, FilePlus, File, FilePdf, Image } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  usePatientFiles,
  useUploadPatientFile,
  useDeletePatientFile,
  getFileSignedUrl,
  formatBytes,
} from '../../hooks/usePatientFiles'
import { formatDateTime } from '../../utils/date'

const ACCEPTED = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
].join(',')

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (mimeType?.startsWith('image/'))      return <Image     size={18} className="text-[#0ea5b0] shrink-0" />
  if (mimeType === 'application/pdf')       return <FilePdf   size={18} className="text-red-400  shrink-0" />
  return                                           <File      size={18} className="text-gray-400 shrink-0" />
}

interface Props {
  patientId: string
  clinicId:  string
}

export default function PatientFilesPanel({ patientId, clinicId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const { data: files = [], isLoading }        = usePatientFiles(patientId)
  const uploadMut                               = useUploadPatientFile(patientId)
  const deleteMut                               = useDeletePatientFile(patientId)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset so the same file can be re-selected if needed
    e.target.value = ''

    if (file.size > 52_428_800) {
      toast.error('Arquivo muito grande. Máximo: 50 MB')
      return
    }

    try {
      await uploadMut.mutateAsync({ file, clinicId })
      toast.success(`"${file.name}" enviado com sucesso`)
    } catch (err) {
      toast.error(`Erro ao enviar arquivo: ${(err as Error).message}`)
    }
  }

  async function handleDownload(storagePath: string, name: string) {
    try {
      const url = await getFileSignedUrl(storagePath)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.target = '_blank'
      a.click()
    } catch {
      toast.error('Erro ao gerar link de download')
    }
  }

  async function handleDelete(fileId: string, storagePath: string, name: string) {
    if (!window.confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return
    setDeleting(fileId)
    try {
      await deleteMut.mutateAsync({ fileId, storagePath })
      toast.success('Arquivo excluído')
    } catch {
      toast.error('Erro ao excluir arquivo')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Upload button */}
      <div className="flex justify-end">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploadMut.isPending}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-white rounded-xl disabled:opacity-50 transition-all active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
        >
          <FilePlus size={15} />
          {uploadMut.isPending ? 'Enviando...' : 'Anexar arquivo'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* File list */}
      {isLoading ? (
        <p className="text-sm text-gray-400 text-center py-4">Carregando...</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">
          Nenhum arquivo anexado ainda.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {files.map(f => (
            <li key={f.id} className="flex items-center gap-3 py-2.5">
              <FileIcon mimeType={f.mimeType} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{f.name}</p>
                <p className="text-xs text-gray-400">
                  {formatBytes(f.sizeBytes)}{f.sizeBytes ? ' · ' : ''}{formatDateTime(f.createdAt)}
                </p>
              </div>
              <button
                onClick={() => handleDownload(f.storagePath, f.name)}
                title="Baixar"
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#006970] transition"
              >
                <DownloadSimple size={16} />
              </button>
              <button
                onClick={() => handleDelete(f.id, f.storagePath, f.name)}
                disabled={deleting === f.id}
                title="Excluir"
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition disabled:opacity-40"
              >
                <Trash size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
