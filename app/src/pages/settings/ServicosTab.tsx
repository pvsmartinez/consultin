import { useState, useEffect } from 'react'
import { Plus, PencilSimple, Trash, Check, X, CurrencyDollar, Clock } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useServiceTypes, useCreateServiceType, useUpdateServiceType, useDeleteServiceType } from '../../hooks/useServiceTypes'
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

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ServiceType | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)

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

  async function handleDelete(s: ServiceType) {
    if (!confirm(`Excluir "${s.name}"? Consultas já agendadas com este serviço não serão afetadas.`)) return
    try {
      await remove.mutateAsync(s.id)
      toast.success('Serviço excluído')
    } catch {
      toast.error('Não é possível excluir — serviço com consultas vinculadas')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            Cadastre os tipos de atendimento da sua clínica — consulta inicial, retorno, avaliação, etc.
            A duração e o valor de cada serviço serão pré-preenchidos ao agendar.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0"
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    form.durationMinutes === d
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-600 hover:border-blue-400'
                  }`}
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
                className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="flex items-center gap-1 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
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
        <div className="border-2 border-dashed border-gray-200 rounded-xl py-10 text-center">
          <CurrencyDollar size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">Nenhum serviço cadastrado.</p>
          <p className="text-xs text-gray-300 mt-1">Clique em "Novo serviço" para começar.</p>
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
                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
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
    </div>
  )
}
