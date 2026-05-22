import { useState, type ReactNode, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { PageHeader } from '../components/PageHeader'
import { SkeletonCard } from '../components/Skeleton'
import { api, ESTADOS, euro, fmtDate, isoDate, type Presupuesto } from '../utils/api'
import { useAuth } from '../utils/auth'
import { useData } from '../utils/useData'
import { Link, useSearchParams } from 'react-router-dom'
import { useToast } from '../utils/toast'
import { PedidoSummaryBadge } from '../components/PedidoSummary'
import { PedidoSummaryPanel } from '../components/PedidoSummaryPanel'

const columns = ESTADOS.filter(s => s !== 'Pendiente de enviar')

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

function KanbanCard({ presupuesto, focusId, columns, onPedidoClick, onTarget }: {
  presupuesto: Presupuesto
  focusId: number | null
  columns: string[]
  onPedidoClick: (p: Presupuesto) => void
  onTarget: (p: Presupuesto, status: string) => void
}) {
  const pri = (presupuesto.prioridad_calculada || 'verde').toLowerCase()
  return (
    <div className={`kanban-card priority-${pri} ${focusId === presupuesto.id ? 'focused' : ''}`} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', String(presupuesto.id))}>
      <div className="kanban-card-header">
        <Link to={`/presupuestos/${presupuesto.id}`} className="kanban-card-num">{presupuesto.numero_presupuesto}</Link>
        <span className="kanban-card-version">v{presupuesto.version}</span>
      </div>
      <div className="kanban-card-cliente">{String(presupuesto.cliente || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      {(presupuesto.proveedor || presupuesto.responsable_actual) && <div className="kanban-card-meta">
        {presupuesto.proveedor && <span className="kanban-card-provider">{presupuesto.proveedor}</span>}
        {presupuesto.responsable_actual && <span className="kanban-card-responsable">{presupuesto.responsable_actual}</span>}
      </div>}
      <div className="kanban-card-ref">{String(presupuesto.obra_referencia || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      <div className="kanban-card-divider" />
      <div className="kanban-card-footer">
        <span className="importe">{euro(presupuesto.importe)}</span>
        <div className="meta">
          <span>📅 {fmtDate(presupuesto.fecha_limite_siguiente_accion)}</span>
          <span>{String(presupuesto.gestor || '').split(' ')[0]}</span>
        </div>
      </div>
      <PedidoSummaryBadge presupuesto={presupuesto} variant="kanban" onClick={(e) => { e.stopPropagation(); onPedidoClick(presupuesto) }} />
      <div className="kanban-card-move-btns" style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        {columns.filter(c => c !== presupuesto.estado).slice(0, 2).map(nextStatus => (
          <button
            key={nextStatus}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
            onClick={(e) => { e.stopPropagation(); onTarget(presupuesto, nextStatus); }}
            title={`Mover a ${nextStatus}`}
          >
            → {nextStatus.slice(0, 12)}
          </button>
        ))}
      </div>
      <Link to={`/presupuestos/${presupuesto.id}`} className="kanban-card-link">Abrir detalle</Link>
    </div>
  )
}

function VirtualizedColumn({ columnData, focusId, columns, onPedidoClick, onTarget }: {
  columnData: Presupuesto[]
  focusId: number | null
  columns: string[]
  onPedidoClick: (p: Presupuesto) => void
  onTarget: (p: Presupuesto, status: string) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: columnData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 3,
  })

  return (
    <div className="kanban-col" ref={parentRef} style={{ overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
      <h3>{columnData.length > 0 ? columnData[0].estado : ''} <span className="muted">{columnData.length}</span></h3>
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
              focusId={focusId}
              columns={columns}
              onPedidoClick={onPedidoClick}
              onTarget={onTarget}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function Kanban() {
  const { data, loading, error, reload } = useData<Presupuesto[]>(() => api.get('/presupuestos?limit=2000&ocultar_cerrados=false'), [])
  const [params] = useSearchParams()
  const [dragId, setDragId] = useState<number | null>(null)
  const [target, setTarget] = useState<{ presupuesto: Presupuesto; status: string } | null>(null)
  const [pedidoPanel, setPedidoPanel] = useState<Presupuesto | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const focusId = Number(params.get('focus') || 0) || null
  const panelPresupuesto = pedidoPanel ? (data || []).find(p => p.id === pedidoPanel.id) || pedidoPanel : null

  function drop(status: string) {
    if (!dragId) return
    const presupuesto = (data || []).find(p => p.id === dragId)
    if (!presupuesto || presupuesto.estado === status) return
    setMsg(null)
    setTarget({ presupuesto, status })
    setDragId(null)
  }

  async function apply(payload: KanbanPayload) {
    if (!target || saving) return
    setSaving(true)
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
    finally { setSaving(false) }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (id) setDragId(Number(id))
  }

  return <>
    <PageHeader title="Kanban" subtitle="Mueve tarjetas entre estados. Si el estado exige datos, se abre una ventana guiada antes de guardar." />
    {msg && <div className="error" style={{ marginBottom: 14 }}>{msg}</div>}
    {error && <div className="error">{error}</div>}
    {loading ? <SkeletonCard /> : <div className="kanban" onDragOver={handleDragOver}>
      {columns.map(col => {
        const columnData = (data || []).filter(p => p.estado === col)
        return (
          <VirtualizedColumn
            key={col}
            columnData={columnData}
            focusId={focusId}
            columns={columns}
            onPedidoClick={setPedidoPanel}
            onTarget={(p, status) => setTarget({ presupuesto: p, status })}
          />
        )
      })}
    </div>}
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
  return <div className="modal-backdrop"><div className="modal card"><h3>Mover a: {status}</h3>
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
  </div></div>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="field"><label>{label}</label>{children}</div> }