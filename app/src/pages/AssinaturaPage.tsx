import { useClinic } from '../hooks/useClinic'
import FinanceiroTab from './settings/FinanceiroTab'
import { CreditCard } from '@phosphor-icons/react'

export default function AssinaturaPage() {
  const { data: clinic, isLoading } = useClinic()

  if (isLoading) return <div className="text-sm text-gray-400 py-8 text-center">Carregando...</div>
  if (!clinic) return null

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-8">
        <CreditCard size={22} className="text-indigo-600" />
        <h1 className="text-lg font-semibold text-gray-800">Meu plano</h1>
      </div>
      <FinanceiroTab clinic={clinic} />
    </div>
  )
}
