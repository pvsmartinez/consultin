import { useState } from 'react'
import { toast } from 'sonner'
import TextArea from '../../components/ui/TextArea'
import { useClinic } from '../../hooks/useClinic'
import {
  CLINICAL_DOCUMENT_TEMPLATE_PLACEHOLDERS,
  DEFAULT_CLINIC_DOCUMENT_TEMPLATES,
} from '../../types'
import type { Clinic, ClinicDocumentTemplates } from '../../types'

function makeFormKey(clinic: Clinic) {
  return [
    clinic.id,
    JSON.stringify(clinic.documentTemplates),
  ].join('|')
}

export default function DocumentosTab({ clinic }: { clinic: Clinic }) {
  return <DocumentosTabForm key={makeFormKey(clinic)} clinic={clinic} />
}

function DocumentosTabForm({ clinic }: { clinic: Clinic }) {
  const { update } = useClinic()
  const [templates, setTemplates] = useState<ClinicDocumentTemplates>(clinic.documentTemplates)

  async function handleSave() {
    try {
      await update.mutateAsync({
        documentTemplates: templates,
      })
      toast.success('Modelos de documentos salvos')
    } catch {
      toast.error('Erro ao salvar modelos de documentos')
    }
  }

  function restoreDefaults() {
    setTemplates(DEFAULT_CLINIC_DOCUMENT_TEMPLATES)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
        <h2 className="text-sm font-semibold text-gray-800">Modelos por clínica</h2>
        <p className="mt-1 text-sm text-gray-500">
          Defina textos padrão para receitas, atestados, termos e pedidos. Ao criar um novo documento no paciente, o Consultin já preenche com este modelo.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          A assinatura fica fora do PDF automático para o profissional preencher manualmente depois da impressão.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <TextArea
          label="Modelo de pedido de exame"
          rows={10}
          value={templates.examRequest}
          onChange={event => setTemplates(current => ({ ...current, examRequest: event.target.value }))}
        />
        <TextArea
          label="Modelo de receita"
          rows={10}
          value={templates.prescription}
          onChange={event => setTemplates(current => ({ ...current, prescription: event.target.value }))}
        />
        <TextArea
          label="Modelo de atestado"
          rows={10}
          value={templates.medicalCertificate}
          onChange={event => setTemplates(current => ({ ...current, medicalCertificate: event.target.value }))}
        />
        <TextArea
          label="Modelo de termo de consentimento"
          rows={10}
          value={templates.consentTerm}
          onChange={event => setTemplates(current => ({ ...current, consentTerm: event.target.value }))}
        />
      </section>

      <section className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Placeholders disponíveis</p>
        <p className="mt-2 text-sm text-gray-500">
          {CLINICAL_DOCUMENT_TEMPLATE_PLACEHOLDERS.join(' · ')}
        </p>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={restoreDefaults}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
        >
          Restaurar modelos padrão
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={update.isPending}
          className="rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
        >
          {update.isPending ? 'Salvando...' : 'Salvar modelos'}
        </button>
      </div>
    </div>
  )
}