import { useNavigate } from 'react-router-dom'
import { ShieldSlash, ArrowLeft } from '@phosphor-icons/react'

export default function AccessDeniedPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <ShieldSlash size={48} className="text-gray-300 mx-auto mb-4" />
        <h1 className="text-lg font-semibold text-gray-700 mb-2">Acesso negado</h1>
        <p className="text-sm text-gray-400 mb-6">
          Você não tem permissão para acessar esta página.
        </p>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-blue-600 hover:underline mx-auto"
        >
          <ArrowLeft size={15} />
          Voltar
        </button>
      </div>
    </div>
  )
}
