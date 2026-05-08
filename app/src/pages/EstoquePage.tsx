import { useDeferredValue, useState } from 'react'
import {
  ArrowCircleDown,
  ArrowCircleUp,
  ArrowsClockwise,
  MagnifyingGlass,
  Package,
  PencilSimple,
  WarningCircle,
} from '@phosphor-icons/react'
import { Button } from '@pvsmartinez/shared/ui'
import { toast } from 'sonner'
import {
  INVENTORY_MOVEMENT_TYPE_COLORS,
  INVENTORY_MOVEMENT_TYPE_LABELS,
  INVENTORY_MOVEMENT_TYPE_OPTIONS,
  type InventoryMaterial,
  type InventoryMaterialInput,
  type InventoryMovementType,
} from '../types'
import {
  useCreateInventoryMaterial,
  useCreateInventoryMovement,
  useInventoryMaterials,
  useInventoryMovements,
  useUpdateInventoryMaterial,
} from '../hooks/useInventory'

type StockFilter = 'all' | 'ok' | 'low' | 'critical' | 'inactive'

interface MaterialFormState {
  id: string | null
  name: string
  category: string
  unit: string
  sku: string
  currentQuantity: string
  minQuantity: string
  idealQuantity: string
  notes: string
  active: boolean
}

interface MovementFormState {
  materialId: string
  movementType: InventoryMovementType
  quantity: string
  reason: string
  notes: string
}

const emptyMaterialForm = (): MaterialFormState => ({
  id: null,
  name: '',
  category: '',
  unit: 'un',
  sku: '',
  currentQuantity: '0',
  minQuantity: '0',
  idealQuantity: '',
  notes: '',
  active: true,
})

const emptyMovementForm = (): MovementFormState => ({
  materialId: '',
  movementType: 'out',
  quantity: '',
  reason: '',
  notes: '',
})

function formatQuantity(value: number, unit: string) {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)} ${unit}`
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getStockState(material: InventoryMaterial): Exclude<StockFilter, 'all'> {
  if (!material.active) return 'inactive'
  if (material.currentQuantity <= 0) return 'critical'
  if (material.currentQuantity <= material.minQuantity) return 'low'
  return 'ok'
}

function stockStateMeta(material: InventoryMaterial) {
  const state = getStockState(material)

  if (state === 'critical') {
    return { label: 'Crítico', classes: 'bg-rose-100 text-rose-700' }
  }
  if (state === 'low') {
    return { label: 'Baixo', classes: 'bg-amber-100 text-amber-700' }
  }
  if (state === 'inactive') {
    return { label: 'Inativo', classes: 'bg-slate-100 text-slate-600' }
  }
  return { label: 'OK', classes: 'bg-emerald-100 text-emerald-700' }
}

function materialToForm(material: InventoryMaterial): MaterialFormState {
  return {
    id: material.id,
    name: material.name,
    category: material.category ?? '',
    unit: material.unit,
    sku: material.sku ?? '',
    currentQuantity: String(material.currentQuantity),
    minQuantity: String(material.minQuantity),
    idealQuantity: material.idealQuantity == null ? '' : String(material.idealQuantity),
    notes: material.notes ?? '',
    active: material.active,
  }
}

export default function EstoquePage() {
  const { data: materials = [], isLoading: loadingMaterials } = useInventoryMaterials()
  const { data: movements = [], isLoading: loadingMovements } = useInventoryMovements(undefined, 18)
  const createMaterial = useCreateInventoryMaterial()
  const updateMaterial = useUpdateInventoryMaterial()
  const createMovement = useCreateInventoryMovement()

  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [materialForm, setMaterialForm] = useState<MaterialFormState>(emptyMaterialForm)
  const [movementForm, setMovementForm] = useState<MovementFormState>(emptyMovementForm)
  const [materialPanelOpen, setMaterialPanelOpen] = useState(false)
  const [movementPanelOpen, setMovementPanelOpen] = useState(false)

  const categories = Array.from(
    new Set(materials.map(material => material.category).filter((category): category is string => Boolean(category)))
  )

  const filteredMaterials = materials.filter(material => {
    const normalizedSearch = deferredSearch.trim().toLowerCase()
    const matchesSearch = normalizedSearch.length === 0
      || material.name.toLowerCase().includes(normalizedSearch)
      || (material.category ?? '').toLowerCase().includes(normalizedSearch)
      || (material.sku ?? '').toLowerCase().includes(normalizedSearch)

    const matchesStock = stockFilter === 'all' || getStockState(material) === stockFilter
    const matchesCategory = categoryFilter === 'all' || material.category === categoryFilter
    return matchesSearch && matchesStock && matchesCategory
  })

  const activeMaterials = materials.filter(material => material.active)
  const lowStockMaterials = activeMaterials.filter(material => getStockState(material) === 'low')
  const criticalMaterials = activeMaterials.filter(material => getStockState(material) === 'critical')
  const todayMovements = movements.filter(movement => {
    const movementDate = new Date(movement.createdAt)
    const now = new Date()
    return movementDate.toDateString() === now.toDateString()
  })

  function openNewMaterialForm() {
    setMaterialForm(emptyMaterialForm())
    setMaterialPanelOpen(true)
  }

  function openEditMaterialForm(material: InventoryMaterial) {
    setMaterialForm(materialToForm(material))
    setMaterialPanelOpen(true)
  }

  function openMovementForm(material?: InventoryMaterial, movementType: InventoryMovementType = 'out') {
    setMovementForm({
      materialId: material?.id ?? '',
      movementType,
      quantity: '',
      reason: '',
      notes: '',
    })
    setMovementPanelOpen(true)
  }

  async function handleSaveMaterial(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsedCurrentQuantity = Number(materialForm.currentQuantity || 0)
    const parsedMinQuantity = Number(materialForm.minQuantity || 0)
    const parsedIdealQuantity = materialForm.idealQuantity.trim() === '' ? null : Number(materialForm.idealQuantity)

    const sharedPayload = {
      name: materialForm.name.trim(),
      category: materialForm.category.trim() || null,
      unit: materialForm.unit.trim() || 'un',
      sku: materialForm.sku.trim() || null,
      minQuantity: parsedMinQuantity,
      idealQuantity: parsedIdealQuantity,
      notes: materialForm.notes.trim() || null,
      active: materialForm.active,
      metadata: {},
    }

    if (!sharedPayload.name) {
      toast.error('Informe o nome do material.')
      return
    }

    if (Number.isNaN(parsedCurrentQuantity) || Number.isNaN(parsedMinQuantity) || parsedCurrentQuantity < 0 || parsedMinQuantity < 0) {
      toast.error('Revise as quantidades do material.')
      return
    }

    if (parsedIdealQuantity != null && (Number.isNaN(parsedIdealQuantity) || parsedIdealQuantity < 0)) {
      toast.error('A quantidade ideal precisa ser zero ou maior.')
      return
    }

    try {
      if (materialForm.id) {
        await updateMaterial.mutateAsync({ id: materialForm.id, ...sharedPayload })
        toast.success('Material atualizado.')
      } else {
        const createPayload: InventoryMaterialInput = {
          ...sharedPayload,
          currentQuantity: parsedCurrentQuantity,
        }
        await createMaterial.mutateAsync(createPayload)
        toast.success('Material cadastrado.')
      }
      setMaterialForm(emptyMaterialForm())
      setMaterialPanelOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o material.')
    }
  }

  async function handleSaveMovement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const quantity = Number(movementForm.quantity)
    if (!movementForm.materialId) {
      toast.error('Escolha o material para registrar a movimentação.')
      return
    }
    if (Number.isNaN(quantity) || quantity === 0) {
      toast.error('Informe uma quantidade válida.')
      return
    }
    if (movementForm.movementType !== 'adjustment' && quantity < 0) {
      toast.error('Use quantidade positiva para entrada ou uso.')
      return
    }

    try {
      await createMovement.mutateAsync({
        materialId: movementForm.materialId,
        movementType: movementForm.movementType,
        quantity,
        reason: movementForm.reason.trim() || null,
        notes: movementForm.notes.trim() || null,
      })
      toast.success('Movimentação registrada.')
      setMovementForm(emptyMovementForm())
      setMovementPanelOpen(false)
    } catch (error) {
      const message = error instanceof Error && error.message.includes('inventory_negative_stock')
        ? 'Essa saída deixaria o estoque negativo.'
        : error instanceof Error
          ? error.message
          : 'Não foi possível registrar a movimentação.'
      toast.error(message)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-teal-100 bg-gradient-to-br from-[#ecfeff] via-white to-[#f8fafc] p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-700">
              <Package size={14} weight="fill" />
              Módulo de estoque
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Estoque de materiais</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Cadastre materiais, registre uso no dia a dia e acompanhe rápido o que está ficando abaixo do mínimo.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => openMovementForm(undefined, 'out')}>
              Registrar uso
            </Button>
            <Button variant="primary" onClick={openNewMaterialForm}>
              Novo material
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Materiais ativos" value={String(activeMaterials.length)} helper="Itens disponíveis para uso" />
          <SummaryCard label="Estoque baixo" value={String(lowStockMaterials.length)} helper="Abaixo ou no mínimo" tone="warning" />
          <SummaryCard label="Críticos" value={String(criticalMaterials.length)} helper="Sem saldo disponível" tone="danger" />
          <SummaryCard label="Movimentações hoje" value={String(todayMovements.length)} helper="Entradas, usos e ajustes" />
        </div>
      </section>

      {(criticalMaterials.length > 0 || lowStockMaterials.length > 0) && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <WarningCircle size={20} className="mt-0.5 flex-shrink-0" weight="fill" />
            <div>
              <p className="font-semibold">Atenção no estoque</p>
              <p className="mt-1 text-amber-800">
                {criticalMaterials.length > 0
                  ? `${criticalMaterials.length} material(is) estão sem saldo.`
                  : `${lowStockMaterials.length} material(is) estão abaixo do mínimo.`}
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_380px]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
              <label className="relative block">
                <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Buscar por nome, categoria ou SKU"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:bg-white"
                />
              </label>

              <select
                value={stockFilter}
                onChange={event => setStockFilter(event.target.value as StockFilter)}
                className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:bg-white"
              >
                <option value="all">Todos os níveis</option>
                <option value="ok">Somente OK</option>
                <option value="low">Estoque baixo</option>
                <option value="critical">Crítico</option>
                <option value="inactive">Inativos</option>
              </select>

              <select
                value={categoryFilter}
                onChange={event => setCategoryFilter(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:bg-white"
              >
                <option value="all">Todas as categorias</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {loadingMaterials ? (
              <EmptyStateCard title="Carregando materiais" description="Buscando o estoque da clínica." />
            ) : filteredMaterials.length === 0 ? (
              <EmptyStateCard
                title="Nenhum material encontrado"
                description="Cadastre o primeiro item para começar a controlar entradas, uso e alerta de estoque baixo."
                action={<Button variant="primary" onClick={openNewMaterialForm}>Cadastrar material</Button>}
              />
            ) : (
              filteredMaterials.map(material => {
                const state = stockStateMeta(material)
                return (
                  <article key={material.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold text-slate-900">{material.name}</h2>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${state.classes}`}>
                            {state.label}
                          </span>
                          {material.category && (
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                              {material.category}
                            </span>
                          )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <MetricPill label="Saldo atual" value={formatQuantity(material.currentQuantity, material.unit)} />
                          <MetricPill label="Mínimo" value={formatQuantity(material.minQuantity, material.unit)} />
                          <MetricPill label="Ideal" value={material.idealQuantity == null ? 'Não definido' : formatQuantity(material.idealQuantity, material.unit)} />
                          <MetricPill label="SKU" value={material.sku ?? 'Sem SKU'} />
                        </div>

                        {material.notes && <p className="text-sm text-slate-600">{material.notes}</p>}
                      </div>

                      <div className="flex flex-wrap gap-2 lg:max-w-[260px] lg:justify-end">
                        <QuickActionButton icon={<ArrowCircleUp size={16} />} label="Entrada" onClick={() => openMovementForm(material, 'in')} />
                        <QuickActionButton icon={<ArrowCircleDown size={16} />} label="Uso" onClick={() => openMovementForm(material, 'out')} />
                        <QuickActionButton icon={<ArrowsClockwise size={16} />} label="Ajuste" onClick={() => openMovementForm(material, 'adjustment')} />
                        <QuickActionButton icon={<PencilSimple size={16} />} label="Editar" onClick={() => openEditMaterialForm(material)} />
                      </div>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </section>

        <aside className="space-y-4">
          {materialPanelOpen ? (
            <form onSubmit={handleSaveMaterial} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {materialForm.id ? 'Editar material' : 'Novo material'}
                  </h2>
                  <p className="text-sm text-slate-500">Defina saldo inicial, mínimo e como esse item será identificado.</p>
                </div>
                <button type="button" onClick={() => setMaterialPanelOpen(false)} className="text-sm font-medium text-slate-500 hover:text-slate-900">
                  Fechar
                </button>
              </div>

              <div className="space-y-3">
                <Field label="Nome">
                  <input value={materialForm.name} onChange={event => setMaterialForm(current => ({ ...current, name: event.target.value }))} className={inputClasses} placeholder="Ex: Resina A2" />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Categoria">
                    <input value={materialForm.category} onChange={event => setMaterialForm(current => ({ ...current, category: event.target.value }))} className={inputClasses} placeholder="Ex: Próteses, anestesia" />
                  </Field>
                  <Field label="Unidade">
                    <input value={materialForm.unit} onChange={event => setMaterialForm(current => ({ ...current, unit: event.target.value }))} className={inputClasses} placeholder="un, ml, caixa" />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Saldo inicial">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={materialForm.currentQuantity}
                      onChange={event => setMaterialForm(current => ({ ...current, currentQuantity: event.target.value }))}
                      className={inputClasses}
                      disabled={Boolean(materialForm.id)}
                    />
                  </Field>
                  <Field label="Estoque mínimo">
                    <input type="number" min="0" step="0.01" value={materialForm.minQuantity} onChange={event => setMaterialForm(current => ({ ...current, minQuantity: event.target.value }))} className={inputClasses} />
                  </Field>
                  <Field label="Estoque ideal">
                    <input type="number" min="0" step="0.01" value={materialForm.idealQuantity} onChange={event => setMaterialForm(current => ({ ...current, idealQuantity: event.target.value }))} className={inputClasses} placeholder="Opcional" />
                  </Field>
                </div>

                {materialForm.id && (
                  <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                    O saldo atual não é alterado por aqui. Para corrigir volume, use uma movimentação de ajuste.
                  </p>
                )}

                <Field label="SKU / referência">
                  <input value={materialForm.sku} onChange={event => setMaterialForm(current => ({ ...current, sku: event.target.value }))} className={inputClasses} placeholder="Opcional" />
                </Field>

                <Field label="Observações">
                  <textarea value={materialForm.notes} onChange={event => setMaterialForm(current => ({ ...current, notes: event.target.value }))} className={`${inputClasses} min-h-24 py-3`} placeholder="Ex: fornecedor, validade, uso mais comum" />
                </Field>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input type="checkbox" checked={materialForm.active} onChange={event => setMaterialForm(current => ({ ...current, active: event.target.checked }))} />
                  Material ativo para uso no dia a dia
                </label>
              </div>

              <div className="mt-4 flex gap-3">
                <Button type="submit" variant="primary" disabled={createMaterial.isPending || updateMaterial.isPending}>
                  {materialForm.id ? 'Salvar material' : 'Cadastrar material'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setMaterialForm(emptyMaterialForm())}>
                  Limpar
                </Button>
              </div>
            </form>
          ) : (
            <HintCard title="Cadastro rápido" description="Comece pelo material e depois registre entradas e usos sempre que algo for consumido." action={<Button variant="primary" onClick={openNewMaterialForm}>Novo material</Button>} />
          )}

          {movementPanelOpen ? (
            <form onSubmit={handleSaveMovement} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Registrar movimentação</h2>
                  <p className="text-sm text-slate-500">Uso para saídas normais, entrada para reposição e ajuste para correção manual.</p>
                </div>
                <button type="button" onClick={() => setMovementPanelOpen(false)} className="text-sm font-medium text-slate-500 hover:text-slate-900">
                  Fechar
                </button>
              </div>

              <div className="space-y-3">
                <Field label="Material">
                  <select value={movementForm.materialId} onChange={event => setMovementForm(current => ({ ...current, materialId: event.target.value }))} className={inputClasses}>
                    <option value="">Selecione um material</option>
                    {activeMaterials.map(material => (
                      <option key={material.id} value={material.id}>{material.name}</option>
                    ))}
                  </select>
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tipo">
                    <select value={movementForm.movementType} onChange={event => setMovementForm(current => ({ ...current, movementType: event.target.value as InventoryMovementType }))} className={inputClasses}>
                      {INVENTORY_MOVEMENT_TYPE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={movementForm.movementType === 'adjustment' ? 'Quantidade do ajuste (+/-)' : 'Quantidade'}>
                    <input type="number" step="0.01" value={movementForm.quantity} onChange={event => setMovementForm(current => ({ ...current, quantity: event.target.value }))} className={inputClasses} placeholder={movementForm.movementType === 'adjustment' ? 'Ex: -2 ou 3' : 'Ex: 1'} />
                  </Field>
                </div>

                <Field label="Motivo">
                  <input value={movementForm.reason} onChange={event => setMovementForm(current => ({ ...current, reason: event.target.value }))} className={inputClasses} placeholder="Ex: uso em atendimento, reposição, acerto de contagem" />
                </Field>

                <Field label="Observações">
                  <textarea value={movementForm.notes} onChange={event => setMovementForm(current => ({ ...current, notes: event.target.value }))} className={`${inputClasses} min-h-24 py-3`} placeholder="Opcional" />
                </Field>
              </div>

              <div className="mt-4 flex gap-3">
                <Button type="submit" variant="primary" disabled={createMovement.isPending}>Salvar movimentação</Button>
                <Button type="button" variant="secondary" onClick={() => setMovementForm(emptyMovementForm())}>Limpar</Button>
              </div>
            </form>
          ) : (
            <HintCard title="Baixa de uso" description="Quando a recepção ou o profissional usar um material, registre a saída em poucos cliques." action={<Button variant="secondary" onClick={() => openMovementForm(undefined, 'out')}>Registrar uso</Button>} />
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900">Últimas movimentações</h2>
              <p className="text-sm text-slate-500">Histórico recente do que entrou, saiu ou foi ajustado.</p>
            </div>

            <div className="space-y-3">
              {loadingMovements ? (
                <p className="text-sm text-slate-500">Carregando movimentações...</p>
              ) : movements.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma movimentação registrada ainda.</p>
              ) : (
                movements.map(movement => (
                  <div key={movement.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{movement.material?.name ?? 'Material removido'}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(movement.createdAt)}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${INVENTORY_MOVEMENT_TYPE_COLORS[movement.movementType]}`}>
                        {INVENTORY_MOVEMENT_TYPE_LABELS[movement.movementType]}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <span>Qtd.: <strong>{formatQuantity(movement.quantity, movement.material?.unit ?? 'un')}</strong></span>
                      <span>Saldo: <strong>{formatQuantity(movement.resultingQuantity, movement.material?.unit ?? 'un')}</strong></span>
                    </div>

                    {(movement.reason || movement.notes) && (
                      <p className="mt-2 text-xs leading-5 text-slate-600">{movement.reason ?? movement.notes}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

const inputClasses = 'h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:bg-white'

function SummaryCard({
  label,
  value,
  helper,
  tone = 'default',
}: {
  label: string
  value: string
  helper: string
  tone?: 'default' | 'warning' | 'danger'
}) {
  const toneClasses = tone === 'danger'
    ? 'border-rose-200 bg-rose-50'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50'
      : 'border-slate-200 bg-white/80'

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses}`}>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </div>
  )
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function QuickActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-teal-300 hover:text-teal-700">
      {icon}
      {label}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
    </label>
  )
}

function HintCard({ title, description, action }: { title: string; description: string; action: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-4">{action}</div>
    </section>
  )
}

function EmptyStateCard({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </section>
  )
}