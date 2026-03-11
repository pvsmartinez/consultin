import { useState } from 'react'
import { Plus, Trash, PencilSimple, Check, X, Clock } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useRooms, useCreateRoom, useUpdateRoom, useDeleteRoom } from '../../hooks/useRooms'
import RoomAvailabilityEditor from '../../components/availability/RoomAvailabilityEditor'
import type { ClinicRoom } from '../../types'

const ROOM_COLORS = [
  '#6366f1', '#0d9488', '#22c55e', '#f59e0b', '#ef4444',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b',
]

export default function SalasTab() {
  const { data: rooms = [], isLoading } = useRooms()
  const createRoom = useCreateRoom()
  const updateRoom = useUpdateRoom()
  const deleteRoom = useDeleteRoom()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ClinicRoom | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(ROOM_COLORS[0])
  const [expandedAvail, setExpandedAvail] = useState<string | null>(null)

  function openNew() { setEditing(null); setName(''); setColor(ROOM_COLORS[0]); setShowForm(true) }
  function openEdit(r: ClinicRoom) { setEditing(r); setName(r.name); setColor(r.color); setShowForm(true) }

  async function submit() {
    if (!name.trim()) return
    try {
      if (editing) {
        await updateRoom.mutateAsync({ id: editing.id, name: name.trim(), color, active: editing.active })
        toast.success('Sala atualizada')
      } else {
        await createRoom.mutateAsync({ name: name.trim(), color })
        toast.success('Sala criada')
      }
      setShowForm(false)
    } catch { toast.error('Erro ao salvar sala') }
  }

  async function toggleActive(r: ClinicRoom) {
    try {
      await updateRoom.mutateAsync({ ...r, active: !r.active })
      toast.success(r.active ? 'Sala desativada' : 'Sala ativada')
    } catch { toast.error('Erro') }
  }

  async function remove(r: ClinicRoom) {
    if (!confirm(`Excluir "${r.name}"? Consultas associadas perderão o vínculo com a sala.`)) return
    try { await deleteRoom.mutateAsync(r.id); toast.success('Sala excluída') }
    catch { toast.error('Não é possível excluir — sala possui consultas vinculadas') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Cadastre as salas ou espaços onde os atendimentos acontecem. O sistema impedirá dois agendamentos na mesma sala ao mesmo tempo.
        </p>
        <button onClick={openNew}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0 ml-4">
          <Plus size={14} /> Nova sala
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">{editing ? 'Editar sala' : 'Nova sala'}</p>
          <div className="flex gap-3">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Consultório 1, Sala de Estética..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Cor na agenda</p>
            <div className="flex gap-2 flex-wrap">
              {ROOM_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-gray-500 scale-110' : 'hover:scale-105'}`} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800">
              <X size={14} /> Cancelar
            </button>
            <button onClick={submit} disabled={!name.trim()}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              <Check size={14} /> Salvar
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>
      ) : rooms.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl py-10 text-center space-y-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 mx-auto flex items-center justify-center">
            <Check size={16} className="text-gray-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Nenhuma sala cadastrada</p>
            <p className="text-xs text-gray-400 mt-0.5">Crie a primeira sala ou use o padrão abaixo</p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={async () => {
                try {
                  await createRoom.mutateAsync({ name: 'Sala 1', color: ROOM_COLORS[0] })
                  toast.success('Sala padrão criada')
                } catch { toast.error('Erro ao criar sala') }
              }}
              disabled={createRoom.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              <Check size={14} /> Criar "Sala 1"
            </button>
            <button onClick={openNew} className="text-sm text-blue-600 hover:underline">
              Personalizar →
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {rooms.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Room header row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                <p className={`flex-1 text-sm font-medium ${r.active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{r.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  {r.active ? 'Ativa' : 'Inativa'}
                </span>
                {/* Availability toggle */}
                <button
                  onClick={() => setExpandedAvail(prev => prev === r.id ? null : r.id)}
                  title="Configurar horários da sala"
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
                    expandedAvail === r.id
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  <Clock size={12} />
                  <span className="hidden sm:inline">Horários</span>
                </button>
                <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-gray-700 p-1"><PencilSimple size={15} /></button>
                <button onClick={() => toggleActive(r)} className="text-gray-400 hover:text-gray-700 p-1 text-xs border border-gray-200 rounded px-2">
                  {r.active ? 'Desativar' : 'Ativar'}
                </button>
                <button onClick={() => remove(r)} className="text-red-400 hover:text-red-600 p-1"><Trash size={15} /></button>
              </div>

              {/* Collapsible availability editor */}
              {expandedAvail === r.id && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                  <RoomAvailabilityEditor roomId={r.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
