import { useState } from 'react'
import { X, Check, PencilSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useRooms, useUpdateRoom } from '../../hooks/useRooms'
import RoomAvailabilityEditor from '../availability/RoomAvailabilityEditor'

const ROOM_COLORS = [
  '#6366f1', '#0d9488', '#22c55e', '#f59e0b', '#ef4444',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b',
]

interface Props {
  roomId: string
  onClose: () => void
}

export default function RoomScheduleDrawer({ roomId, onClose }: Props) {
  const { data: rooms = [] } = useRooms()
  const updateRoom = useUpdateRoom()
  const room = rooms.find(r => r.id === roomId)

  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(room?.name ?? '')
  const [color, setColor] = useState(room?.color ?? ROOM_COLORS[0])

  if (!room) return null

  async function saveName() {
    if (!name.trim() || !room) return
    try {
      await updateRoom.mutateAsync({ ...room, name: name.trim(), color })
      toast.success('Sala atualizada')
      setEditingName(false)
    } catch {
      toast.error('Erro ao salvar')
    }
  }

  function cancelEdit() {
    setName(room?.name ?? '')
    setColor(room?.color ?? ROOM_COLORS[0])
    setEditingName(false)
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-full flex-col overflow-hidden bg-white shadow-2xl sm:w-96">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: room.color }}
            />
            <span className="text-sm font-semibold text-gray-800 truncate">{room.name}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setEditingName(v => !v)}
              title="Editar nome e cor"
              className="rounded-lg p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <PencilSimple size={15} />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Edit name/color */}
        {editingName && (
          <div className="flex-shrink-0 space-y-3 border-b border-gray-100 bg-gray-50 px-4 py-3 sm:px-5">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Nome da sala</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelEdit() }}
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Cor</label>
              <div className="flex flex-wrap gap-2">
                {ROOM_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                    style={{
                      background: c,
                      outline: color === c ? `2px solid ${c}` : '2px solid transparent',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={saveName}
                disabled={updateRoom.isPending}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
              >
                <Check size={12} /> Salvar
              </button>
              <button
                onClick={cancelEdit}
                className="min-h-11 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-100"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Availability editor */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Horários disponíveis
          </p>
          <RoomAvailabilityEditor roomId={roomId} />
        </div>
      </div>
    </>
  )
}
