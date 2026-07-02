import { useState } from 'react'
import { DownloadSimple, PencilSimple, Plus, Printer, SpinnerGap, Trash, WarningCircle } from '@phosphor-icons/react'
import { Modal } from '@pvsmartinez/shared/ui'
import { toast } from 'sonner'
import ConfirmDialog from '../ui/ConfirmDialog'
import Input from '../ui/Input'
import Select from '../ui/Select'
import TextArea from '../ui/TextArea'
import { usePatientClinicalItems } from '../../hooks/usePatientClinicalItems'
import { useProfessionals } from '../../hooks/useProfessionals'
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
  Professional,
} from '../../types'
import { getClinicDocumentTemplate } from '../../utils/clinicalDocumentTemplates'
import { formatDate, formatDateTime } from '../../utils/date'
import {
  buildPatientClinicalDocumentBody,
  downloadPatientClinicalDocumentPdf,
  hasPrintableClinicalContent,
  printPatientClinicalDocument,
} from '../../utils/patientClinicalDocumentPdf'

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

function shouldReplacePrintableBodyWithTemplate({
  currentBody,
  currentItemType,
  nextItemType,
  clinicTemplates,
}: {
  currentBody: string | undefined
  currentItemType: PatientClinicalItem['itemType']
  nextItemType: PatientClinicalItem['itemType']
  clinicTemplates?: Clinic['documentTemplates']
}) {
  const trimmedBody = currentBody?.trim() ?? ''
  if (!trimmedBody) return true

  const currentTemplate = printablePlaceholder(currentItemType, clinicTemplates).trim()
  const nextTemplate = printablePlaceholder(nextItemType, clinicTemplates).trim()
  return trimmedBody === currentTemplate || trimmedBody === nextTemplate
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
              printableBody: shouldReplacePrintableBodyWithTemplate({
                currentBody: value.metadata.printableBody,
                currentItemType: value.itemType,
                nextItemType: event.target.value as PatientClinicalItem['itemType'],
                clinicTemplates,
              })
                ? printablePlaceholder(event.target.value as PatientClinicalItem['itemType'], clinicTemplates)
                : value.metadata.printableBody,
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
  previewBody,
  canPrint,
  onPrint,
  onDownload,
  onEdit,
  onDelete,
  deleting,
}: {
  item: PatientClinicalItem
  previewBody: string
  canPrint: boolean
  onPrint: (item: PatientClinicalItem) => void
  onDownload: (item: PatientClinicalItem) => void
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
      {previewBody && (
        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Prévia para impressão</p>
          <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">{previewBody}</p>
        </div>
      )}
      {item.notes && <p className="mt-2 text-sm text-gray-500 whitespace-pre-wrap">{item.notes}</p>}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() => onPrint(item)}
          disabled={!canPrint}
          className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <Printer size={14} />
          Imprimir
        </button>
        <button
          type="button"
          onClick={() => onDownload(item)}
          disabled={!canPrint}
          className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <DownloadSimple size={14} />
          PDF
        </button>
      </div>
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

function ActionTile({
  eyebrow,
  title,
  description,
  countLabel,
  primaryLabel,
  onPrimary,
  secondaryLabel = 'Ver histórico',
  onSecondary,
  tone = 'teal',
}: {
  eyebrow: string
  title: string
  description: string
  countLabel?: string
  primaryLabel?: string
  onPrimary?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  tone?: 'teal' | 'sky' | 'amber' | 'slate'
}) {
  const toneClasses = tone === 'teal'
    ? {
        card: 'border-teal-200 bg-teal-50/70',
        count: 'bg-white text-[#006970]',
        primary: 'bg-[#006970] text-white hover:bg-[#00545a]',
        secondary: 'border-teal-200 bg-white text-[#006970] hover:bg-teal-100',
      }
    : tone === 'sky'
      ? {
          card: 'border-sky-200 bg-sky-50/70',
          count: 'bg-white text-sky-700',
          primary: 'bg-sky-700 text-white hover:bg-sky-800',
          secondary: 'border-sky-200 bg-white text-sky-700 hover:bg-sky-100',
        }
      : tone === 'amber'
        ? {
            card: 'border-amber-200 bg-amber-50/70',
            count: 'bg-white text-amber-700',
            primary: 'bg-amber-600 text-white hover:bg-amber-700',
            secondary: 'border-amber-200 bg-white text-amber-700 hover:bg-amber-100',
          }
        : {
            card: 'border-gray-200 bg-gray-50/80',
            count: 'bg-white text-gray-700',
            primary: 'bg-gray-900 text-white hover:bg-gray-800',
            secondary: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100',
          }

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses.card}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">{eyebrow}</p>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
        </div>
        {countLabel ? (
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${toneClasses.count}`}>
            {countLabel}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {primaryLabel && onPrimary ? (
          <button
            type="button"
            onClick={onPrimary}
            className={`inline-flex min-h-10 items-center rounded-xl px-3 py-2 text-sm font-medium transition ${toneClasses.primary}`}
          >
            {primaryLabel}
          </button>
        ) : null}
        {onSecondary ? (
          <button
            type="button"
            onClick={onSecondary}
            className={`inline-flex min-h-10 items-center rounded-xl border px-3 py-2 text-sm font-medium transition ${toneClasses.secondary}`}
          >
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone = 'slate',
}: {
  label: string
  value: number
  tone?: 'slate' | 'sky' | 'amber'
}) {
  const toneClasses = tone === 'sky'
    ? 'border-sky-200 bg-sky-50 text-sky-700'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-gray-200 bg-gray-50 text-gray-700'

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses}`}>
      <p className="text-sm font-semibold">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide opacity-80">{label}</p>
    </div>
  )
}

export default function PatientClinicalPanel({
  patientId,
  patient,
  clinic,
}: {
  patientId: string
  patient: {
    name: string; cpf: string | null; birthDate: string | null
    addressStreet: string | null; addressNumber: string | null
    addressNeighborhood: string | null; addressCity: string | null
    addressState: string | null; addressZip: string | null
  }
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

  const { data: professionals = [] } = useProfessionals()

  const [clinicalForm, setClinicalForm] = useState<{ id: string | null; value: PatientClinicalItemInput } | null>(null)
  const [prosthesisForm, setProsthesisForm] = useState<{ id: string | null; value: PatientProsthesisInput } | null>(null)
  const [activeView, setActiveView] = useState<PanelView>('request')
  const [historyExpandedByView, setHistoryExpandedByView] = useState<Record<PanelView, boolean>>({
    request: false,
    document: false,
    prosthesis: false,
  })
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
  const isClinicalModalOpen = !!clinicalForm
  const isProsthesisModalOpen = !!prosthesisForm

  function closeEditors() {
    setClinicalForm(null)
    setProsthesisForm(null)
  }

  function startCreateClinical(category: ClinicalItemCategory, itemType?: PatientClinicalItem['itemType']) {
    const initialValue = emptyClinicalItem(category, clinic?.documentTemplates)
    const nextItemType = itemType ?? initialValue.itemType

    setActiveView(category)
    setClinicalForm({
      id: null,
      value: {
        ...initialValue,
        itemType: nextItemType,
        metadata: {
          ...initialValue.metadata,
          printableBody: printablePlaceholder(nextItemType, clinic?.documentTemplates),
        },
      },
    })
    setProsthesisForm(null)
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
    setProsthesisForm(null)
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
    setClinicalForm(null)
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

  function resolveItemProfessional(item: PatientClinicalItem) {
    const prof = (professionals as Professional[]).find((p: Professional) => p.userId === item.createdBy)
    if (!prof) return undefined
    return { name: prof.name, council: prof.councilId }
  }

  function handleDownload(item: PatientClinicalItem) {
    if (!hasPrintableClinicalContent(item, clinic)) {
      toast.error('Preencha o texto oficial para impressão antes de gerar o PDF')
      return
    }

    downloadPatientClinicalDocumentPdf({ item, patient, clinic, professional: resolveItemProfessional(item) })
  }

  function handlePrint(item: PatientClinicalItem) {
    if (!hasPrintableClinicalContent(item, clinic)) {
      toast.error('Preencha o texto oficial para impressão antes de imprimir')
      return
    }

    printPatientClinicalDocument({ item, patient, clinic, professional: resolveItemProfessional(item) })
  }

  function startPreset(preset: 'panoramic_xray' | 'prescription' | 'certificate' | 'consent') {
    const nextValue = clinicalPreset(preset, clinic?.documentTemplates)
    setActiveView(nextValue.category)
    setClinicalForm({ id: null, value: nextValue })
    setProsthesisForm(null)
  }

  function toggleHistory(view: PanelView, expanded?: boolean) {
    setHistoryExpandedByView(current => ({
      ...current,
      [view]: expanded ?? !current[view],
    }))
  }

  function renderClinicalList(list: PatientClinicalItem[], emptyMessage: string) {
    if (list.length === 0) {
      return (
        <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-gray-400">
          {emptyMessage}
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {list.map(item => (
          <ClinicalItemCard
            key={item.id}
            item={item}
            previewBody={buildPatientClinicalDocumentBody(
              item,
              patient,
              clinic,
              item.issuedOn ? formatDate(`${item.issuedOn}T00:00:00`) : formatDate(new Date().toISOString()),
              resolveItemProfessional(item),
            )}
            canPrint={hasPrintableClinicalContent(item, clinic)}
            onPrint={handlePrint}
            onDownload={handleDownload}
            onEdit={startEditClinical}
            onDelete={current => setConfirmDelete({ kind: 'item', id: current.id, label: current.title })}
            deleting={deletingItemId === item.id}
          />
        ))}
      </div>
    )
  }

  const loading = itemsQuery.isPending || prosthesesQuery.isPending
  const hasError = itemsQuery.isError || prosthesesQuery.isError
  const requestTypeCounts = {
    examRequest: requests.filter(item => item.itemType === 'exam_request').length,
    prescription: requests.filter(item => item.itemType === 'prescription').length,
    custom: requests.filter(item => item.itemType === 'custom').length,
  }
  const documentTypeCounts = {
    consentTerm: documents.filter(item => item.itemType === 'consent_term').length,
    certificate: documents.filter(item => item.itemType === 'medical_certificate').length,
    prescription: documents.filter(item => item.itemType === 'prescription').length,
    custom: documents.filter(item => item.itemType === 'custom').length,
  }
  const prosthesisSummary = {
    active: prostheses.filter(prosthesis => ['planned', 'requested', 'in_production', 'maintenance'].includes(prosthesis.status)).length,
    ready: prostheses.filter(prosthesis => prosthesis.status === 'ready').length,
    installed: prostheses.filter(prosthesis => prosthesis.status === 'installed').length,
  }
  const visibleRequests = historyExpandedByView.request ? requests : requests.slice(0, 4)
  const visibleDocuments = historyExpandedByView.document ? documents : documents.slice(0, 4)
  const visibleProstheses = historyExpandedByView.prosthesis ? prostheses : prostheses.slice(0, 4)
  const clinicalModalTitle = clinicalForm
    ? clinicalForm.id
      ? activeView === 'request'
        ? 'Editar pedido ou prescricao'
        : 'Editar documento'
      : activeView === 'request'
        ? 'Novo pedido ou prescricao'
        : 'Novo documento'
    : ''
  const prosthesisModalTitle = prosthesisForm
    ? prosthesisForm.id
      ? 'Editar protese'
      : 'Nova protese'
    : ''

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
        <p className="text-sm font-semibold text-gray-800">Escolha uma ação clínica</p>
        <p className="mt-1 text-sm text-gray-500">
          Deixe o histórico em segundo plano e comece direto pelo que a equipe mais faz no atendimento.
        </p>
      </div>

      <ViewSwitch activeView={activeView} counts={counts} onChange={setActiveView} />

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
            <>
              <div className="grid gap-3 lg:grid-cols-3">
                <ActionTile
                  eyebrow="Pedido"
                  title="Pedido de exame"
                  description="Abra rápido um pedido para raio X, exames laboratoriais ou avaliações complementares."
                  countLabel={`${requestTypeCounts.examRequest} registro${requestTypeCounts.examRequest === 1 ? '' : 's'}`}
                  primaryLabel="Novo pedido"
                  onPrimary={() => startPreset('panoramic_xray')}
                  onSecondary={() => toggleHistory('request', true)}
                />
                <ActionTile
                  eyebrow="Prescrição"
                  title="Receita ou remédio"
                  description="Crie uma receita com texto oficial pronto para revisão e impressão."
                  countLabel={`${requestTypeCounts.prescription} registro${requestTypeCounts.prescription === 1 ? '' : 's'}`}
                  primaryLabel="Nova receita"
                  onPrimary={() => startPreset('prescription')}
                  onSecondary={() => toggleHistory('request', true)}
                  tone="sky"
                />
                <ActionTile
                  eyebrow="Flexível"
                  title="Pedido personalizado"
                  description="Quando o pedido não se encaixa em um modelo padrão, comece por aqui."
                  countLabel={`${requestTypeCounts.custom} registro${requestTypeCounts.custom === 1 ? '' : 's'}`}
                  primaryLabel="Novo personalizado"
                  onPrimary={() => startCreateClinical('request', 'custom')}
                  onSecondary={() => toggleHistory('request', true)}
                  tone="slate"
                />
              </div>

              {clinicalForm?.value.category === 'request' && (
                <div className="rounded-2xl border border-teal-200 bg-teal-50/50 px-4 py-3 text-sm text-teal-900">
                  <p className="font-medium">Editor aberto</p>
                  <p className="mt-1 text-teal-800/80">Finalize ou feche o pedido em aberto para voltar ao histórico.</p>
                </div>
              )}

              <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Histórico de pedidos</h3>
                    <p className="text-sm text-gray-500">Os registros mais recentes ficam na frente para a equipe agir rápido.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => startCreateClinical('request')} className={buttonClass}>
                      <Plus size={14} />
                      Novo pedido manual
                    </button>
                    {requests.length > 4 ? (
                      <button type="button" onClick={() => toggleHistory('request')} className={buttonClass}>
                        {historyExpandedByView.request ? 'Mostrar menos' : 'Ver todos'}
                      </button>
                    ) : null}
                  </div>
                </div>
                {renderClinicalList(visibleRequests, 'Nenhum pedido cadastrado ainda.')}
              </div>
            </>
          )}

          {activeView === 'document' && (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <ActionTile
                  eyebrow="Documento"
                  title="Termo de consentimento"
                  description="Abra o modelo mais comum já pronto para revisão final e impressão."
                  countLabel={`${documentTypeCounts.consentTerm} registro${documentTypeCounts.consentTerm === 1 ? '' : 's'}`}
                  primaryLabel="Novo termo"
                  onPrimary={() => startPreset('consent')}
                  onSecondary={() => toggleHistory('document', true)}
                />
                <ActionTile
                  eyebrow="Documento"
                  title="Atestado"
                  description="Crie rapidamente um atestado de comparecimento ou afastamento."
                  countLabel={`${documentTypeCounts.certificate} registro${documentTypeCounts.certificate === 1 ? '' : 's'}`}
                  primaryLabel="Novo atestado"
                  onPrimary={() => startPreset('certificate')}
                  onSecondary={() => toggleHistory('document', true)}
                  tone="amber"
                />
                <ActionTile
                  eyebrow="Documento"
                  title="Receituário"
                  description="Quando a clínica preferir emitir a prescrição como documento formal."
                  countLabel={`${documentTypeCounts.prescription} registro${documentTypeCounts.prescription === 1 ? '' : 's'}`}
                  primaryLabel="Novo receituário"
                  onPrimary={() => startCreateClinical('document', 'prescription')}
                  onSecondary={() => toggleHistory('document', true)}
                  tone="sky"
                />
                <ActionTile
                  eyebrow="Flexível"
                  title="Personalizado"
                  description="Termos específicos, contratos e documentos livres em um fluxo só."
                  countLabel={`${documentTypeCounts.custom} registro${documentTypeCounts.custom === 1 ? '' : 's'}`}
                  primaryLabel="Novo personalizado"
                  onPrimary={() => startCreateClinical('document', 'custom')}
                  onSecondary={() => toggleHistory('document', true)}
                  tone="slate"
                />
              </div>

              {clinicalForm?.value.category === 'document' && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-sky-900">
                  <p className="font-medium">Editor aberto</p>
                  <p className="mt-1 text-sky-800/80">O documento esta sendo ajustado em modal para a tela continuar limpa.</p>
                </div>
              )}

              <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Histórico de documentos</h3>
                    <p className="text-sm text-gray-500">Atestados, termos e emitidos mais recentes em um lugar só.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => startCreateClinical('document')} className={buttonClass}>
                      <Plus size={14} />
                      Novo documento manual
                    </button>
                    {documents.length > 4 ? (
                      <button type="button" onClick={() => toggleHistory('document')} className={buttonClass}>
                        {historyExpandedByView.document ? 'Mostrar menos' : 'Ver todos'}
                      </button>
                    ) : null}
                  </div>
                </div>
                {renderClinicalList(visibleDocuments, 'Nenhum documento cadastrado ainda.')}
              </div>
            </>
          )}

          {activeView === 'prosthesis' && (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
                <ActionTile
                  eyebrow="Prótese"
                  title="Cadastrar nova prótese"
                  description="Registre região, laboratório, prazos e acompanhe a evolução até a instalação."
                  countLabel={`${prostheses.length} registro${prostheses.length === 1 ? '' : 's'}`}
                  primaryLabel="Nova prótese"
                  onPrimary={() => setProsthesisForm({ id: null, value: emptyProsthesis() })}
                  onSecondary={() => toggleHistory('prosthesis', true)}
                  tone="amber"
                />
                <SummaryTile label="Em andamento" value={prosthesisSummary.active} tone="amber" />
                <SummaryTile label="Prontas" value={prosthesisSummary.ready} tone="sky" />
                <SummaryTile label="Instaladas" value={prosthesisSummary.installed} />
              </div>

              {prosthesisForm && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
                  <p className="font-medium">Editor aberto</p>
                  <p className="mt-1 text-amber-800/80">O cadastro da protese esta em modal para nao disputar espaco com o historico.</p>
                </div>
              )}

              <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Histórico de próteses</h3>
                    <p className="text-sm text-gray-500">Acompanhe o que está em produção, pronto ou já instalado.</p>
                  </div>
                  {prostheses.length > 4 ? (
                    <button type="button" onClick={() => toggleHistory('prosthesis')} className={buttonClass}>
                      {historyExpandedByView.prosthesis ? 'Mostrar menos' : 'Ver todos'}
                    </button>
                  ) : null}
                </div>

                {prostheses.length === 0 ? (
                  <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-gray-400">
                    Nenhuma prótese cadastrada ainda.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visibleProstheses.map(prosthesis => (
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
              </div>
            </>
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

      <Modal
        open={isClinicalModalOpen}
        onClose={closeEditors}
        title={clinicalModalTitle}
        maxWidth="xl"
      >
        {clinicalForm ? (
          <div className="max-h-[80vh] overflow-y-auto p-5">
            <div className="mb-4 rounded-2xl border border-teal-100 bg-teal-50/50 px-4 py-3 text-sm text-teal-900">
              Preencha apenas o necessario agora. O historico continua na tela principal para consulta rapida.
            </div>
            <ClinicalItemForm
              category={clinicalForm.value.category}
              clinicTemplates={clinic?.documentTemplates}
              value={clinicalForm.value}
              saving={clinicalSaving}
              onChange={patch => setClinicalForm(current => current ? { ...current, value: { ...current.value, ...patch } } : current)}
              onCancel={closeEditors}
              onSubmit={submitClinical}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={isProsthesisModalOpen}
        onClose={closeEditors}
        title={prosthesisModalTitle}
        maxWidth="lg"
      >
        {prosthesisForm ? (
          <div className="max-h-[80vh] overflow-y-auto p-5">
            <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
              Registre prazos e observacoes da protese sem poluir a tela principal do paciente.
            </div>
            <ProsthesisForm
              value={prosthesisForm.value}
              saving={prosthesisSaving}
              onChange={patch => setProsthesisForm(current => current ? { ...current, value: { ...current.value, ...patch } } : current)}
              onCancel={closeEditors}
              onSubmit={submitProsthesis}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  )
}