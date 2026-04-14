import { useState } from 'react'
import { format, startOfMonth, endOfMonth, subMonths, parseISO, eachDayOfInterval } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from 'recharts'
import {
  FilePdf, FileCsv, DownloadSimple, Users, UserCircle,
} from '@phosphor-icons/react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useAdministrativeSnapshots, useReportData } from '../hooks/useRelatorios'
import { useProfessionals } from '../hooks/useProfessionals'
import { formatBRL, formatBRLReais } from '../utils/currency'
import { APPOINTMENT_STATUS_LABELS, SEX_LABELS } from '../types'
import {
  exportAppointmentsCSV,
  exportPatientsCSV,
  exportProfessionalsCSV,
  exportFinanceCSV,
} from '../utils/exportCSV'
import { toast } from 'sonner'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'

// ─── PDF export ──────────────────────────────────────────────────────────────

function exportPDF(
  monthLabel: string,
  rows: Array<{
    date: string; patient: string; professional: string; status: string;
    charge: string; paid: string
  }>,
  totals: { count: number; charged: number; received: number }
) {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(`Relatório — ${monthLabel}`, 14, 18)

  autoTable(doc, {
    startY: 26,
    head: [['Data', 'Paciente', 'Profissional', 'Status', 'Valor', 'Pago']],
    body: rows.map(r => [r.date, r.patient, r.professional, r.status, r.charge, r.paid]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] },
  })

  // Summary after table
  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  doc.setFontSize(10)
  doc.text(`Total de consultas: ${totals.count}`, 14, finalY)
  doc.text(`Total a cobrar: ${formatBRL(totals.charged)}`, 14, finalY + 6)
  doc.text(`Total recebido: ${formatBRL(totals.received)}`, 14, finalY + 12)

  doc.save(`relatorio-${format(new Date(), 'yyyy-MM')}.pdf`)
}

// ─── Component ────────────────────────────────────────────────────────────────

type RawRow = Record<string, unknown>

interface RelatoriosPageProps {
  /** When provided, the parent controls the month and the internal selector is hidden. */
  month?: Date
  hideHeader?: boolean
}

export default function RelatoriosPage({ month: controlledMonth, hideHeader = false }: RelatoriosPageProps = {}) {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId
  const [internalMonth, setInternalMonth] = useState(new Date())
  const month = controlledMonth ?? internalMonth
  const setMonth = (m: Date) => { if (!controlledMonth) setInternalMonth(m) }
  const [professionalId, setProfessionalId] = useState('')
  const [exportingPatients, setExportingPatients] = useState(false)
  const [exportingProfessionals, setExportingProfessionals] = useState(false)
  const [exportingFinance, setExportingFinance] = useState(false)

  const { data = [], isLoading } = useReportData(month, professionalId)
  const { data: adminSnapshot, isLoading: loadingAdmin } = useAdministrativeSnapshots(month, professionalId)
  const { data: allProfessionals = [] } = useProfessionals()
  const professionals = allProfessionals.filter(p => p.active)

  const monthLabel = format(month, "MMMM 'de' yyyy", { locale: ptBR })
  const fileMonth  = format(month, 'yyyy-MM')

  // Build daily consultation count chart data
  const days = eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  })
  const countsPerDay = days.map(day => {
    const key = format(day, 'dd/MM')
    const count = (data as RawRow[]).filter(r => {
      const d = format(parseISO(r.starts_at as string), 'dd/MM')
      return d === key && r.status !== 'cancelled'
    }).length
    return { day: key, consultas: count }
  })

  // Revenue per day
  const revenuePerDay = days.map(day => {
    const key = format(day, 'dd/MM')
    const total = (data as RawRow[])
      .filter(r => format(parseISO(r.starts_at as string), 'dd/MM') === key && r.status === 'completed')
      .reduce((s, r) => s + ((r.paid_amount_cents as number) ?? 0), 0)
    return { day: key, faturamento: total / 100 }
  })

  // Status breakdown
  const statusBreakdown = Object.entries(APPOINTMENT_STATUS_LABELS).map(([key, label]) => ({
    status: label,
    count: (data as RawRow[]).filter(r => r.status === key).length,
  })).filter(r => r.count > 0)

  // Totals
  const totalCharged = (data as RawRow[]).reduce((s, r) => s + ((r.charge_amount_cents as number) ?? 0), 0)
  const totalReceived = (data as RawRow[]).reduce((s, r) => s + ((r.paid_amount_cents as number) ?? 0), 0)
  const completedCount = (data as RawRow[]).filter(r => r.status === 'completed').length

  const handleExport = () => {
    const rows = (data as RawRow[]).map(r => ({
      date: format(parseISO(r.starts_at as string), 'dd/MM/yyyy HH:mm'),
      patient: (r.patient as { name: string } | null)?.name ?? '—',
      professional: (r.professional as { name: string } | null)?.name ?? '—',
      status: APPOINTMENT_STATUS_LABELS[r.status as keyof typeof APPOINTMENT_STATUS_LABELS] ?? String(r.status),
      charge: formatBRL((r.charge_amount_cents as number) ?? null),
      paid: formatBRL((r.paid_amount_cents as number) ?? null),
    }))
    exportPDF(monthLabel, rows, { count: completedCount, charged: totalCharged, received: totalReceived })
  }

  // ── Build appointment export rows ──
  function buildExportRows() {
    return (data as RawRow[]).map(r => ({
      date:         format(parseISO(r.starts_at as string), 'dd/MM/yyyy HH:mm'),
      patient:      (r.patient as { name: string } | null)?.name ?? '—',
      professional: (r.professional as { name: string } | null)?.name ?? '—',
      status:       APPOINTMENT_STATUS_LABELS[r.status as keyof typeof APPOINTMENT_STATUS_LABELS] ?? String(r.status),
      notes:        (r.notes as string | null) ?? '',
      charge:       formatBRL((r.charge_amount_cents as number) ?? null),
      paid:         formatBRL((r.paid_amount_cents as number) ?? null),
    }))
  }

  function handleExportCSV() {
    exportAppointmentsCSV(buildExportRows(), `consultas-${fileMonth}.csv`)
  }

  // ── Finance export ──
  async function handleExportFinance() {
    setExportingFinance(true)
    try {
      const monthStart = startOfMonth(month).toISOString()
      const monthEnd   = endOfMonth(month).toISOString()
      let q = supabase
        .from('appointments')
        .select(`
          starts_at, status, charge_amount_cents, paid_amount_cents, paid_at,
          patient:patients(name), professional:professionals(name)
        `)
        .eq('clinic_id', clinicId!)
        .gte('starts_at', monthStart)
        .lte('starts_at', monthEnd)
        .order('starts_at')
      if (professionalId) q = q.eq('professional_id', professionalId)
      const { data: rows, error } = await q
      if (error) throw error
      exportFinanceCSV(
        (rows ?? []).map(r => ({
          date:         format(parseISO(r.starts_at), 'dd/MM/yyyy HH:mm'),
          patient:      (r.patient as { name: string } | null)?.name ?? '—',
          professional: (r.professional as { name: string } | null)?.name ?? '—',
          chargeAmount: formatBRL((r.charge_amount_cents as number | null) ?? null),
          paidAmount:   formatBRL((r.paid_amount_cents as number | null) ?? null),
          paidAt:       r.paid_at ? format(parseISO(r.paid_at), 'dd/MM/yyyy') : '—',
          status:       APPOINTMENT_STATUS_LABELS[r.status as keyof typeof APPOINTMENT_STATUS_LABELS] ?? r.status,
        })),
        `financeiro-${fileMonth}.csv`,
      )
    } catch {
      toast.error('Erro ao exportar financeiro')
    } finally {
      setExportingFinance(false)
    }
  }

  // ── Patients export ──
  async function handleExportPatients() {
    setExportingPatients(true)
    try {
      const { data: patients, error } = await supabase.from('patients').select('*').eq('clinic_id', clinicId!).order('name')
      if (error) throw error
      exportPatientsCSV(
        (patients ?? []).map(p => ({
          name:      p.name ?? '',
          cpf:       p.cpf ?? '',
          rg:        p.rg ?? '',
          birthDate: p.birth_date ?? '',
          sex:       p.sex ? (SEX_LABELS[p.sex as keyof typeof SEX_LABELS] ?? p.sex) : '',
          phone:     p.phone ?? '',
          email:     p.email ?? '',
          address:   [p.address_street, p.address_number, p.address_complement].filter(Boolean).join(', '),
          city:      p.address_city ?? '',
          state:     p.address_state ?? '',
          zip:       p.address_zip ?? '',
          notes:     p.notes ?? '',
          createdAt: p.created_at ? format(parseISO(p.created_at), 'dd/MM/yyyy') : '',
        })),
        'pacientes.csv',
      )
      toast.success(`${patients?.length ?? 0} pacientes exportados`)
    } catch {
      toast.error('Erro ao exportar pacientes')
    } finally {
      setExportingPatients(false)
    }
  }

  // ── Professionals export ──
  async function handleExportProfessionals() {
    setExportingProfessionals(true)
    try {
      const { data: profs, error } = await supabase.from('professionals').select('*').eq('clinic_id', clinicId!).order('name')
      if (error) throw error
      exportProfessionalsCSV(
        (profs ?? []).map(p => ({
          name:      p.name ?? '',
          specialty: p.specialty ?? '',
          councilId: p.council_id ?? '',
          phone:     p.phone ?? '',
          email:     p.email ?? '',
          active:    p.active ? 'Sim' : 'Não',
          createdAt: p.created_at ? format(parseISO(p.created_at), 'dd/MM/yyyy') : '',
        })),
        'profissionais.csv',
      )
      toast.success(`${profs?.length ?? 0} profissionais exportados`)
    } catch {
      toast.error('Erro ao exportar profissionais')
    } finally {
      setExportingProfessionals(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-3 ${hideHeader ? 'mb-4' : 'mb-6'}`}>
        {!hideHeader && <h1 className="text-xl font-semibold text-gray-800">Relatórios</h1>}

        <div className="flex flex-wrap items-center gap-2">
          {/* Month selector — hidden when parent controls the month */}
          {!controlledMonth && (
            <select
              value={format(month, 'yyyy-MM')}
              onChange={e => {
                const [y, m] = e.target.value.split('-').map(Number)
                setMonth(new Date(y, m - 1, 1))
              }}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
            >
              {Array.from({ length: 12 }, (_, i) => subMonths(new Date(), i)).map(d => (
                <option key={format(d, 'yyyy-MM')} value={format(d, 'yyyy-MM')}>
                  {format(d, "MMMM 'de' yyyy", { locale: ptBR })}
                </option>
              ))}
            </select>
          )}

          {/* Professional filter */}
          <select
            value={professionalId}
            onChange={e => setProfessionalId(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
          >
            <option value="">Todos os profissionais</option>
            {professionals.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* PDF export */}
          <button
            onClick={handleExport}
            disabled={isLoading || data.length === 0}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            <FilePdf size={16} />
            PDF
          </button>

          {/* CSV appointments */}
          <button
            onClick={handleExportCSV}
            disabled={isLoading || data.length === 0}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            <FileCsv size={16} />
            CSV Consultas
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-400 text-sm py-20">Carregando...</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Painel rápido
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Mesma lógica usada pelo bot administrativo no WhatsApp.
                  {professionalId ? ' Painel filtrado para o profissional selecionado.' : ''}
                </p>
              </div>
            </div>

            {loadingAdmin || !adminSnapshot ? (
              <p className="text-sm text-slate-400">Carregando painel rápido...</p>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {[adminSnapshot.today, adminSnapshot.week, adminSnapshot.month].map(period => (
                  <div key={period.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 mb-3">
                      {period.label}
                    </p>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <MiniStat label="Consultas" value={String(period.totalAppointments)} />
                      <MiniStat label="Pacientes únicos" value={String(period.uniquePatients)} />
                      <MiniStat label="Novos pacientes" value={String(period.newPatients)} />
                      <MiniStat label="Concluídas" value={String(period.completedCount)} />
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 space-y-1">
                      <p>Cobrado: <strong className="text-slate-800">{formatBRL(period.totalChargedCents)}</strong></p>
                      <p>Recebido: <strong className="text-slate-800">{formatBRL(period.totalPaidCents)}</strong></p>
                      <p>
                        Profissional destaque:{' '}
                        <strong className="text-slate-800">
                          {period.topProfessionalName
                            ? `${period.topProfessionalName} (${period.topProfessionalCount})`
                            : 'Sem destaque ainda'}
                        </strong>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Consultas concluídas', value: String(completedCount) },
              { label: 'Status distribu.',     value: `${statusBreakdown.length} tipos` },
              { label: 'Total cobrado',        value: formatBRL(totalCharged) },
              { label: 'Total recebido',       value: formatBRL(totalReceived) },
            ].map(c => (
              <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">{c.label}</p>
                <p className="text-lg font-semibold text-gray-800">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Consultas por dia */}
          <ChartCard title="Consultas por dia">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={countsPerDay} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="consultas" fill="#0d9488" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Faturamento diário */}
          <ChartCard title="Faturamento diário (R$)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenuePerDay} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number | undefined) => v != null ? formatBRLReais(v) : ''} />
                <Line type="monotone" dataKey="faturamento" stroke="#0d9488" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Status breakdown */}
          {statusBreakdown.length > 0 && (
            <ChartCard title="Consultas por status">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={statusBreakdown} layout="vertical" margin={{ left: 60, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="status" type="category" tick={{ fontSize: 11 }} width={55} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* ── Exportações de dados ─────────────────────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Exportar dados
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ExportCard
                icon={<DownloadSimple size={22} className="text-emerald-600" />}
                title="Financeiro"
                description={`Pagamentos de ${monthLabel}`}
                loading={exportingFinance}
                onClick={handleExportFinance}
                color="emerald"
              />
              <ExportCard
                icon={<Users size={22} className="text-[#0ea5b0]" />}
                title="Pacientes"
                description="Todos os pacientes cadastrados"
                loading={exportingPatients}
                onClick={handleExportPatients}
                color="blue"
              />
              <ExportCard
                icon={<UserCircle size={22} className="text-violet-600" />}
                title="Profissionais"
                description="Todos os profissionais cadastrados"
                loading={exportingProfessionals}
                onClick={handleExportProfessionals}
                color="violet"
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Arquivos CSV compatíveis com Excel, Google Sheets e outros sistemas.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ChartCard ────────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-600 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-base font-semibold text-slate-800 mt-0.5">{value}</p>
    </div>
  )
}

// ─── ExportCard ───────────────────────────────────────────────────────────────

type ColorVariant = 'emerald' | 'blue' | 'violet'

const btnColors: Record<ColorVariant, string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-700',
  blue:    'bg-[#0ea5b0] hover:bg-[#006970]',
  violet:  'bg-violet-600 hover:bg-violet-700',
}

function ExportCard({
  icon, title, description, loading, onClick, color,
}: {
  icon: React.ReactNode
  title: string
  description: string
  loading: boolean
  onClick: () => void
  color: ColorVariant
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <button
        onClick={onClick}
        disabled={loading}
        className={`flex items-center justify-center gap-2 text-white text-sm font-medium py-1.5 rounded-lg transition disabled:opacity-50 ${btnColors[color]}`}
      >
        <FileCsv size={15} />
        {loading ? 'Exportando...' : 'Exportar CSV'}
      </button>
    </div>
  )
}
