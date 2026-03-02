import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import Input from '../ui/Input'
import CustomFieldInput from '../ui/CustomFieldInput'
import { useProfessionals } from '../../hooks/useProfessionals'
import { useCreateInvite } from '../../hooks/useInvites'
import { useClinic } from '../../hooks/useClinic'
import type { Professional } from '../../types'

const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  specialty: z.string().optional(),
  councilId: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  professional?: Professional | null
}

export default function ProfessionalModal({ open, onClose, professional }: Props) {
  const { create, update } = useProfessionals()
  const createInvite = useCreateInvite()
  const { data: clinic } = useClinic()
  const isEditing = !!professional
  const [createAccess, setCreateAccess] = useState(false)
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({})

  const isFieldVisible = (key: string) => clinic?.professionalFieldConfig?.[key] !== false
  const customProfessionalFields = clinic?.customProfessionalFields ?? []

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { active: true },
  })

  useEffect(() => {
    if (open) {
      setCreateAccess(false)
      setCustomFields(professional?.customFields ?? {})
      reset(professional ? {
        name: professional.name,
        specialty: professional.specialty ?? '',
        councilId: professional.councilId ?? '',
        phone: professional.phone ?? '',
        email: professional.email ?? '',
        active: professional.active,
      } : { name: '', specialty: '', councilId: '', phone: '', email: '', active: true })
    }
  }, [open, professional, reset])

  async function onSubmit(values: FormValues) {
    try {
      const payload = {
        name: values.name,
        specialty: values.specialty || null,
        councilId: values.councilId || null,
        phone: values.phone || null,
        email: values.email || null,
        active: values.active,
        customFields,
      }
      if (isEditing) {
        await update.mutateAsync({ id: professional!.id, ...payload })
        toast.success('Profissional atualizado')
      } else {
        await create.mutateAsync(payload)
        // Optionally send a system-access invite when email is provided
        if (createAccess && values.email) {
          try {
            const inviteResult = await createInvite.mutateAsync({
              email: values.email,
              roles: ['professional'],
              name: values.name,
            })
            if (inviteResult.emailSent) {
              toast.success('Profissional cadastrado e convite enviado por e-mail')
            } else if (inviteResult.emailReason === 'already_registered') {
              toast.success('Profissional cadastrado. Usuário já tem conta — convite ficará disponível ao acessar o sistema.')
            } else {
              toast.success('Profissional cadastrado e convite criado')
            }
          } catch {
            // Don't fail the whole save if only the invite fails
            toast.success('Profissional cadastrado')
            toast.warning('Não foi possível criar o convite de acesso — tente novamente na lista.')
          }
        } else {
          toast.success('Profissional cadastrado')
        }
      }
      onClose()
    } catch {
      toast.error('Erro ao salvar profissional')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-xl w-full max-w-md p-6 focus:outline-none max-h-[90dvh] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-base font-semibold text-gray-800">
              {isEditing ? 'Editar profissional' : 'Novo profissional'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Nome *" error={errors.name?.message} {...register('name')} />
            {isFieldVisible('specialty') && (
              <Input label="Especialidade" {...register('specialty')} />
            )}
            {isFieldVisible('councilId') && (
              <Input label="Conselho (CRM / CRO / CREFITO)" {...register('councilId')} />
            )}
            {(isFieldVisible('phone') || isFieldVisible('email')) && (
              <div className="grid grid-cols-2 gap-3">
                {isFieldVisible('phone') && (
                  <Input label="Telefone" {...register('phone')} />
                )}
                {isFieldVisible('email') && (
                  <Input label="E-mail" type="email" error={errors.email?.message} {...register('email')} />
                )}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" className="rounded" {...register('active')} />
              Profissional ativo
            </label>

            {/* Custom fields */}
            {customProfessionalFields.length > 0 && (
              <div className="space-y-3 pt-1 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Informações adicionais</p>
                {customProfessionalFields.map(field => (
                  <CustomFieldInput
                    key={field.key}
                    field={field}
                    value={customFields[field.key]}
                    onChange={(key, val) => setCustomFields(prev => ({ ...prev, [key]: val }))}
                  />
                ))}
              </div>
            )}

            {/* Invite to system access — only shown on creation when email is provided */}
            {!isEditing && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none
                                rounded-lg border border-dashed border-blue-200 bg-blue-50/50 px-3 py-2">
                <input
                  type="checkbox"
                  className="rounded accent-blue-600"
                  checked={createAccess}
                  onChange={e => setCreateAccess(e.target.checked)}
                />
                <span className="text-blue-700 font-medium">Criar acesso ao sistema</span>
                <span className="text-blue-500 text-xs ml-auto">envia convite por e-mail</span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancelar
              </button>
              <button type="submit" disabled={isSubmitting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
