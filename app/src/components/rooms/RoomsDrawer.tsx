import { useState } from 'react'
import { X, Plus, PencilSimple, Check, Clock, Eye, EyeSlash, Trash } from '@phosphor-icons/react'
import ConfirmDialog from '../ui/ConfirmDialog'
import { toast } from 'sonner'
import { useRooms, useCreateRoom, useUpdateRoom, useDeleteRoom } from '../../hooks/useRooms'
import RoomAvailabilityEditor from '../availability/RoomAvailabilityEditor'
import type { ClinicRoom } from '../../types'

const ROOM_COLORS = [
  '#6366f1', '#0d9488', '#22c55e', '#f59e0b', '#ef4444',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b',
]

interface Props {
  onClose: () => void
}

function RoomRow({ room }: { room: ClinicRoom }) {
  const updateRoom = useUpdateRoom()
  const deleteRoom = useDeleteRoom()

  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing]   = useState(false)
  const [name, setName]         = useState(room.name)
  const [color, setColor]       = useState(room.color)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save() {
    if (!name.trim()) return
    try {
      await updateRoom.mutateAsync({ ...room, name: name.trim(), color })
      toast.success('Sala atualizada')
      setEditing(false)
    } catch {
      toast.error('Erro ao salvar')
    }
  }

  async function toggleActive() {
    try {
      await updateRoom.mutateAsync({ ...room, active: !room.active })
      toast.success(room.active ? 'Sala desativada' : 'Sala ativada')
    } catch {
      toast.error('Erro')
    }
  }

  async function remove() {
    setConfirmDelete(true)
  }

  async function executeDelete() {
    try {
      await deleteRoom.mutateAsync(room.id)
      toast.success('Sala excluída')
    } catch {
      toast.error('Erro ao excluir')
    }
    setConfirmDelete(false)
  }

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${room.active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
      {/* Row header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: room.color }} />

        {editing ? (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setName(room.name); setColor(room.color) } }}
            autoFocus
            className="flex-1 text-sm border border-gray-200 rounded-xl px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-gray-800 truncate">{room.name}</span>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          {editing ? (
            <>
              <button onClick={save} disabled={updateRoom.isPending}
                className="p-1 rounded hover:bg-green-50 text-green-600 transition-colors">
                <Check size={14} />
              </button>
              <button onClick={() => { setEditing(false); setName(room.name); setColor(room.color) }}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors">
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} title="Editar nome"
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                <PencilSimple size={14} />
              </button>
              <button onClick={toggleActive} title={room.active ? 'Desativar sala' : 'Ativar sala'}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                {room.active ? <Eye size={14} /> : <EyeSlash size={14} />}
              </button>
              <button
                onClick={() => setExpanded(v => !v)}
                title="Horários da sala"
                className={`p-1 rounded transition-colors ${expanded ? 'bg-teal-50 text-[#006970]' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
              >
                <Clock size={14} />
              </button>
              <button onClick={remove} title="Excluir sala"
                className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                <Trash size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Color picker — shown while editing */}
      {editing && (
        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
          {ROOM_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-5 h-5 rounded-full transition-transform hover:scale-110"
              style={{
                background: c,
                outline: color === c ? `2px solid ${c}` : '2px solid transparent',
                outlineOffset: '2px',
              }}
            />
          ))}
        </div>
      )}

      {/* Availability editor */}
      {expanded && !editing && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2">
          <RoomAvailabilityEditor roomId={room.id} />
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir sala"
        description={`Excluir "${room.name}"? As consultas associadas perderão o vínculo com a sala.`}
        confirmLabel="Excluir"
        danger
        onConfirm={executeDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

export default function RoomsDrawer({ onClose }: Props) {
  const { data: rooms = [], isLoading } = useRooms()
  const createRoom = useCreateRoom()

  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName]         = useState('')
  const [newColor, setNewColor]       = useState(ROOM_COLORS[0])

  async function create() {
    if (!newName.trim()) return
    try {
      await createRoom.mutateAsync({ name: newName.trim(), color: newColor })
      toast.success('Sala criada')
      setNewName('')
      setNewColor(ROOM_COLORS[0])
      setShowNewForm(false)
    } catch {
      toast.error('Erro ao criar sala')
    }
  }

  const activeRooms   = rooms.filter(r => r.active)
  const inactiveRooms = rooms.filter(r => !r.active)

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-full flex-col overflow-hidden bg-white shadow-2xl sm:w-96">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-5">
          <span className="text-sm font-semibold text-gray-800">Salas</span>
          <button onClick={onClose}
            className="rounded-lg p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>

        {/* Room list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {isLoading && (
            <p className="text-xs text-gray-400 text-center py-4">Carregando...</p>
          )}

          {!isLoading && rooms.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">
              Nenhuma sala cadastrada ainda.<br />Crie sua primeira sala abaixo.
            </p>
          )}

          {activeRooms.map(room => <RoomRow key={room.id} room={room} />)}

          {inactiveRooms.length > 0 && (
            <>
              <p className="text-[11px] text-gray-400 uppercase tracking-wider pt-2">Inativas</p>
              {inactiveRooms.map(room => <RoomRow key={room.id} room={room} />)}
            </>
          )}
        </div>

        {/* New room form */}
        <div className="flex-shrink-0 space-y-3 border-t border-gray-100 px-4 py-4">
          {showNewForm ? (
            <>
              <p className="text-xs font-medium text-gray-500">Nova sala</p>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setShowNewForm(false) }}
                placeholder="Nome da sala (ex: Sala 1, Consultório A)"
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
              />
              <div className="flex flex-wrap gap-1.5">
                {ROOM_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                    style={{
                      background: c,
                      outline: newColor === c ? `2px solid ${c}` : '2px solid transparent',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={create}
                  disabled={!newName.trim() || createRoom.isPending}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
                >
                  <Check size={12} /> Criar sala
                </button>
                <button
                  onClick={() => setShowNewForm(false)}
                  className="min-h-11 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-100"
                >
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setShowNewForm(true)}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-teal-300 py-2.5 text-sm text-[#006970] transition-colors hover:border-[#0ea5b0] hover:bg-teal-50"
            >
              <Plus size={13} /> Nova sala
            </button>
          )}
        </div>
      </div>
    </>
  )
}
