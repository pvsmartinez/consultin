import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlass, Plus, User, UploadSimple, X } from '@phosphor-icons/react'
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Pacientes</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            <UploadSimple size={16} />
            Importar CSV
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            <Plus size={16} />
            Novo paciente
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, CPF ou telefone..."
          className="w-full border border-gray-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Limpar busca"
          >
            <X size={14} />
          </button>
        )}
      </div>

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
                  className={`cursor-pointer hover:bg-blue-50 transition ${i > 0 ? 'border-t border-gray-100' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <User size={14} className="text-blue-600" />
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
                className="text-xs text-gray-600 disabled:text-gray-300 hover:text-blue-600 disabled:cursor-not-allowed transition-colors"
              >← Anterior</button>
              <span className="text-xs text-gray-500">Pág. {page + 1} / {pageCount}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= pageCount - 1}
                className="text-xs text-gray-600 disabled:text-gray-300 hover:text-blue-600 disabled:cursor-not-allowed transition-colors"
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
