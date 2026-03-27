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
        userId: null,
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
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/35 backdrop-blur-[2px] z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[#fcfdfd] rounded-[28px] shadow-xl w-full max-w-lg focus:outline-none max-h-[90dvh] overflow-y-auto border border-white/60">
          <div className="px-6 py-5 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0ea5b0] mb-2">Equipe clínica</p>
                <Dialog.Title className="text-xl font-semibold text-gray-900 tracking-tight">
                  {isEditing ? 'Editar profissional' : 'Novo profissional'}
                </Dialog.Title>
                <p className="text-sm text-gray-500 mt-1">
                  Cadastre especialidade, contato e acesso ao sistema em um só fluxo.
                </p>
              </div>
              <Dialog.Close asChild>
                <button className="text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 p-2 transition-colors"><X size={18} /></button>
              </Dialog.Close>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-5 rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Resumo</p>
              <p className="text-lg font-semibold text-gray-900">{professional?.name ?? 'Novo profissional'}</p>
              <p className="text-sm text-gray-500 mt-1">
                {professional?.specialty ?? 'Defina especialidade, contato e, se fizer sentido, já crie o acesso ao sistema.'}
              </p>
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
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer rounded-xl bg-[#f8fafb] border border-gray-100 px-3 py-2.5">
                <input type="checkbox" className="rounded accent-[#0ea5b0]" {...register('active')} />
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
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none rounded-2xl border border-teal-200 bg-teal-50/70 px-3 py-3">
                  <input
                    type="checkbox"
                    className="rounded accent-[#0ea5b0]"
                    checked={createAccess}
                    onChange={e => setCreateAccess(e.target.checked)}
                  />
                  <span className="text-[#006970] font-medium">Criar acesso ao sistema</span>
                  <span className="text-[#0ea5b0] text-xs ml-auto">envia convite por e-mail</span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting}
                  className="px-4 py-2.5 text-sm text-white rounded-xl disabled:opacity-50 transition-all active:scale-[0.99]"
                  style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
