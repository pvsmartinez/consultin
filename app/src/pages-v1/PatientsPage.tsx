import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { MagnifyingGlass, Plus, User, UploadSimple, X, Sliders } from '@phosphor-icons/react'
import PatientDrawer from '../components/patients/PatientDrawer'
import { usePatients, PATIENTS_PAGE_SIZE } from '../hooks/usePatients'
import { useDebounce } from '../hooks/useDebounce'
import { formatDate } from '../utils/date'
import { SEX_LABELS } from '../types'
import ImportModal from '../components/ImportModal'

export default function PatientsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [page, setPage] = useState(0)
  const debouncedSearch = useDebounce(search, 300)
  // Reset to first page whenever the search term changes
  useEffect(() => { setPage(0) }, [debouncedSearch])
  const { patients, loading, refetch, total, pageCount } = usePatients(debouncedSearch, page)
  const visibleCount = patients.length

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white/90 border border-gray-200/80 shadow-sm px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0ea5b0] mb-2">Gestão clínica</p>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Pacientes</h1>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-50 text-[#006970] border border-teal-100">
                  {total} cadastrados
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-2 max-w-2xl">
                Busque rápido por nome, CPF ou telefone e entre direto na ficha do paciente.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-gray-500">
              <div className="rounded-2xl bg-[#f8fafb] px-4 py-3 border border-gray-100 min-w-[160px]">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Nesta página</p>
                <p className="text-lg font-semibold text-gray-900">{visibleCount}</p>
              </div>
              <div className="rounded-2xl bg-[#f8fafb] px-4 py-3 border border-gray-100 min-w-[160px]">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Busca ativa</p>
                <p className="text-lg font-semibold text-gray-900">{search ? 'Sim' : 'Não'}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/configuracoes"
            state={{ tab: 'campos' }}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 text-sm px-3 py-2 rounded-lg transition"
            title="Personalizar campos do cadastro de pacientes"
          >
            <Sliders size={15} />
            <span className="hidden sm:inline">Personalizar campos</span>
          </Link>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            <UploadSimple size={16} />
            Importar CSV
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
          >
            <Plus size={16} />
            Novo paciente
          </button>
        </div>
        </div>

        <div className="relative mt-6 max-w-xl">
          <MagnifyingGlass size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF ou telefone..."
            className="w-full border border-gray-200 bg-[#f8fafb] rounded-2xl pl-11 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </section>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Carregando...</div>
        ) : patients.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {search ? 'Nenhum paciente encontrado.' : 'Nenhum paciente cadastrado ainda.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">CPF</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Nascimento</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">Sexo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Telefone</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p, i) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/pacientes/${p.id}`)}
                  className={`cursor-pointer hover:bg-teal-50 transition ${i > 0 ? 'border-t border-gray-100' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                        <User size={14} className="text-[#006970]" />
                      </div>
                      <span className="font-medium text-gray-800">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{p.cpf ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {p.birthDate ? formatDate(p.birthDate + 'T00:00:00') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                    {p.sex ? SEX_LABELS[p.sex] : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.phone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && total > 0 && (
        <div className="flex items-center justify-between mt-2 px-1">
          <p className="text-xs text-gray-400">
            {page * PATIENTS_PAGE_SIZE + 1}–{Math.min((page + 1) * PATIENTS_PAGE_SIZE, total)} de {total} paciente{total !== 1 ? 's' : ''}
          </p>
          {pageCount > 1 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={page === 0}
                className="text-xs text-gray-600 disabled:text-gray-300 hover:text-[#0ea5b0] disabled:cursor-not-allowed transition-colors"
              >← Anterior</button>
              <span className="text-xs text-gray-500">Pág. {page + 1} / {pageCount}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= pageCount - 1}
                className="text-xs text-gray-600 disabled:text-gray-300 hover:text-[#0ea5b0] disabled:cursor-not-allowed transition-colors"
              >Próxima →</button>
            </div>
          )}
        </div>
      )}

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => refetch()}
      />

      <PatientDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={(id) => { setDrawerOpen(false); navigate(`/pacientes/${id}`) }}
      />
    </div>
  )
}
