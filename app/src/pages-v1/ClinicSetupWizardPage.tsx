import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { gtagEvent } from '../lib/gtag'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { QK } from '../lib/queryKeys'
import {
  Stethoscope,
  Buildings,
  Users,
  UsersFour,
  CalendarBlank,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useClinic } from '../hooks/useClinic'
import { useProfessionals } from '../hooks/useProfessionals'
import { useAuthContext } from '../contexts/AuthContext'
import Input from '../components/ui/Input'
import type { Clinic } from '../types'
import { PATIENT_BUILTIN_FIELDS, PROFESSIONAL_BUILTIN_FIELDS } from '../types'
import EntityFieldsPanel from '../components/fields/EntityFieldsPanel'

// ─── Wizard steps ─────────────────────────────────────────────────────────────

const STEPS = [
  { key: 'dados',               label: 'Clínica',       icon: Buildings },
  { key: 'campos-pacientes',    label: 'Pacientes',     icon: Users },
  { key: 'campos-profissionais',label: 'Equipe',        icon: UsersFour },
  { key: 'agenda',              label: 'Agenda',        icon: CalendarBlank },
  { key: 'pronto',              label: 'Pronto!',       icon: CheckCircle },
] as const

type StepKey = (typeof STEPS)[number]['key']

// ─── Main wizard page ─────────────────────────────────────────────────────────

export default function ClinicSetupWizardPage() {
  const { data: clinic, isLoading } = useClinic()
  const [step, setStep] = useState<StepKey>('dados')

  if (isLoading || !clinic) {
    return (
      <WizardShell step={step} onGoTo={() => {}}>
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          Carregando configurações…
        </div>
      </WizardShell>
    )
  }

  const currentIndex = STEPS.findIndex(s => s.key === step)

  function goNext() {
    gtagEvent('onboarding_step_complete', { step_name: step })
    const next = STEPS[currentIndex + 1]
    if (next) setStep(next.key)
  }
  function goBack() {
    const prev = STEPS[currentIndex - 1]
    if (prev) setStep(prev.key)
  }

  return (
    <WizardShell step={step} onGoTo={(key) => {
      // Only allow going back to already-visited steps
      const targetIndex = STEPS.findIndex(s => s.key === key)
      if (targetIndex < currentIndex) setStep(key)
    }}>
      {step === 'dados' && (
        <StepDados clinic={clinic} onNext={goNext} />
      )}
      {step === 'campos-pacientes' && (
        <EntityFieldsPanel
          key="pacientes"
          title="Campos do cadastro de pacientes"
          subtitle="Ative somente os campos que sua clínica realmente usa. Você pode ajustar isso depois em Configurações."
          entityLabel="paciente"
          builtinFields={PATIENT_BUILTIN_FIELDS}
          fieldConfig={clinic.patientFieldConfig ?? {}}
          customFields={clinic.customPatientFields ?? []}
          onSave={(config, custom) => ({
            patientFieldConfig: config,
            customPatientFields: custom,
          })}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {step === 'campos-profissionais' && (
        <EntityFieldsPanel
          key="profissionais"
          title="Campos do cadastro de profissionais"
          subtitle="Configure quais dados você precisa de cada membro da sua equipe."
          entityLabel="profissional"
          builtinFields={PROFESSIONAL_BUILTIN_FIELDS}
          fieldConfig={clinic.professionalFieldConfig ?? {}}
          customFields={clinic.customProfessionalFields ?? []}
          onSave={(config, custom) => ({
            professionalFieldConfig: config,
            customProfessionalFields: custom,
          })}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {step === 'agenda' && (
        <StepAgenda clinic={clinic} onNext={goNext} onBack={goBack} />
      )}
      {step === 'pronto' && (
        <StepPronto clinic={clinic} onBack={goBack} />
      )}
    </WizardShell>
  )
}

// ─── Shell (layout + stepper) ─────────────────────────────────────────────────

function WizardShell({
  step,
  onGoTo,
  children,
}: {
  step: StepKey
  onGoTo: (key: StepKey) => void
  children: React.ReactNode
}) {
  const currentIndex = STEPS.findIndex(s => s.key === step)

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-teal-100 flex items-start justify-center p-6 pt-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 mb-8">
          <Stethoscope size={24} className="text-[#0ea5b0]" />
          <span className="text-lg font-semibold text-gray-800">Consultin</span>
          <span className="text-sm text-gray-400 ml-1">— Configuração inicial</span>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((s, i) => {
            const done    = i < currentIndex
            const active  = i === currentIndex
            const Icon    = s.icon
            return (
              <div key={s.key} className="flex items-center gap-1 flex-1 last:flex-none">
                <button
                  onClick={() => onGoTo(s.key)}
                  disabled={i > currentIndex}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap
                    ${active ? 'bg-[#0ea5b0] text-white' : done ? 'bg-teal-100 text-teal-700 hover:bg-teal-200' : 'bg-gray-100 text-gray-400 cursor-default'}`}
                >
                  <Icon size={13} />
                  {s.label}
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 rounded ${i < currentIndex ? 'bg-teal-300' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Step 1: Dados da clínica ─────────────────────────────────────────────────

const dadosSchema = z.object({
  name:    z.string().min(2, 'Nome obrigatório'),
  cnpj:    z.string().optional(),
  phone:   z.string().optional(),
  email:   z.string().email('E-mail inválido').optional().or(z.literal('')),
  address: z.string().optional(),
  city:    z.string().optional(),
  state:   z.string().max(2).optional(),
})
type DadosForm = z.infer<typeof dadosSchema>

function StepDados({ clinic, onNext }: { clinic: Clinic; onNext: () => void }) {
  const { update } = useClinic()
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<DadosForm>({
    resolver: zodResolver(dadosSchema),
  })

  useEffect(() => {
    reset({
      name:    clinic.name,
      cnpj:    clinic.cnpj ?? '',
      phone:   clinic.phone ?? '',
      email:   clinic.email ?? '',
      address: clinic.address ?? '',
      city:    clinic.city ?? '',
      state:   clinic.state ?? '',
    })
  }, [clinic, reset])

  async function onSubmit(values: DadosForm) {
    try {
      await update.mutateAsync({
        name:    values.name,
        cnpj:    values.cnpj    || null,
        phone:   values.phone   || null,
        email:   values.email   || null,
        address: values.address || null,
        city:    values.city    || null,
        state:   values.state   || null,
      })
      onNext()
    } catch {
      toast.error('Erro ao salvar dados da clínica')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Dados da clínica</h2>
        <p className="text-sm text-gray-400">
          Confirme ou preencha as informações da sua clínica. Esses dados aparecem em
          faturas, notificações e cabeçalhos de relatórios.
        </p>
      </div>

      <Input label="Nome da clínica *" error={errors.name?.message} {...register('name')} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="CNPJ" placeholder="00.000.000/0001-00" {...register('cnpj')} />
        <Input label="Telefone" placeholder="(11) 3000-0000" {...register('phone')} />
      </div>
      <Input label="E-mail" type="email" error={errors.email?.message} {...register('email')} />
      <Input label="Endereço" placeholder="Rua, número, bairro" {...register('address')} />
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3 sm:col-span-2">
          <Input label="Cidade" {...register('city')} />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <Input label="UF" maxLength={2} placeholder="SP" {...register('state')} />
        </div>
      </div>

      <WizardNavBar
        onBack={undefined}
        nextLabel="Salvar e continuar"
        nextLoading={isSubmitting}
        nextType="submit"
      />
    </form>
  )
}
// ─── Step 4: Agenda ───────────────────────────────────────────────────────────

const WEEKDAYS = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
] as const

const SLOT_DURATIONS = [15, 20, 30, 45, 60]

function StepAgenda({
  clinic,
  onNext,
  onBack,
}: {
  clinic: Clinic
  onNext: () => void
  onBack: () => void
}) {
  const { update } = useClinic()
  const [slotDuration, setSlotDuration] = useState(clinic.slotDurationMinutes)
  const [hours, setHours] = useState<Partial<Record<string, { start: string; end: string }>>>(
    clinic.workingHours ?? {}
  )
  const [saving, setSaving] = useState(false)

  function toggleDay(key: string) {
    setHours(prev => {
      const next = { ...prev }
      if (next[key]) delete next[key]
      else next[key] = { start: '08:00', end: '18:00' }
      return next
    })
  }

  function updateHour(key: string, field: 'start' | 'end', value: string) {
    setHours(prev => ({ ...prev, [key]: { ...prev[key]!, [field]: value } }))
  }

  async function handleNext() {
    setSaving(true)
    try {
      await update.mutateAsync({
        slotDurationMinutes: slotDuration,
        workingHours: hours as Record<string, { start: string; end: string }>,
      })
      onNext()
    } catch {
      toast.error('Erro ao salvar configurações de agenda')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Configurar agenda</h2>
        <p className="text-sm text-gray-400">
          Defina a duração padrão de cada consulta e os dias e horários de atendimento da clínica.
        </p>
      </div>

      {/* Slot duration */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Duração padrão da consulta
        </label>
        <div className="flex flex-wrap gap-2">
          {SLOT_DURATIONS.map(d => (
            <button key={d} type="button" onClick={() => setSlotDuration(d)}
              className={`px-4 py-2 text-sm rounded-xl border transition-colors ${slotDuration === d ? 'bg-[#0ea5b0] text-white border-transparent' : 'border-gray-300 text-gray-600 hover:border-teal-400'}`}>
              {d} min
            </button>
          ))}
        </div>
      </div>

      {/* Working hours */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Dias e horários de funcionamento
        </label>
        <div className="space-y-2">
          {WEEKDAYS.map(({ key, label }) => {
            const active = !!hours[key]
            const wh = hours[key]
            return (
              <div key={key} className="flex items-center gap-4">
                <label className="flex items-center gap-2 w-28 cursor-pointer">
                  <input type="checkbox" checked={active} onChange={() => toggleDay(key)}
                    className="rounded border-gray-300" />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
                {active && wh ? (
                  <div className="flex items-center gap-2">
                    <input type="time" value={wh.start}
                      onChange={e => updateHour(key, 'start', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                    <span className="text-gray-400 text-sm">até</span>
                    <input type="time" value={wh.end}
                      onChange={e => updateHour(key, 'end', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                  </div>
                ) : (
                  <span className="text-sm text-gray-300">Fechado</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <WizardNavBar
        onBack={onBack}
        onNext={handleNext}
        nextLabel="Salvar e continuar"
        nextLoading={saving}
      />
    </div>
  )
}

// ─── Step 5: Pronto! ──────────────────────────────────────────────────────────

function StepPronto({ clinic, onBack }: { clinic: Clinic; onBack: () => void }) {
  const { update } = useClinic()
  const { profile } = useAuthContext()
  const { data: professionals = [], create: createProfessional } = useProfessionals()
  const qc         = useQueryClient()
  const navigate   = useNavigate()
  const [saving, setSaving] = useState(false)

  async function finish() {
    setSaving(true)
    try {
      gtagEvent('onboarding_complete')
      await update.mutateAsync({ onboardingCompleted: true })
      // Auto-register clinic owner as professional if they don't have a record yet
      const ownerAlreadyLinked = professionals.some(p => p.userId === profile?.id)
      if (!ownerAlreadyLinked) {
        try {
          await createProfessional.mutateAsync({
            name:         profile?.name ?? clinic.name,
            specialty:    null,
            councilId:    null,
            phone:        null,
            email:        null,
            active:       true,
            customFields: {},
            userId:       profile?.id ?? null,
          })
        } catch {
          // Non-critical: professional creation failed, user can add later
        }
      }
      // Update cache immediately so App.tsx guard re-evaluates before navigation
      qc.setQueryData(QK.clinic.detail(profile?.clinicId), (old: Clinic | undefined) =>
        old ? { ...old, onboardingCompleted: true } : old
      )
      navigate('/agenda')
    } catch {
      toast.error('Erro ao finalizar configuração')
      setSaving(false)
    }
  }

  return (
    <div className="text-center space-y-6 py-4">
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle size={36} weight="fill" className="text-green-500" />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Tudo pronto, {clinic.name}!
        </h2>
        <p className="text-sm text-gray-400 max-w-sm mx-auto">
          Sua clínica está configurada. Você pode ajustar qualquer detalhe a qualquer momento
          em <strong className="text-gray-600">Configurações</strong>.
        </p>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-3">O que você pode fazer agora:</p>
        <p className="flex items-center gap-2">
          <CalendarBlank size={16} className="text-[#0ea5b0] shrink-0" />
          Criar o primeiro agendamento na agenda
        </p>
        <p className="flex items-center gap-2">
          <UsersFour size={16} className="text-violet-500 shrink-0" />
          Convidar profissionais da equipe em <strong>Profissionais</strong>
        </p>
        <p className="flex items-center gap-2">
          <Users size={16} className="text-teal-500 shrink-0" />
          Cadastrar os primeiros pacientes em <strong>Pacientes</strong>
        </p>
      </div>

      <div className="flex items-center justify-center gap-3 pt-2">
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={15} /> Voltar
        </button>
        <button onClick={finish} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
          {saving ? 'Abrindo agenda…' : 'Abrir minha agenda'}
          {!saving && <ArrowRight size={16} />}
        </button>
      </div>
    </div>
  )
}

// ─── Wizard nav bar (prev / next buttons) ────────────────────────────────────

function WizardNavBar({
  onBack,
  onNext,
  nextLabel,
  nextLoading,
  nextType,
}: {
  onBack?: (() => void) | undefined
  onNext?: () => void
  nextLabel: string
  nextLoading?: boolean
  nextType?: 'button' | 'submit'
}) {
  return (
    <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-4">
      <div>
        {onBack && (
          <button type="button" onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={15} /> Voltar
          </button>
        )}
      </div>
      <button
        type={nextType ?? 'button'}
        onClick={nextType !== 'submit' ? onNext : undefined}
        disabled={nextLoading}
        className="flex items-center gap-2 px-5 py-2 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-all active:scale-[0.98]"
        style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
      >
        {nextLoading ? 'Salvando…' : nextLabel}
        {!nextLoading && <ArrowRight size={15} />}
      </button>
    </div>
  )
}
