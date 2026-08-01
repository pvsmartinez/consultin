import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Clinic } from '../../types'
import { PATIENT_BUILTIN_FIELDS, PROFESSIONAL_BUILTIN_FIELDS } from '../../types'
import EntityFieldsPanel from '../../components/fields/EntityFieldsPanel'
import { buildSettingsPath, type SettingsEntity } from '../../lib/settingsNavigation'

type EntityTab = 'pacientes' | 'profissionais'

const ENTITY_LABELS: Record<EntityTab, string> = {
  pacientes:      'Pacientes',
  profissionais:  'Profissionais',
}

export default function CamposTab({
  clinic,
  fieldEntity,
}: {
  clinic: Clinic
  fieldEntity?: SettingsEntity
}) {
  const [entityTab, setEntityTab] = useState<EntityTab>(fieldEntity ?? 'pacientes')

  useEffect(() => {
    if (fieldEntity === 'pacientes' || fieldEntity === 'profissionais') {
      setEntityTab(fieldEntity)
    }
  }, [fieldEntity])

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-500">
          Configure quais campos aparecem nos formulários de cadastro. Ative, desative ou adicione
          campos extras conforme a especialidade da clínica.
        </p>
        <p className="text-xs text-gray-400 mt-1.5">
          Use campos personalizados para dados estruturados do prontuário, como convênio,
          alergias, número do prontuário, observações clínicas curtas, datas e seleções.
          Para radiografias, fotos, PDFs e outros documentos, use a área de arquivos do paciente.
        </p>
        <p className="text-xs text-gray-400 mt-1.5">
          Para configurar o formulário de anamnese dos pacientes, vá em{' '}
          <Link to={buildSettingsPath('anamnese')} className="text-[#006970] hover:underline font-medium">
            Configurações → Anamnese
          </Link>{' '}
          e edite as perguntas desejadas.
        </p>
      </div>

      {/* Entity sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(Object.keys(ENTITY_LABELS) as EntityTab[]).map(e => (
          <button key={e} onClick={() => setEntityTab(e)}
            className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${entityTab === e ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
            {ENTITY_LABELS[e]}
          </button>
        ))}
      </div>

      {entityTab === 'pacientes' && <EntityFieldsPanel
        entityLabel="paciente"
        builtinFields={PATIENT_BUILTIN_FIELDS}
        fieldConfig={clinic.patientFieldConfig ?? {}}
        customFields={clinic.customPatientFields ?? []}
        onSave={(config, custom) => ({
          patientFieldConfig: config,
          customPatientFields: custom,
        })}
      />}
      {entityTab === 'profissionais' && <EntityFieldsPanel
        entityLabel="profissional"
        builtinFields={PROFESSIONAL_BUILTIN_FIELDS}
        fieldConfig={clinic.professionalFieldConfig ?? {}}
        customFields={clinic.customProfessionalFields ?? []}
        onSave={(config, custom) => ({
          professionalFieldConfig: config,
          customProfessionalFields: custom,
        })}
      />}
    </div>
  )
}
