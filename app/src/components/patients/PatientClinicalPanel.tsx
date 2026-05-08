import { useState } from 'react'
import { DownloadSimple, PencilSimple, Plus, Printer, SpinnerGap, Trash, WarningCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import ConfirmDialog from '../ui/ConfirmDialog'
import Input from '../ui/Input'
import Select from '../ui/Select'
import TextArea from '../ui/TextArea'
import { usePatientClinicalItems } from '../../hooks/usePatientClinicalItems'
import {
  CLINICAL_DOCUMENT_TYPE_OPTIONS,
  CLINICAL_ITEM_STATUS_COLORS,
  CLINICAL_ITEM_STATUS_LABELS,
  CLINICAL_ITEM_STATUS_OPTIONS,
  CLINICAL_ITEM_TYPE_LABELS,
  CLINICAL_REQUEST_TYPE_OPTIONS,
  PROSTHESIS_STATUS_COLORS,
  PROSTHESIS_STATUS_LABELS,
  PROSTHESIS_STATUS_OPTIONS,
} from '../../types'
import type {
  Clinic,
  ClinicalItemCategory,
  PatientClinicalItem,
  PatientClinicalItemInput,
  PatientProsthesis,
  PatientProsthesisInput,
} from '../../types'
import { getClinicDocumentTemplate } from '../../utils/clinicalDocumentTemplates'
import { formatDate, formatDateTime } from '../../utils/date'
import { downloadPatientClinicalDocumentPdf, hasPrintableClinicalContent, printPatientClinicalDocument } from '../../utils/patientClinicalDocumentPdf'

const buttonClass =
  'inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50'

type PanelView = 'request' | 'document' | 'prosthesis'

function formatDateField(value: string | null) {
  if (!value) return null
  return formatDate(`${value}T00:00:00`)
}

function printablePlaceholder(
  itemType: PatientClinicalItem['itemType'],
  clinicTemplates?: Clinic['documentTemplates'],
) {
  return getClinicDocumentTemplate(clinicTemplates, itemType)
}

function emptyClinicalItem(
  category: ClinicalItemCategory,
  clinicTemplates?: Clinic['documentTemplates'],
): PatientClinicalItemInput {
  const itemType = category === 'request' ? 'exam_request' : 'consent_term'

  return {
    category,
    itemType,
    status: category === 'request' ? 'requested' : 'in_review',
    title: '',
    description: null,
    notes: null,
    requestedForDate: null,
    issuedOn: null,
    completedOn: null,
    metadata: {
      printableBody: printablePlaceholder(itemType, clinicTemplates),
      reviewNotes: '',
    },
  }
}

function clinicalPreset(
  preset: 'panoramic_xray' | 'prescription' | 'certificate' | 'consent',
  clinicTemplates?: Clinic['documentTemplates'],
): PatientClinicalItemInput {
  switch (preset) {
    case 'panoramic_xray':
      return {
        ...emptyClinicalItem('request', clinicTemplates),
        itemType: 'exam_request',
        title: 'Raio X panorâmico',
        description: 'Solicitar radiografia panorâmica para avaliação complementar.',
        metadata: {
          printableBody: printablePlaceholder('exam_request', clinicTemplates),
          reviewNotes: '',
        },
      }
    case 'prescription':
      return {
        ...emptyClinicalItem('request', clinicTemplates),
        itemType: 'prescription',
        status: 'in_review',
        title: 'Receita médica',
        description: 'Preencher medicamento, dose, frequência e duração.',
        metadata: {
          printableBody: printablePlaceholder('prescription', clinicTemplates),
          reviewNotes: 'Conferir dose, posologia e assinatura antes de emitir.',
        },
      }
    case 'certificate':
      return {
        ...emptyClinicalItem('document', clinicTemplates),
        itemType: 'medical_certificate',
        status: 'in_review',
        title: 'Atestado de trabalho',
        description: 'Atestado para afastamento ou comparecimento.',
        metadata: {
          printableBody: printablePlaceholder('medical_certificate', clinicTemplates),
          reviewNotes: 'Validar quantidade de dias e motivo antes de emitir.',
        },
      }
    case 'consent':
      return {
        ...emptyClinicalItem('document', clinicTemplates),
        itemType: 'consent_term',
        status: 'in_review',
        title: 'Termo de consentimento',
        description: 'Consentimento informado para procedimento.',
        metadata: {
          printableBody: printablePlaceholder('consent_term', clinicTemplates),
          reviewNotes: 'Conferir texto do procedimento específico e campos de assinatura.',
        },
      }
  }
}

function emptyProsthesis(): PatientProsthesisInput {
  return {
    name: '',
    toothRegion: null,
    laboratoryName: null,
    status: 'planned',
    startedOn: null,
    dueOn: null,
    installedOn: null,
    notes: null,
    metadata: {},
  }
}

function ClinicalItemForm({
  category,
  clinicTemplates,
  value,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  category: ClinicalItemCategory
  clinicTemplates?: Clinic['documentTemplates']
  value: PatientClinicalItemInput
  saving: boolean
  onChange: (patch: Partial<PatientClinicalItemInput>) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const typeOptions = category === 'request' ? CLINICAL_REQUEST_TYPE_OPTIONS : CLINICAL_DOCUMENT_TYPE_OPTIONS
  const titleLabel = category === 'request' ? 'Título do pedido' : 'Título do documento'
  const titlePlaceholder = category === 'request'
    ? 'Ex: Raio X panorâmico'
    : 'Ex: Atestado de trabalho'
  const printLabel = value.itemType === 'prescription'
    ? 'Texto oficial da prescrição'
    : 'Texto oficial para impressão'

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
      <div className="mb-4 rounded-xl border border-teal-100 bg-white/80 px-3 py-2 text-xs text-teal-800">
        Fluxo sugerido: rascunho → em revisão → emitido. O texto oficial abaixo é o que sai no PDF e na impressão.
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Tipo"
          value={value.itemType}
          options={typeOptions}
          onChange={event => onChange({
            itemType: event.target.value as PatientClinicalItem['itemType'],
            metadata: {
              ...value.metadata,
              printableBody: value.metadata.printableBody?.trim()
                ? value.metadata.printableBody
                : printablePlaceholder(event.target.value as PatientClinicalItem['itemType'], clinicTemplates),
            },
          })}
        />
        <Select
          label="Status"
          value={value.status}
          options={CLINICAL_ITEM_STATUS_OPTIONS}
          onChange={event => onChange({ status: event.target.value as PatientClinicalItem['status'] })}
        />
        <div className="sm:col-span-2">
          <Input
            label={titleLabel}
            placeholder={titlePlaceholder}
            value={value.title}
            onChange={event => onChange({ title: event.target.value })}
          />
        </div>
        <Input
          label="Data prevista"
          type="date"
          value={value.requestedForDate ?? ''}
          onChange={event => onChange({ requestedForDate: event.target.value || null })}
        />
        <Input
          label="Emitido em"
          type="date"
          value={value.issuedOn ?? ''}
          onChange={event => onChange({ issuedOn: event.target.value || null })}
        />
        <Input
          label="Concluído em"
          type="date"
          value={value.completedOn ?? ''}
          onChange={event => onChange({ completedOn: event.target.value || null })}
        />
        <div className="sm:col-span-2">
          <TextArea
            label="Descrição"
            placeholder="Detalhes do pedido ou conteúdo principal do documento."
            value={value.description ?? ''}
            onChange={event => onChange({ description: event.target.value || null })}
          />
        </div>
        <div className="sm:col-span-2">
          <TextArea
            label={printLabel}
            placeholder={printablePlaceholder(value.itemType, clinicTemplates)}
            rows={8}
            value={value.metadata.printableBody ?? ''}
            onChange={event => onChange({
              metadata: {
                ...value.metadata,
                printableBody: event.target.value,
              },
            })}
          />
        </div>
        <div className="sm:col-span-2">
          <TextArea
            label="Observações de revisão"
            placeholder="Pendências, ajustes formais ou conferências antes de emitir."
            rows={4}
            value={value.metadata.reviewNotes ?? ''}
            onChange={event => onChange({
              metadata: {
                ...value.metadata,
                reviewNotes: event.target.value,
              },
            })}
          />
        </div>
        <div className="sm:col-span-2">
          <TextArea
            label="Observações internas"
            placeholder="Observações da equipe, orientações ou retorno esperado."
            value={value.notes ?? ''}
            onChange={event => onChange({ notes: event.target.value || null })}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-white">
          Cancelar
        </button>
        <button
          onClick={onSubmit}
          disabled={saving || !value.title.trim()}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-white transition disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
        >
          {saving ? <SpinnerGap size={14} className="animate-spin" /> : null}
          Salvar
        </button>
      </div>
    </div>
  )
}

function ProsthesisForm({
  value,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: PatientProsthesisInput
  saving: boolean
  onChange: (patch: Partial<PatientProsthesisInput>) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Prótese"
          placeholder="Ex: Prótese parcial superior"
          value={value.name}
          onChange={event => onChange({ name: event.target.value })}
        />
        <Select
          label="Status"
          value={value.status}
          options={PROSTHESIS_STATUS_OPTIONS}
          onChange={event => onChange({ status: event.target.value as PatientProsthesis['status'] })}
        />
        <Input
          label="Dente / região"
          placeholder="Ex: 11 a 13"
          value={value.toothRegion ?? ''}
          onChange={event => onChange({ toothRegion: event.target.value || null })}
        />
        <Input
          label="Laboratório"
          placeholder="Ex: Lab Sorriso"
          value={value.laboratoryName ?? ''}
          onChange={event => onChange({ laboratoryName: event.target.value || null })}
        />
        <Input
          label="Início"
          type="date"
          value={value.startedOn ?? ''}
          onChange={event => onChange({ startedOn: event.target.value || null })}
        />
        <Input
          label="Previsão"
          type="date"
          value={value.dueOn ?? ''}
          onChange={event => onChange({ dueOn: event.target.value || null })}
        />
        <Input
          label="Instalada em"
          type="date"
          value={value.installedOn ?? ''}
          onChange={event => onChange({ installedOn: event.target.value || null })}
        />
        <div className="sm:col-span-2">
          <TextArea
            label="Observações"
            placeholder="Ajustes, material, retorno ou intercorrências."
            value={value.notes ?? ''}
            onChange={event => onChange({ notes: event.target.value || null })}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-white">
          Cancelar
        </button>
        <button
          onClick={onSubmit}
          disabled={saving || !value.name.trim()}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-white transition disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)' }}
        >
          {saving ? <SpinnerGap size={14} className="animate-spin" /> : null}
          Salvar
        </button>
      </div>
    </div>
  )
}

function ClinicalItemCard({
  item,
  onEdit,
  onDelete,
  deleting,
}: {
  item: PatientClinicalItem
  onEdit: (item: PatientClinicalItem) => void
  onDelete: (item: PatientClinicalItem) => void
  deleting: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-800">{item.title}</p>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {CLINICAL_ITEM_TYPE_LABELS[item.itemType]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLINICAL_ITEM_STATUS_COLORS[item.status]}`}>
              {CLINICAL_ITEM_STATUS_LABELS[item.status]}
            </span>
          </div>

          <p className="mt-1 text-xs text-gray-400">
            {formatDateTime(item.createdAt)}
            {item.createdByName ? ` · ${item.createdByName}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(item)} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600" title="Editar">
            <PencilSimple size={15} />
          </button>
          <button
            onClick={() => onDelete(item)}
            disabled={deleting}
            className="rounded-lg p-2 text-gray-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
            title="Excluir"
          >
            {deleting ? <SpinnerGap size={15} className="animate-spin" /> : <Trash size={15} />}
          </button>
        </div>
      </div>

      {(item.requestedForDate || item.issuedOn || item.completedOn) && (
        <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
          <div>{item.requestedForDate ? `Data prevista: ${formatDateField(item.requestedForDate)}` : 'Data prevista: —'}</div>
          <div>{item.issuedOn ? `Emitido em: ${formatDateField(item.issuedOn)}` : 'Emitido em: —'}</div>
          <div>{item.completedOn ? `Concluído em: ${formatDateField(item.completedOn)}` : 'Concluído em: —'}</div>
        </div>
      )}

      {item.metadata.reviewNotes && (
        <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-sm text-violet-700 whitespace-pre-wrap">
          Revisão: {item.metadata.reviewNotes}
        </div>
      )}

      {item.description && <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{item.description}</p>}
      {item.metadata.printableBody && (
        <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">{item.metadata.printableBody}</p>
      )}
      {item.notes && <p className="mt-2 text-sm text-gray-500 whitespace-pre-wrap">{item.notes}</p>}
    </div>
  )
}

function ProsthesisCard({
  prosthesis,
  onEdit,
  onDelete,
  deleting,
}: {
  prosthesis: PatientProsthesis
  onEdit: (prosthesis: PatientProsthesis) => void
  onDelete: (prosthesis: PatientProsthesis) => void
  deleting: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-800">{prosthesis.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROSTHESIS_STATUS_COLORS[prosthesis.status]}`}>
              {PROSTHESIS_STATUS_LABELS[prosthesis.status]}
            </span>
            {prosthesis.toothRegion && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {prosthesis.toothRegion}
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-gray-400">
            {formatDateTime(prosthesis.createdAt)}
            {prosthesis.createdByName ? ` · ${prosthesis.createdByName}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(prosthesis)} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600" title="Editar">
            <PencilSimple size={15} />
          </button>
          <button
            onClick={() => onDelete(prosthesis)}
            disabled={deleting}
            className="rounded-lg p-2 text-gray-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
            title="Excluir"
          >
            {deleting ? <SpinnerGap size={15} className="animate-spin" /> : <Trash size={15} />}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
        <div>{prosthesis.startedOn ? `Início: ${formatDateField(prosthesis.startedOn)}` : 'Início: —'}</div>
        <div>{prosthesis.dueOn ? `Previsão: ${formatDateField(prosthesis.dueOn)}` : 'Previsão: —'}</div>
        <div>{prosthesis.installedOn ? `Instalada: ${formatDateField(prosthesis.installedOn)}` : 'Instalada: —'}</div>
      </div>

      {prosthesis.laboratoryName && <p className="mt-3 text-sm text-gray-700">Laboratório: {prosthesis.laboratoryName}</p>}
      {prosthesis.notes && <p className="mt-2 text-sm text-gray-500 whitespace-pre-wrap">{prosthesis.notes}</p>}
    </div>
  )
}

function Subsection({
  title,
  count,
  actionLabel,
  onCreate,
  children,
}: {
  title: string
  count: number
  actionLabel: string
  onCreate: () => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <p className="text-xs text-gray-400">{count} registro{count === 1 ? '' : 's'}</p>
        </div>
        <button onClick={onCreate} className={buttonClass}>
          <Plus size={14} />
          {actionLabel}
        </button>
      </div>
      {children}
    </div>
  )
}

function ViewSwitch({
  activeView,
  counts,
  onChange,
}: {
  activeView: PanelView
  counts: Record<PanelView, number>
  onChange: (view: PanelView) => void
}) {
  const items: Array<{ key: PanelView; title: string; description: string }> = [
    { key: 'request', title: 'Pedidos', description: 'Exames e prescrições' },
    { key: 'document', title: 'Documentos', description: 'Atestados e termos' },
    { key: 'prosthesis', title: 'Próteses', description: 'Acompanhamento clínico' },
  ]

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map(item => {
        const active = item.key === activeView
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`rounded-2xl border p-4 text-left transition ${active
              ? 'border-[#0ea5b0] bg-teal-50 shadow-sm'
              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-sm font-semibold ${active ? 'text-[#006970]' : 'text-gray-800'}`}>{item.title}</p>
                <p className="mt-1 text-xs text-gray-500">{item.description}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-[#006970] text-white' : 'bg-gray-100 text-gray-600'}`}>
                {counts[item.key]}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function QuickActionBar({
  actions,
}: {
  actions: Array<{ label: string; onClick: () => void }>
}) {
  if (actions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-white p-3">
      <span className="mr-2 self-center text-xs font-medium uppercase tracking-wide text-gray-400">Atalhos</span>
      {actions.map(action => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 transition hover:border-gray-300 hover:bg-gray-100"
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}

export default function PatientClinicalPanel({
  patientId,
  patient,
  clinic,
}: {
  patientId: string
  patient: { name: string; cpf: string | null; birthDate: string | null }
  clinic: Pick<Clinic, 'name' | 'phone' | 'email' | 'address' | 'city' | 'state' | 'documentTemplates' | 'documentSigning'> | null
}) {
  const {
    itemsQuery,
    prosthesesQuery,
    createItem,
    updateItem,
    deleteItem,
    createProsthesis,
    updateProsthesis,
    deleteProsthesis,
  } = usePatientClinicalItems(patientId)

  const [clinicalForm, setClinicalForm] = useState<{ id: string | null; value: PatientClinicalItemInput } | null>(null)
  const [prosthesisForm, setProsthesisForm] = useState<{ id: string | null; value: PatientProsthesisInput } | null>(null)
  const [activeView, setActiveView] = useState<PanelView>('request')
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: 'item'; id: string; label: string }
    | { kind: 'prosthesis'; id: string; label: string }
    | null
  >(null)

  const items = itemsQuery.data ?? []
  const prostheses = prosthesesQuery.data ?? []
  const requests = items.filter(item => item.category === 'request')
  const documents = items.filter(item => item.category === 'document')
  const counts = {
    request: requests.length,
    document: documents.length,
    prosthesis: prostheses.length,
  } satisfies Record<PanelView, number>

  const clinicalSaving = createItem.isPending || updateItem.isPending
  const prosthesisSaving = createProsthesis.isPending || updateProsthesis.isPending
  const deletingItemId = deleteItem.variables
  const deletingProsthesisId = deleteProsthesis.variables

  function startCreateClinical(category: ClinicalItemCategory) {
    setActiveView(category)
    setClinicalForm({ id: null, value: emptyClinicalItem(category, clinic?.documentTemplates) })
  }

  function startEditClinical(item: PatientClinicalItem) {
    setActiveView(item.category)
    setClinicalForm({
      id: item.id,
      value: {
        category: item.category,
        itemType: item.itemType,
        status: item.status,
        title: item.title,
        description: item.description,
        notes: item.notes,
        requestedForDate: item.requestedForDate,
        issuedOn: item.issuedOn,
        completedOn: item.completedOn,
        metadata: item.metadata,
      },
    })
  }

  function startEditProsthesis(prosthesis: PatientProsthesis) {
    setActiveView('prosthesis')
    setProsthesisForm({
      id: prosthesis.id,
      value: {
        name: prosthesis.name,
        toothRegion: prosthesis.toothRegion,
        laboratoryName: prosthesis.laboratoryName,
        status: prosthesis.status,
        startedOn: prosthesis.startedOn,
        dueOn: prosthesis.dueOn,
        installedOn: prosthesis.installedOn,
        notes: prosthesis.notes,
        metadata: prosthesis.metadata,
      },
    })
  }

  async function submitClinical() {
    if (!clinicalForm) return
    try {
      if (clinicalForm.id) {
        await updateItem.mutateAsync({ id: clinicalForm.id, input: clinicalForm.value })
        toast.success('Registro clínico atualizado')
      } else {
        await createItem.mutateAsync(clinicalForm.value)
        toast.success('Registro clínico criado')
      }
      setClinicalForm(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar registro clínico')
    }
  }

  async function submitProsthesis() {
    if (!prosthesisForm) return
    try {
      if (prosthesisForm.id) {
        await updateProsthesis.mutateAsync({ id: prosthesisForm.id, input: prosthesisForm.value })
        toast.success('Prótese atualizada')
      } else {
        await createProsthesis.mutateAsync(prosthesisForm.value)
        toast.success('Prótese cadastrada')
      }
      setProsthesisForm(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar prótese')
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    try {
      if (confirmDelete.kind === 'item') {
        await deleteItem.mutateAsync(confirmDelete.id)
        toast.success('Registro clínico excluído')
      } else {
        await deleteProsthesis.mutateAsync(confirmDelete.id)
        toast.success('Prótese excluída')
      }
      setConfirmDelete(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir registro')
    }
  }

  function handleDownload(item: PatientClinicalItem) {
    if (!hasPrintableClinicalContent(item, clinic)) {
      toast.error('Preencha o texto oficial para impressão antes de gerar o PDF')
      return
    }

    downloadPatientClinicalDocumentPdf({ item, patient, clinic })
  }

  function handlePrint(item: PatientClinicalItem) {
    if (!hasPrintableClinicalContent(item, clinic)) {
      toast.error('Preencha o texto oficial para impressão antes de imprimir')
      return
    }

    printPatientClinicalDocument({ item, patient, clinic })
  }

  function startPreset(preset: 'panoramic_xray' | 'prescription' | 'certificate' | 'consent') {
    const nextValue = clinicalPreset(preset, clinic?.documentTemplates)
    setActiveView(nextValue.category)
    setClinicalForm({ id: null, value: nextValue })
    setProsthesisForm(null)
  }

  const quickActions = activeView === 'request'
    ? [
        { label: 'Raio X panorâmico', onClick: () => startPreset('panoramic_xray') },
        { label: 'Receita médica', onClick: () => startPreset('prescription') },
      ]
    : activeView === 'document'
      ? [
          { label: 'Atestado de trabalho', onClick: () => startPreset('certificate') },
          { label: 'Termo de consentimento', onClick: () => startPreset('consent') },
        ]
      : [
          { label: 'Nova prótese', onClick: () => setProsthesisForm({ id: null, value: emptyProsthesis() }) },
        ]

  function renderClinicalList(list: PatientClinicalItem[]) {
    if (list.length === 0) {
      return (
        <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-gray-400">
          Nenhum registro cadastrado ainda nesta área.
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {list.map(item => (
          <div key={item.id} className="space-y-2">
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => handlePrint(item)} className={buttonClass}>
                <Printer size={14} />
                Imprimir
              </button>
              <button onClick={() => handleDownload(item)} className={buttonClass}>
                <DownloadSimple size={14} />
                PDF
              </button>
            </div>
            <ClinicalItemCard
              item={item}
              onEdit={startEditClinical}
              onDelete={current => setConfirmDelete({ kind: 'item', id: current.id, label: current.title })}
              deleting={deletingItemId === item.id}
            />
          </div>
        ))}
      </div>
    )
  }

  const loading = itemsQuery.isPending || prosthesesQuery.isPending
  const hasError = itemsQuery.isError || prosthesesQuery.isError

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
        Cadastre pedidos, documentos e próteses com status e datas. PDFs, fotos e arquivos finais continuam na seção de anexos abaixo.
      </div>

      <ViewSwitch activeView={activeView} counts={counts} onChange={setActiveView} />

      <QuickActionBar actions={quickActions} />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
          <SpinnerGap size={16} className="animate-spin" />
          Carregando registros clínicos...
        </div>
      ) : hasError ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <WarningCircle size={16} />
          Não foi possível carregar pedidos, documentos ou próteses.
        </div>
      ) : (
        <>
          {activeView === 'request' && (
            <Subsection
              title="Pedidos e prescrições"
              count={requests.length}
              actionLabel="Novo pedido"
              onCreate={() => startCreateClinical('request')}
            >
              {clinicalForm?.value.category === 'request' && (
                <ClinicalItemForm
                  category="request"
                  clinicTemplates={clinic?.documentTemplates}
                  value={clinicalForm.value}
                  saving={clinicalSaving}
                  onChange={patch => setClinicalForm(current => current ? { ...current, value: { ...current.value, ...patch } } : current)}
                  onCancel={() => setClinicalForm(null)}
                  onSubmit={submitClinical}
                />
              )}

              {renderClinicalList(requests)}
            </Subsection>
          )}

          {activeView === 'document' && (
            <Subsection
              title="Documentos clínicos"
              count={documents.length}
              actionLabel="Novo documento"
              onCreate={() => startCreateClinical('document')}
            >
              {clinicalForm?.value.category === 'document' && (
                <ClinicalItemForm
                  category="document"
                  clinicTemplates={clinic?.documentTemplates}
                  value={clinicalForm.value}
                  saving={clinicalSaving}
                  onChange={patch => setClinicalForm(current => current ? { ...current, value: { ...current.value, ...patch } } : current)}
                  onCancel={() => setClinicalForm(null)}
                  onSubmit={submitClinical}
                />
              )}

              {renderClinicalList(documents)}
            </Subsection>
          )}

          {activeView === 'prosthesis' && (
            <Subsection
              title="Controle de próteses"
              count={prostheses.length}
              actionLabel="Nova prótese"
              onCreate={() => setProsthesisForm({ id: null, value: emptyProsthesis() })}
            >
              {prosthesisForm && (
                <ProsthesisForm
                  value={prosthesisForm.value}
                  saving={prosthesisSaving}
                  onChange={patch => setProsthesisForm(current => current ? { ...current, value: { ...current.value, ...patch } } : current)}
                  onCancel={() => setProsthesisForm(null)}
                  onSubmit={submitProsthesis}
                />
              )}

              {prostheses.length === 0 ? (
                <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-gray-400">
                  Nenhuma prótese cadastrada ainda.
                </div>
              ) : (
                <div className="space-y-3">
                  {prostheses.map(prosthesis => (
                    <ProsthesisCard
                      key={prosthesis.id}
                      prosthesis={prosthesis}
                      onEdit={startEditProsthesis}
                      onDelete={current => setConfirmDelete({ kind: 'prosthesis', id: current.id, label: current.name })}
                      deleting={deletingProsthesisId === prosthesis.id}
                    />
                  ))}
                </div>
              )}
            </Subsection>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Excluir registro"
        description={confirmDelete ? `Excluir "${confirmDelete.label}"? Esta ação não pode ser desfeita.` : undefined}
        confirmLabel="Excluir"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}