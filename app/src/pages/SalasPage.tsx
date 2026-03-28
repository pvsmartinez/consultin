import SalasTab from '../pages-v1/settings/SalasTab'

export default function SalasPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-[28px] bg-white/90 border border-gray-200/80 shadow-sm px-6 py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0ea5b0] mb-2">
          Módulo Salas
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">Salas</h1>
        <p className="text-sm text-gray-500">
          Gerencie as salas da sua clínica e configure os horários de disponibilidade de cada uma.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SalasTab />
      </div>
    </div>
  )
}
