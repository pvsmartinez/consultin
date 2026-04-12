import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import Input from '../../components/ui/Input'
import { useClinic } from '../../hooks/useClinic'
import type { Clinic } from '../../types'

const schema = z.object({
  name:    z.string().min(2, 'Nome obrigatório'),
  cnpj:    z.string().optional(),
  phone:   z.string().optional(),
  email:   z.string().email('E-mail inválido').optional().or(z.literal('')),
  address: z.string().optional(),
  city:    z.string().optional(),
  state:   z.string().max(2).optional(),
})
type Form = z.infer<typeof schema>

export default function DadosTab({ clinic }: { clinic: Clinic }) {
  const formKey = [
    clinic.id,
    clinic.name,
    clinic.cnpj ?? '',
    clinic.phone ?? '',
    clinic.email ?? '',
    clinic.address ?? '',
    clinic.city ?? '',
    clinic.state ?? '',
    clinic.allowSelfRegistration ? '1' : '0',
  ].join('|')

  return <DadosTabForm key={formKey} clinic={clinic} />
}

function DadosTabForm({ clinic }: { clinic: Clinic }) {
  const { update } = useClinic()
  const [selfReg, setSelfReg] = useState(clinic.allowSelfRegistration)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:    clinic.name,
      cnpj:    clinic.cnpj ?? '',
      phone:   clinic.phone ?? '',
      email:   clinic.email ?? '',
      address: clinic.address ?? '',
      city:    clinic.city ?? '',
      state:   clinic.state ?? '',
    },
  })

  async function onSubmit(values: Form) {
    try {
      await update.mutateAsync({
        name:                 values.name,
        cnpj:                 values.cnpj    || null,
        phone:                values.phone   || null,
        email:                values.email   || null,
        address:              values.address || null,
        city:                 values.city    || null,
        state:                values.state   || null,
        allowSelfRegistration: selfReg,
      })
      toast.success('Dados salvos')
    } catch {
      toast.error('Erro ao salvar')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input label="Nome da clínica *" error={errors.name?.message} {...register('name')} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="CNPJ" placeholder="00.000.000/0001-00" {...register('cnpj')} />
        <Input label="Telefone" {...register('phone')} />
      </div>
      <Input label="E-mail" type="email" error={errors.email?.message} {...register('email')} />
      <Input label="Endereço" {...register('address')} />
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2"><Input label="Cidade" {...register('city')} /></div>
        <Input label="UF" maxLength={2} {...register('state')} />
      </div>

      {/* Patient self-registration */}
      <div className="pt-2 border-t border-gray-100">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={selfReg}
            onChange={e => setSelfReg(e.target.checked)}
            className="mt-0.5 rounded border-gray-300"
          />
          <div>
            <p className="text-sm font-medium text-gray-700">Permitir autocadastro no portal do paciente</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Se ativado, novos pacientes podem criar conta e agendar consultas diretamente.
              Se desativado, somente o atendente pode cadastrar novos pacientes.
            </p>
          </div>
        </label>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={isSubmitting}
          className="px-5 py-2 text-sm text-white rounded-xl disabled:opacity-40 transition-all active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
          {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  )
}
