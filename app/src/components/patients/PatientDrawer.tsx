/**
 * PatientDrawer
 *
 * Right-side slide-over panel for creating or editing a patient.
 * Replaces the full-page /pacientes/novo and /pacientes/:id/editar routes
 * so the user never loses their place in the app.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { X, FloppyDisk, SpinnerGap, LinkSimple, XCircle } from '@phosphor-icons/react'
import { IMaskInput } from 'react-imask'
import cep from 'cep-promise'
import Input from '../ui/Input'
import Select from '../ui/Select'
import TextArea from '../ui/TextArea'
import CustomFieldInput from '../ui/CustomFieldInput'
import { usePatients, usePatient, useFindUserByCpf } from '../../hooks/usePatients'
import { useClinic } from '../../hooks/useClinic'
import type { PatientInput, Sex } from '../../types'
import { BR_STATES as BR_STATES_LIST } from '../../utils/constants'

const BR_STATES = BR_STATES_LIST.map(s => ({ value: s, label: s }))

function hasCustomFieldValue(value: unknown) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

const EMPTY_FORM: PatientInput = {
  userId: null, name: '', cpf: null, rg: null, birthDate: null, sex: null,
  phone: null, email: null,
  addressStreet: null, addressNumber: null, addressComplement: null,
  addressNeighborhood: null, addressCity: null, addressState: null, addressZip: null,
  notes: null, customFields: {},
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em] mb-3 pb-2 border-b border-gray-100">
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {children}
      </div>
    </div>
  )
}

function MaskedInput({
  label, mask, value, onAccept, placeholder, required,
}: {
  label: string; mask: string; value: string; onAccept: (v: string) => void
  placeholder?: string; required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <IMaskInput
        mask={mask} value={value} onAccept={(v: string) => onAccept(v)}
        placeholder={placeholder}
        className="border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] transition"
      />
    </div>
  )
}

interface PatientDrawerProps {
  open:        boolean
  patientId?:  string          // undefined = new patient, defined = edit
  initialValues?: Partial<PatientInput>
  stacked?: boolean
  onClose:     () => void
  onSaved:     (patient: { id: string; name: string }) => void
}

export default function PatientDrawer({ open, patientId, initialValues, stacked = false, onClose, onSaved }: PatientDrawerProps) {
  const isEdit = Boolean(patientId)
  const { createPatient, updatePatient } = usePatients()
  const { patient, loading: loadingPatient } = usePatient(patientId ?? '')
  const { data: clinic } = useClinic()
  const findUserByCpf = useFindUserByCpf()

  const isFieldVisible = (key: string) => clinic?.patientFieldConfig?.[key] !== false
  const customPatientFields = clinic?.customPatientFields ?? []

  const [form, setForm]       = useState<PatientInput>(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [cepLoading, setCepLoading] = useState(false)

  type CpfSuggestion = { userId: string; displayName: string }
  const [cpfSuggestion, setCpfSuggestion] = useState<CpfSuggestion | null>(null)
  const [cpfLinked, setCpfLinked]         = useState(false)
  const cpfDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset form when opened for a new patient
  useEffect(() => {
    if (open && !isEdit) {
      setForm({
        ...EMPTY_FORM,
        ...initialValues,
        customFields: initialValues?.customFields ?? {},
      })
      setError(null)
      setCpfSuggestion(null)
      setCpfLinked(false)
    }
  }, [open, isEdit, initialValues])

  // Populate form when editing
  useEffect(() => {
    if (isEdit && patient) {
      setForm({
        userId: patient.userId, name: patient.name, cpf: patient.cpf, rg: patient.rg,
        birthDate: patient.birthDate, sex: patient.sex, phone: patient.phone,
        email: patient.email, addressStreet: patient.addressStreet,
        addressNumber: patient.addressNumber, addressComplement: patient.addressComplement,
        addressNeighborhood: patient.addressNeighborhood, addressCity: patient.addressCity,
        addressState: patient.addressState, addressZip: patient.addressZip,
        notes: patient.notes, customFields: patient.customFields ?? {},
      })
    }
  }, [isEdit, patient])

  // CPF portal-account linking
  useEffect(() => {
    const digits = (form.cpf ?? '').replace(/\D/g, '')
    if (form.userId) { setCpfSuggestion(null); return }
    if (digits.length !== 11) { setCpfSuggestion(null); setCpfLinked(false); return }
    if (cpfDebounceRef.current) clearTimeout(cpfDebounceRef.current)
    cpfDebounceRef.current = setTimeout(async () => {
      try { const r = await findUserByCpf.mutateAsync(form.cpf ?? ''); setCpfSuggestion(r); setCpfLinked(false) }
      catch { /* ignore */ }
    }, 600)
    return () => { if (cpfDebounceRef.current) clearTimeout(cpfDebounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cpf])

  const set = (field: keyof PatientInput, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value || null }))

  const handleCepLookup = useCallback(async (rawCep: string) => {
    set('addressZip', rawCep)
    const digits = rawCep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const result = await cep(digits)
      setForm(prev => ({
        ...prev,
        addressStreet: result.street || prev.addressStreet,
        addressNeighborhood: result.neighborhood || prev.addressNeighborhood,
        addressCity: result.city || prev.addressCity,
        addressState: result.state || prev.addressState,
      }))
    } catch { /* user fills manually */ }
    finally { setCepLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }
    const missingRequiredField = customPatientFields.find(field =>
      field.required && !hasCustomFieldValue(form.customFields[field.key])
    )
    if (missingRequiredField) {
      setError(`Preencha o campo obrigatório "${missingRequiredField.label}".`)
      return
    }
    setSaving(true); setError(null)
    try {
      if (isEdit && patientId) {
        await updatePatient(patientId, form)
        onSaved({ id: patientId, name: form.name.trim() })
      } else {
        const p = await createPatient(form)
        onSaved({ id: p.id, name: form.name.trim() || p.name })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar paciente.')
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-slate-950/35 backdrop-blur-[2px] transition-opacity ${stacked ? 'z-[60]' : 'z-40'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`fixed right-0 top-0 h-full w-full max-w-2xl bg-[#fcfdfd] shadow-2xl flex flex-col border-l border-white/60 ${stacked ? 'z-[70]' : 'z-50'}`}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 flex-shrink-0 bg-white/80 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0ea5b0] mb-2">
                Cadastro clínico
              </p>
              <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
                {isEdit ? 'Editar paciente' : 'Novo paciente'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {isEdit
                  ? 'Atualize dados cadastrais, vínculo com portal e informações de contato.'
                  : 'Cadastre um novo paciente sem sair da agenda ou da lista principal.'}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors rounded-xl hover:bg-gray-100 p-2">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isEdit && loadingPatient ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Carregando...</div>
          ) : (
            <form id="patient-drawer-form" onSubmit={handleSubmit}>
              <div className="mb-6 rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Resumo</p>
                    <p className="text-lg font-semibold text-gray-900">{form.name?.trim() || 'Paciente sem nome ainda'}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {form.phone || form.email || 'Preencha ao menos um contato para facilitar confirmações e lembretes.'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-teal-50 border border-teal-100 px-3 py-2 text-right min-w-[150px]">
                    <p className="text-[11px] uppercase tracking-wide text-[#0ea5b0] mb-1">Status</p>
                    <p className="text-sm font-semibold text-[#006970]">{isEdit ? 'Cadastro existente' : 'Novo cadastro'}</p>
                  </div>
                </div>
              </div>

              {/* Dados pessoais */}
              <DrawerSection title="Dados Pessoais">
                <div className="sm:col-span-2">
                  <Input label="Nome completo" value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="Nome do paciente" required />
                </div>
                {isFieldVisible('birthDate') && (
                  <Input label="Data de nascimento" type="date" value={form.birthDate ?? ''}
                    onChange={e => set('birthDate', e.target.value)} />
                )}
                {isFieldVisible('sex') && (
                  <Select label="Sexo" value={form.sex ?? ''} onChange={e => set('sex', e.target.value as Sex)}
                    placeholder="Selecione"
                    options={[{ value: 'M', label: 'Masculino' }, { value: 'F', label: 'Feminino' }, { value: 'O', label: 'Outro' }]} />
                )}
                {isFieldVisible('cpf') && (
                  <MaskedInput label="CPF" mask="000.000.000-00" value={form.cpf ?? ''}
                    onAccept={val => set('cpf', val)} placeholder="000.000.000-00" />
                )}
                {isFieldVisible('cpf') && cpfSuggestion && !cpfLinked && (
                  <div className="sm:col-span-2 flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm">
                    <LinkSimple size={18} className="mt-0.5 shrink-0 text-[#0ea5b0]" />
                    <div className="flex-1">
                      <p className="font-medium text-[#006970]">CPF pertence a uma conta existente</p>
                      <p className="text-[#006970] mt-0.5">
                        <span className="font-medium">{cpfSuggestion.displayName}</span> já tem acesso ao portal. Vincular?
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button type="button"
                        onClick={() => { setForm(p => ({ ...p, userId: cpfSuggestion.userId })); setCpfLinked(true); setCpfSuggestion(null) }}
                        className="px-3 py-2 text-xs font-medium text-white rounded-xl transition-all active:scale-[0.99]"
                        style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
                        Vincular
                      </button>
                      <button type="button" onClick={() => setCpfSuggestion(null)}
                        className="px-3 py-2 text-xs font-medium text-[#006970] hover:bg-white rounded-xl transition">
                        Ignorar
                      </button>
                    </div>
                  </div>
                )}
                {isFieldVisible('cpf') && (cpfLinked || (isEdit && form.userId)) && (
                  <div className="sm:col-span-2 flex items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-[#006970]">
                    <LinkSimple size={16} className="text-[#0ea5b0]" />
                    <span>Prontuário vinculado ao portal do paciente</span>
                    {!isEdit && (
                      <button type="button" onClick={() => { setForm(p => ({ ...p, userId: null })); setCpfLinked(false) }}
                        className="ml-auto text-[#006970] hover:text-[#004f55] transition">
                        <XCircle size={16} />
                      </button>
                    )}
                  </div>
                )}
                {isFieldVisible('rg') && (
                  <Input label="RG" value={form.rg ?? ''} onChange={e => set('rg', e.target.value)} placeholder="00.000.000-0" />
                )}
              </DrawerSection>

              {/* Contato */}
              {(isFieldVisible('phone') || isFieldVisible('email')) && (
                <DrawerSection title="Contato">
                  {isFieldVisible('phone') && (
                    <MaskedInput label="Telefone / WhatsApp" mask="{(}00{)} 00000-0000"
                      value={form.phone ?? ''} onAccept={val => set('phone', val)} placeholder="(11) 99999-9999" />
                  )}
                  {isFieldVisible('email') && (
                    <Input label="E-mail" type="email" value={form.email ?? ''}
                      onChange={e => set('email', e.target.value)} placeholder="paciente@email.com" />
                  )}
                </DrawerSection>
              )}

              {/* Endereço */}
              {isFieldVisible('address') && (
                <DrawerSection title="Endereço">
                  <div className="relative">
                    <MaskedInput label="CEP" mask="00000-000" value={form.addressZip ?? ''}
                      onAccept={handleCepLookup} placeholder="00000-000" />
                    {cepLoading && <SpinnerGap size={14} className="absolute right-3 top-9 text-[#0ea5b0] animate-spin" />}
                  </div>
                  <Input label="Número" value={form.addressNumber ?? ''}
                    onChange={e => set('addressNumber', e.target.value)} placeholder="123" />
                  <div className="sm:col-span-2">
                    <Input label="Logradouro" value={form.addressStreet ?? ''}
                      onChange={e => set('addressStreet', e.target.value)} placeholder="Rua, Avenida..." />
                  </div>
                  <Input label="Complemento" value={form.addressComplement ?? ''}
                    onChange={e => set('addressComplement', e.target.value)} placeholder="Apto, Bloco..." />
                  <Input label="Bairro" value={form.addressNeighborhood ?? ''}
                    onChange={e => set('addressNeighborhood', e.target.value)} />
                  <Input label="Cidade" value={form.addressCity ?? ''}
                    onChange={e => set('addressCity', e.target.value)} />
                  <Select label="Estado" value={form.addressState ?? ''}
                    onChange={e => set('addressState', e.target.value)}
                    placeholder="UF" options={BR_STATES} />
                </DrawerSection>
              )}

              {/* Campos personalizados */}
              {customPatientFields.length > 0 && (
                <DrawerSection title="Informações adicionais">
                  {customPatientFields.map(field => (
                    <CustomFieldInput key={field.key} field={field}
                      value={form.customFields[field.key]}
                      onChange={(key, val) => setForm(prev => ({ ...prev, customFields: { ...prev.customFields, [key]: val } }))} />
                  ))}
                </DrawerSection>
              )}

              {/* Observações */}
              {isFieldVisible('notes') && (
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 pb-2 border-b border-gray-100">
                    Observações
                  </h3>
                  <TextArea label="Anotações internas" value={form.notes ?? ''}
                    onChange={e => set('notes', e.target.value)}
                    placeholder="Alergias, preferências, histórico relevante..." />
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 flex items-center justify-between gap-3">
          {error && <p className="text-sm text-red-600 flex-1">{error}</p>}
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition">
              Cancelar
            </button>
            <button type="submit" form="patient-drawer-form" disabled={saving}
              className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.99] disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
              <FloppyDisk size={16} />
              {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Salvar paciente'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
