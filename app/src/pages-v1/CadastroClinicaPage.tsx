import { useState } from 'react'
import { Stethoscope } from '@phosphor-icons/react'
import { z } from 'zod'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { IMaskInput } from 'react-imask'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { trackPublicEvent } from '../lib/publicAnalytics'
import { gtagEvent } from '../lib/gtag'
import { Seo } from '../components/seo/Seo'

const schema = z.object({
  clinicName:      z.string().min(2, 'Nome da clínica obrigatório'),
  cnpj:            z.string().optional(),
  phone:           z.string().optional(),
  email:           z.string().email('E-mail inválido'),
  responsibleName: z.string().min(2, 'Nome do responsável obrigatório'),
  message:         z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export default function CadastroClinicaPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    try {
      // Submit via Edge Function (service role insert + Telegram notification)
      const { error } = await supabase.functions.invoke('submit-clinic-signup', {
        body: {
          clinicName:      values.clinicName,
          responsibleName: values.responsibleName,
          email:           values.email,
          cnpj:            values.cnpj    || undefined,
          phone:           values.phone   || undefined,
          message:         values.message || undefined,
        },
      })

      if (error) throw new Error(error.message)

      trackPublicEvent('clinic_signup_submit')
      gtagEvent('sign_up', { method: 'clinic_form' })
      navigate('/bem-vindo')
    } catch (e: unknown) {
      setServerError((e as Error).message ?? 'Erro ao enviar solicitação. Tente novamente.')
    }
  }

  return (
    <>
      <Seo
        title="Cadastro de clínica | Consultin"
        description="Peça acesso ao Consultin e comece a organizar agenda, pacientes, prontuário, financeiro e atendimento da sua clínica no Brasil."
        canonicalPath="/cadastro-clinica"
        keywords={[
          'cadastro de clínica',
          'software para clínicas',
          'sistema para consultório',
          'agenda médica online',
        ]}
      />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <Stethoscope size={24} className="text-blue-600" />
            <span className="text-lg font-semibold text-gray-800">Consultin</span>
          </div>
          <h1 className="text-base font-semibold text-gray-800 mb-1">Cadastre sua clínica</h1>
          <p className="text-sm text-gray-500 mb-6">
            Preencha os dados abaixo. Nossa equipe revisará e entrará em contato em breve.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Clinic name */}
            <Field label="Nome da clínica *" error={errors.clinicName?.message}>
              <input
                {...register('clinicName')}
                placeholder="Ex: Clínica Saúde & Vida"
                className={inputClass(!!errors.clinicName)}
              />
            </Field>

            {/* CNPJ */}
            <Field label="CNPJ">
              <Controller control={control} name="cnpj" render={({ field }) => (
                <IMaskInput
                  mask="00.000.000/0000-00"
                  value={field.value ?? ''}
                  onAccept={(val: string) => field.onChange(val)}
                  placeholder="00.000.000/0001-00"
                  className={inputClass(false)}
                />
              )} />
            </Field>

            {/* Email + Phone (2 cols) */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="E-mail *" error={errors.email?.message} className="col-span-2">
                <input
                  {...register('email')}
                  type="email"
                  placeholder="contato@suaclinica.com"
                  className={inputClass(!!errors.email)}
                />
              </Field>
              <Field label="Telefone" className="col-span-2">
                <Controller control={control} name="phone" render={({ field }) => (
                  <IMaskInput
                    mask={[{ mask: '(00) 0000-0000' }, { mask: '(00) 00000-0000' }]}
                    value={field.value ?? ''}
                    onAccept={(val: string) => field.onChange(val)}
                    placeholder="(11) 99999-9999"
                    className={inputClass(false)}
                  />
                )} />
              </Field>
            </div>

            {/* Responsible name */}
            <Field label="Seu nome completo *" error={errors.responsibleName?.message}>
              <input
                {...register('responsibleName')}
                placeholder="Nome do responsável pela clínica"
                className={inputClass(!!errors.responsibleName)}
              />
            </Field>

            {/* Message */}
            <Field label="Mensagem (opcional)">
              <textarea
                {...register('message')}
                rows={3}
                placeholder="Conte um pouco sobre sua clínica, especialidade, número de profissionais..."
                className={`${inputClass(false)} resize-none`}
              />
            </Field>

            {serverError && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {serverError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition-colors">
              {isSubmitting ? 'Enviando solicitação...' : 'Enviar solicitação'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            Já tem acesso?{' '}
            <Link to="/" className="text-blue-600 hover:underline font-medium">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function inputClass(hasError: boolean) {
  return `w-full border rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 ${
    hasError ? 'border-red-400' : 'border-gray-300'
  }`
}

function Field({
  label, error, children, className,
}: {
  label: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
