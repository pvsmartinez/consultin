import { useState, useEffect } from 'react'
import { Plus, PencilSimple, Trash, Check, X, CurrencyDollar, Clock, ClipboardText } from '@phosphor-icons/react'
import { toast } from 'sonner'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useServiceTypes, useCreateServiceType, useUpdateServiceType, useDeleteServiceType } from '../../hooks/useServiceTypes'
import { useClinic } from '../../hooks/useClinic'
import { SERVICE_TYPE_COLORS } from '../../types'
import type { ServiceType, ServiceTypeInput } from '../../types'
import { formatBRL } from '../../utils/currency'

interface FormState {
  name: string
  durationMinutes: number
  priceCents: string   // string for controlled input
  color: string
  active: boolean
}

const EMPTY: FormState = {
  name: '',
  durationMinutes: 30,
  priceCents: '',
  color: SERVICE_TYPE_COLORS[0],
  active: true,
}

const DURATION_PRESETS = [15, 20, 30, 45, 60, 90, 120]

export default function ServicosTab() {
  const { data: services = [], isLoading } = useServiceTypes()
  const create = useCreateServiceType()
  const update = useUpdateServiceType()
  const remove = useDeleteServiceType()
  const { data: clinic } = useClinic()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ServiceType | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [confirmDelete, setConfirmDelete] = useState<ServiceType | null>(null)

  // Resync form when editing changes
  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        durationMinutes: editing.durationMinutes,
        priceCents: editing.priceCents != null ? String(editing.priceCents / 100) : '',
        color: editing.color,
        active: editing.active,
      })
    }
  }, [editing])

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setShowForm(true)
  }

  function openEdit(s: ServiceType) {
    setEditing(s)
    setShowForm(true)
  }

  function cancel() {
    setShowForm(false)
    setEditing(null)
    setForm(EMPTY)
  }

  async function submit() {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return }
    const priceCentsVal = form.priceCents.trim()
      ? Math.round(parseFloat(form.priceCents.replace(',', '.')) * 100)
      : null

    const input: ServiceTypeInput = {
      name:            form.name.trim(),
      durationMinutes: form.durationMinutes,
      priceCents:      priceCentsVal,
      color:           form.color,
      active:          form.active,
    }

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...input })
        toast.success('Serviço atualizado')
      } else {
        await create.mutateAsync(input)
        toast.success('Serviço criado')
      }
      cancel()
    } catch {
      toast.error('Erro ao salvar')
    }
  }

  async function toggleActive(s: ServiceType) {
    try {
      await update.mutateAsync({ id: s.id, active: !s.active })
      toast.success(s.active ? 'Serviço desativado' : 'Serviço ativado')
    } catch {
      toast.error('Erro')
    }
  }

  function handleDelete(s: ServiceType) {
    setConfirmDelete(s)
  }

  async function executeDelete() {
    if (!confirmDelete) return
    try {
      await remove.mutateAsync(confirmDelete.id)
      toast.success('Serviço excluído')
    } catch {
      toast.error('Não é possível excluir — serviço com consultas vinculadas')
    }
    setConfirmDelete(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            Cadastre os tipos de atendimento da sua clínica — consulta inicial, retorno, avaliação, etc.
            A duração e o valor de cada serviço serão pré-preenchidos ao agendar.
          </p>
          {clinic?.anamnesisFields && clinic.anamnesisFields.length > 0 && (
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <ClipboardText size={12} />
              Formulário de anamnese configurado com {clinic.anamnesisFields.length} pergunta{clinic.anamnesisFields.length !== 1 ? 's' : ''}.
            </p>
          )}
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-xl flex-shrink-0 transition-all active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
        >
          <Plus size={14} /> Novo serviço
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
          <p className="text-sm font-medium text-gray-700">{editing ? 'Editar serviço' : 'Novo serviço'}</p>

          {/* Name */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nome do serviço *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Consulta inicial, Retorno, Limpeza..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Duração</label>
            <div className="flex flex-wrap gap-2">
              {DURATION_PRESETS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, durationMinutes: d }))}
                  className={`px-3 py-1.5 text-sm rounded-xl border transition-all active:scale-[0.98] ${
                    form.durationMinutes === d
                      ? 'text-white border-transparent'
                      : 'border-gray-300 text-gray-600 hover:border-[#0ea5b0]'
                  }`}
                  style={form.durationMinutes === d ? { background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' } : undefined}
                >
                  {d} min
                </button>
              ))}
              <input
                type="number"
                min={5}
                max={480}
                value={form.durationMinutes}
                onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))}
                className="w-24 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                placeholder="min"
              />
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Valor (R$) — deixe em branco para definir no agendamento</label>
            <div className="relative w-48">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.priceCents}
                onChange={e => setForm(f => ({ ...f, priceCents: e.target.value }))}
                placeholder="0,00"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
              />
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">Cor na agenda</label>
            <div className="flex gap-2 flex-wrap">
              {SERVICE_TYPE_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    form.color === c ? 'ring-2 ring-offset-2 ring-gray-500 scale-110' : 'hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={cancel} className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800">
              <X size={14} /> Cancelar
            </button>
            <button
              onClick={submit}
              disabled={!form.name.trim() || create.isPending || update.isPending}
              className="flex items-center gap-1 px-4 py-1.5 text-sm text-white rounded-xl disabled:opacity-40 transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
            >
              <Check size={14} /> Salvar
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>
      ) : services.length === 0 && !showForm ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl py-10 text-center space-y-3">
          <CurrencyDollar size={28} className="mx-auto text-gray-300" />
          <div>
            <p className="text-sm text-gray-500 font-medium">Nenhum serviço cadastrado</p>
            <p className="text-xs text-gray-400 mt-0.5">Crie o primeiro serviço ou use o padrão abaixo</p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={async () => {
                try {
                  await create.mutateAsync({ name: 'Atendimento geral', durationMinutes: 30, priceCents: null, color: SERVICE_TYPE_COLORS[0], active: true })
                  toast.success('Serviço padrão criado')
                } catch { toast.error('Erro ao criar serviço') }
              }}
              disabled={create.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              <Check size={14} /> Criar "Atendimento geral"
            </button>
            <button onClick={openNew} className="text-sm text-[#006970] hover:underline font-medium">
              Personalizar →
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {services.map(s => (
            <li
              key={s.id}
              className={`flex items-center gap-3 px-4 py-3 bg-white border rounded-xl transition-opacity ${
                s.active ? 'border-gray-200' : 'border-gray-100 opacity-50'
              }`}
            >
              {/* Color dot */}
              <span
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{s.name}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {s.durationMinutes} min
                  </span>
                  {s.priceCents != null && (
                    <span className="flex items-center gap-1">
                      <CurrencyDollar size={11} /> {formatBRL(s.priceCents)}
                    </span>
                  )}
                  {s.priceCents == null && (
                    <span className="text-gray-300">valor flexível</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleActive(s)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    s.active
                      ? 'border-green-200 text-green-600 hover:bg-green-50'
                      : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                  }`}
                >
                  {s.active ? 'Ativo' : 'Inativo'}
                </button>
                <button
                  onClick={() => openEdit(s)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-[#006970] hover:bg-teal-50 transition"
                >
                  <PencilSimple size={14} />
                </button>
                <button
                  onClick={() => handleDelete(s)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                >
                  <Trash size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Excluir tipo de consulta"
        description={`Excluir "${confirmDelete?.name}"? Consultas já agendadas com este serviço não serão afetadas.`}
        confirmLabel="Excluir"
        danger
        onConfirm={executeDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
