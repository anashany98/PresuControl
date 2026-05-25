import { useState, type ReactNode, useRef, useEffect, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { PageHeader } from '../components/PageHeader'
import { SkeletonCard } from '../components/Skeleton'
import { api, ESTADOS, euro, fmtDate, isoDate, type Presupuesto } from '../utils/api'
import { useAuth } from '../utils/auth'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../utils/toast'
import { PedidoSummaryPanel } from '../components/PedidoSummaryPanel'
import { Modal } from '../components/Modal'
import { KanbanCard } from '../components/KanbanCard'

const columns: string[] = ESTADOS.filter(s => s !== 'Pendiente de enviar')

type KanbanPayload = {
  action: string
  expected_version: number
  fecha_envio_cliente?: string
  fecha_aceptacion?: string
  proveedor?: string
  numero_pedido_proveedor?: string
  fecha_pedido_proveedor?: string
  plazo_proveedor?: string
  fecha_prevista_entrega?: string
  responsable_actual?: string
  siguiente_accion?: string
  fecha_limite_siguiente_accion?: string
  descripcion_incidencia?: string
  motivo_cancelacion_rechazo?: string
  fecha_cancelacion_rechazo?: string
}

const actionByStatus: Record<string, string | null> = {
  'Enviado al cliente': 'marcar_enviado',
  'Aceptado - pendiente pedido proveedor': 'marcar_aceptado',
  'Pedido proveedor realizado': 'crear_pedido_proveedor',
  'Plazo proveedor confirmado': 'confirmar_plazo',
  'En preparación / fabricación': null,
  'Entregado / cerrado': 'cerrar',
  'Cancelado / rechazado': 'cancelar',
  'Bloqueado / incidencia': 'bloquear',
}

function VirtualizedColumn({ columnData, columns, columnIndex, focusId, focusedCard, setFocusedCard, onPedidoClick, onTarget, onExpand, collapsed, onToggleCollapse, isDragOver, onDragOver, onDragLeave, savingId }: {
  columnData: Presupuesto[]
  columns: string[]
  columnIndex: number
  focusId: number | null
  focusedCard: { col: string; index: number } | null
  setFocusedCard: (fc: { col: string; index: number } | null) => void
  onPedidoClick: (p: Presupuesto) => void
  onTarget: (p: Presupuesto, status: string) => void
  onExpand: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  isDragOver?: boolean
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: () => void
  savingId?: number | null
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const currentStatus = columnData.length > 0 ? columnData[0].estado : columns[columnIndex] || ''
  const prevCol = columnIndex > 0 ? columns[columnIndex - 1] : undefined
  const nextCol = columnIndex < columns.length - 1 ? columns[columnIndex + 1] : undefined

  const rowVirtualizer = useVirtualizer({
    count: columnData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 3,
  })

  return (
    <div className={`kanban-col ${collapsed ? 'kanban-col-collapsed' : ''} ${isDragOver ? 'ring-2 ring-blue-300 bg-blue-50' : ''}`} ref={parentRef} style={collapsed ? { overflow: 'hidden', maxHeight: 'auto' } : { overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }} role="list" aria-label={`Columna ${currentStatus} — ${columnData.length} presupuestos`} onDragOver={onDragOver} onDragLeave={onDragLeave}>
      <div className="flex items-center justify-between mb-2">
        <h3 style={{ margin: 0 }}>{currentStatus} <span className="muted">{columnData.length}</span></h3>
        <button
          className="text-xs text-ink-muted hover:text-ink p-1"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expandir columna' : 'Colapsar columna'}
        >
          {collapsed ? '＋' : '－'}
        </button>
      </div>
      {!collapsed && (
        <>
          {columnData.length === 0 ? (
            <div className="text-xs text-ink-muted py-8 text-center">
              <div className="text-lg mb-2">✓</div>
              Sin presupuestos en esta fase
            </div>
          ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <KanbanCard
                  presupuesto={columnData[virtualRow.index]}
                  isFocused={focusId === columnData[virtualRow.index].id || (focusedCard?.col === currentStatus && focusedCard?.index === virtualRow.index)}
                  previousColumn={prevCol !== currentStatus ? prevCol : undefined}
                  nextColumn={nextCol !== currentStatus ? nextCol : undefined}
                  onMove={(p, targetStatus) => onTarget(p, targetStatus)}
                  onPedidoClick={onPedidoClick}
                  onFocus={() => setFocusedCard({ col: currentStatus, index: virtualRow.index })}
                  saving={savingId === columnData[virtualRow.index].id}
                />
              </div>
            ))}
          </div>
          )}
          {columnData.length >= 8 && (
            <button
              className="w-full text-xs text-brand hover:underline py-2 text-center border-t border-border mt-2"
              onClick={onExpand}
            >
              Ver +{columnData.length - 8} restantes
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function Kanban() {
  const [params] = useSearchParams()
  const [dragId, setDragId] = useState<number | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [target, setTarget] = useState<{ presupuesto: Presupuesto; status: string } | null>(null)
  const [pedidoPanel, setPedidoPanel] = useState<Presupuesto | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const focusId = Number(params.get('focus') || 0) || null

  const [columnData, setColumnData] = useState<Record<string, Presupuesto[]>>({})
  const [columnTotals, setColumnTotals] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [focusedCard, setFocusedCard] = useState<{ col: string; index: number } | null>(null)
  const [search, setSearch] = useState('')
  const [gestorFilter, setGestorFilter] = useState('')
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('kanbanCollapsedCols')
      return saved ? new Set(JSON.parse(saved)) : new Set<string>()
    } catch { return new Set<string>() }
  })

  const loadColumns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const results = await Promise.all(
        columns.map(async (col) => {
          const res = await api.get<{ items: Presupuesto[]; total: number }>(`/presupuestos?estado=${encodeURIComponent(col)}&sort=prioridad&page=1&page_size=8&ocultar_cerrados=false`)
          return { col, items: res.items, total: res.total }
        })
      )
      const data: Record<string, Presupuesto[]> = {}
      const totals: Record<string, number> = {}
      for (const r of results) {
        data[r.col] = r.items
        totals[r.col] = r.total
      }
      setColumnData(data)
      setColumnTotals(totals)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadColumns() }, [loadColumns])

  useEffect(() => {
    localStorage.setItem('kanbanCollapsedCols', JSON.stringify([...collapsedCols]))
  }, [collapsedCols])

  const expandColumn = useCallback(async (col: string) => {
    const currentItems = columnData[col] || []
    const currentPage = Math.floor(currentItems.length / 8) + 1
    try {
      const res = await api.get<{ items: Presupuesto[] }>(`/presupuestos?estado=${encodeURIComponent(col)}&sort=prioridad&page=${currentPage}&page_size=8&ocultar_cerrados=false`)
      setColumnData(prev => ({
        ...prev,
        [col]: [...(prev[col] || []), ...res.items],
      }))
    } catch (e) {
      toast.error('Error al cargar más presupuestos')
    }
  }, [columnData])

  const reload = useCallback(() => {
    loadColumns()
  }, [loadColumns])

  const filteredColumnData = useMemo(() => {
    const result: Record<string, Presupuesto[]> = {}
    for (const col of columns) {
      let items = columnData[col] || []
      if (search.trim()) {
        const q = search.toLowerCase()
        items = items.filter(p =>
          p.numero_presupuesto?.toLowerCase().includes(q) ||
          p.cliente?.toLowerCase().includes(q) ||
          p.obra_referencia?.toLowerCase().includes(q)
        )
      }
      if (gestorFilter) {
        items = items.filter(p => p.gestor === gestorFilter)
      }
      result[col] = items
    }
    return result
  }, [columnData, search, gestorFilter])

  const allGestores = useMemo(() => {
    const set = new Set<string>()
    for (const items of Object.values(columnData)) {
      for (const p of items) {
        if (p.gestor) set.add(p.gestor)
      }
    }
    return [...set].sort()
  }, [columnData])

  function drop(status: string) {
    if (!dragId) return
    const presupuesto = Object.values(columnData).flat().find(p => p.id === dragId)
    if (!presupuesto || presupuesto.estado === status) return
    setMsg(null)
    setTarget({ presupuesto, status })
    setDragId(null)
  }

  async function apply(payload: KanbanPayload) {
    if (!target || saving) return
    setSaving(true)
    setSavingId(target.presupuesto.id)
    const dateFields: (keyof KanbanPayload)[] = [
      'fecha_envio_cliente', 'fecha_aceptacion', 'fecha_pedido_proveedor',
      'plazo_proveedor', 'fecha_prevista_entrega', 'fecha_limite_siguiente_accion',
      'fecha_cancelacion_rechazo'
    ]
    const cleaned = { ...payload }
    for (const f of dateFields) {
      if ((cleaned as any)[f] === '') (cleaned as any)[f] = null
    }
    try {
      if (cleaned.action === 'direct_status') {
        if (target.status === 'Pedido proveedor realizado') {
          await api.post(`/presupuestos/${target.presupuesto.id}/quick-action`, { action: 'crear_pedido_proveedor', expected_version: target.presupuesto.version, proveedor: cleaned.proveedor, numero_pedido_proveedor: cleaned.numero_pedido_proveedor, fecha_pedido_proveedor: cleaned.fecha_pedido_proveedor || new Date().toISOString().slice(0, 10) })
        } else {
          await api.patch(`/presupuestos/${target.presupuesto.id}`, { estado: target.status, expected_version: target.presupuesto.version })
        }
      } else {
        await api.post(`/presupuestos/${target.presupuesto.id}/quick-action`, cleaned)
      }
      toast.success('Presupuesto movido correctamente')
      setTarget(null)
      reload()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false); setSavingId(null) }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (id) setDragId(Number(id))
  }

  const panelPresupuesto = pedidoPanel
    ? Object.values(columnData).flat().find(p => p.id === pedidoPanel.id) || pedidoPanel
    : null

  return <>
    <PageHeader title="Kanban" subtitle="Mueve tarjetas entre estados. Si el estado exige datos, se abre una ventana guiada antes de guardar." />
    {msg && <div className="error" style={{ marginBottom: 14 }}>{msg}</div>}
    {error && <div className="error">{error}</div>}
    {loading ? <SkeletonCard /> : <>
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 px-1">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <input
            type="text"
            placeholder="Buscar por número, cliente u obra..."
            className="input w-full pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Buscar presupuestos"
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-1"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>
        {allGestores.length > 0 && (
          <select
            className="input min-w-[150px]"
            value={gestorFilter}
            onChange={e => setGestorFilter(e.target.value)}
            aria-label="Filtrar por gestor"
          >
            <option value="">Todos los gestores</option>
            {allGestores.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        )}
        {(search || gestorFilter) && (
          <span className="text-xs text-ink-muted">
            {Object.values(filteredColumnData).flat().length} resultados
          </span>
        )}
      </div>
      <div className="kanban" onDragOver={handleDragOver} onKeyDown={(e) => {
      if (!focusedCard) return

      const colIndex = columns.indexOf(focusedCard.col)
      const colCards = columnData[focusedCard.col] || []

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (focusedCard.index < colCards.length - 1) {
          setFocusedCard({ col: focusedCard.col, index: focusedCard.index + 1 })
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (focusedCard.index > 0) {
          setFocusedCard({ col: focusedCard.col, index: focusedCard.index - 1 })
        }
      } else if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault()
        if (colIndex < columns.length - 1) {
          const nextCol = columns[colIndex + 1]
          const nextCards = columnData[nextCol] || []
          const newIndex = Math.min(focusedCard.index, nextCards.length - 1)
          if (nextCards.length > 0) {
            setFocusedCard({ col: nextCol, index: Math.max(0, newIndex) })
          }
        }
      } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault()
        if (colIndex > 0) {
          const prevCol = columns[colIndex - 1]
          const prevCards = columnData[prevCol] || []
          const newIndex = Math.min(focusedCard.index, prevCards.length - 1)
          if (prevCards.length > 0) {
            setFocusedCard({ col: prevCol, index: Math.max(0, newIndex) })
          }
        }
      } else if (e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault()
        if (colIndex < columns.length - 1) {
          const card = colCards[focusedCard.index]
          if (card) {
            const nextCol = columns[colIndex + 1]
            setTarget({ presupuesto: card, status: nextCol })
            setFocusedCard(null)
          }
        }
      } else if (e.shiftKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        if (colIndex > 0) {
          const card = colCards[focusedCard.index]
          if (card) {
            const prevCol = columns[colIndex - 1]
            setTarget({ presupuesto: card, status: prevCol })
            setFocusedCard(null)
          }
        }
      } else if (e.key === 'Escape') {
        setFocusedCard(null)
        ;(document.activeElement as HTMLElement)?.blur()
      } else if (e.key >= '1' && e.key <= '9') {
        const targetColIndex = parseInt(e.key) - 1
        if (targetColIndex < columns.length) {
          e.preventDefault()
          const targetCol = columns[targetColIndex]
          const targetCards = columnData[targetCol] || []
          if (targetCards.length > 0) {
            setFocusedCard({ col: targetCol, index: 0 })
          }
        }
      }
    }}>
      {columns.map((col, idx) => (
        <VirtualizedColumn
          key={col}
          columnData={filteredColumnData[col] || []}
          columns={columns}
          columnIndex={idx}
          focusId={focusId}
          focusedCard={focusedCard}
          setFocusedCard={setFocusedCard}
          onPedidoClick={setPedidoPanel}
          onTarget={(p, status) => setTarget({ presupuesto: p, status })}
          onExpand={() => expandColumn(col)}
          collapsed={collapsedCols.has(col)}
          onToggleCollapse={() => {
            setCollapsedCols(prev => {
              const next = new Set(prev)
              if (next.has(col)) next.delete(col)
              else next.add(col)
              return next
            })
          }}
          isDragOver={dragOverCol === col}
          onDragOver={(e: React.DragEvent) => {
            e.preventDefault()
            const id = e.dataTransfer.getData('text/plain')
            if (id) setDragId(Number(id))
            setDragOverCol(col)
          }}
          onDragLeave={() => setDragOverCol(null)}
          savingId={savingId}
        />
      ))}
      </div>
    </>}
    <div className="fixed bottom-4 right-4 text-xs text-ink-muted bg-surface-panel border border-border rounded-lg px-3 py-1.5 shadow-sm hidden md:block">
      ↑↓ navegar · Shift+→ mover · 1-{columns.length} columna · Esc salir
    </div>
    {target && <KanbanModal presupuesto={target.presupuesto} status={target.status} onClose={() => setTarget(null)} onSubmit={apply} saving={saving} />}
    {panelPresupuesto && <PedidoSummaryPanel presupuesto={panelPresupuesto} onClose={() => setPedidoPanel(null)} onUpdated={reload} />}
  </>
}

function KanbanModal({ presupuesto, status, onClose, onSubmit, saving }: { presupuesto: Presupuesto; status: string; onClose: () => void; onSubmit: (payload: KanbanPayload) => void; saving: boolean }) {
  const { user } = useAuth()
  const action = actionByStatus[status]
  const [payload, setPayload] = useState<KanbanPayload>({
    action: action || 'direct_status',
    expected_version: presupuesto.version,
    fecha_envio_cliente: isoDate(presupuesto.fecha_envio_cliente) || new Date().toISOString().slice(0, 10),
    fecha_aceptacion: isoDate(presupuesto.fecha_aceptacion) || new Date().toISOString().slice(0, 10),
    proveedor: presupuesto.proveedor || '',
    numero_pedido_proveedor: presupuesto.numero_pedido_proveedor || '',
    fecha_pedido_proveedor: isoDate(presupuesto.fecha_pedido_proveedor) || new Date().toISOString().slice(0, 10),
    plazo_proveedor: isoDate(presupuesto.plazo_proveedor),
    fecha_prevista_entrega: isoDate(presupuesto.fecha_prevista_entrega),
    responsable_actual: user?.nombre || presupuesto.responsable_actual || '',
    siguiente_accion: presupuesto.siguiente_accion || '',
    fecha_limite_siguiente_accion: isoDate(presupuesto.fecha_limite_siguiente_accion) || new Date().toISOString().slice(0, 10),
    descripcion_incidencia: presupuesto.descripcion_incidencia || '',
    motivo_cancelacion_rechazo: presupuesto.motivo_cancelacion_rechazo || '',
    fecha_cancelacion_rechazo: isoDate(presupuesto.fecha_cancelacion_rechazo) || new Date().toISOString().slice(0, 10),
  })
  const set = (key: keyof KanbanPayload, value: string) => setPayload(p => ({ ...p, [key]: value }))
  return (
    <Modal open={true} onClose={onClose} title={`Mover a: ${status}`}>
      <p className="muted">Presupuesto {presupuesto.numero_presupuesto}. Se guardará con control de versión v{presupuesto.version}.</p>
      <div className="form-grid two">
        {status === 'Enviado al cliente' && <><Field label="Fecha envío cliente"><input className="input" type="date" value={payload.fecha_envio_cliente || ''} onChange={e => set('fecha_envio_cliente', e.target.value)} /></Field><Field label="Siguiente acción"><input className="input" value={payload.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} /></Field><Field label="Fecha límite"><input className="input" type="date" value={payload.fecha_limite_siguiente_accion || ''} onChange={e => set('fecha_limite_siguiente_accion', e.target.value)} /></Field></>}
        {status === 'Aceptado - pendiente pedido proveedor' && <><Field label="Fecha aceptación"><input className="input" type="date" value={payload.fecha_aceptacion || ''} onChange={e => set('fecha_aceptacion', e.target.value)} /></Field><Field label="Responsable"><input className="input" value={payload.responsable_actual || ''} onChange={e => set('responsable_actual', e.target.value)} /></Field><Field label="Siguiente acción"><input className="input" value={payload.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} /></Field><Field label="Fecha límite"><input className="input" type="date" value={payload.fecha_limite_siguiente_accion || ''} onChange={e => set('fecha_limite_siguiente_accion', e.target.value)} /></Field></>}
        {status === 'Pedido proveedor realizado' && <><Field label="Proveedor"><input className="input" value={payload.proveedor || ''} onChange={e => set('proveedor', e.target.value)} /></Field><Field label="Nº pedido proveedor"><input className="input" value={payload.numero_pedido_proveedor || ''} onChange={e => set('numero_pedido_proveedor', e.target.value)} /></Field><Field label="Fecha pedido proveedor"><input className="input" type="date" value={payload.fecha_pedido_proveedor || ''} onChange={e => set('fecha_pedido_proveedor', e.target.value)} /></Field></>}
        {status === 'Plazo proveedor confirmado' && <><Field label="Plazo proveedor"><input className="input" type="date" value={payload.plazo_proveedor || ''} onChange={e => set('plazo_proveedor', e.target.value)} /></Field><Field label="Fecha prevista entrega"><input className="input" type="date" value={payload.fecha_prevista_entrega || ''} onChange={e => set('fecha_prevista_entrega', e.target.value)} /></Field></>}
        {status === 'Bloqueado / incidencia' && <><Field label="Responsable"><input className="input" value={payload.responsable_actual || ''} onChange={e => set('responsable_actual', e.target.value)} /></Field><Field label="Descripción incidencia"><textarea rows={4} value={payload.descripcion_incidencia || ''} onChange={e => set('descripcion_incidencia', e.target.value)} /></Field></>}
        {status === 'Cancelado / rechazado' && <><Field label="Fecha cancelación"><input className="input" type="date" value={payload.fecha_cancelacion_rechazo || ''} onChange={e => set('fecha_cancelacion_rechazo', e.target.value)} /></Field><Field label="Motivo cancelación"><textarea rows={4} value={payload.motivo_cancelacion_rechazo || ''} onChange={e => set('motivo_cancelacion_rechazo', e.target.value)} /></Field></>}
        {['En preparación / fabricación','Entregado / cerrado'].includes(status) && <p className="muted">No requiere datos adicionales, pero el backend aplicará las validaciones de cierre y versión.</p>}
      </div>
      <div className="modal-actions"><button className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn" disabled={saving} onClick={() => onSubmit(payload)}>{saving ? 'Guardando...' : 'Guardar movimiento'}</button></div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="field"><label>{label}</label>{children}</div> }