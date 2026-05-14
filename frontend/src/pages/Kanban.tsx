import { useState, type ReactNode } from 'react'
import { PageHeader } from '../components/PageHeader'
import { PriorityBadge } from '../components/Badges'
import { SkeletonCard } from '../components/Skeleton'
import { api, ESTADOS, euro, fmtDate, isoDate, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'
import { Link } from 'react-router-dom'

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

export function Kanban() {
  const { data, loading, error, reload } = useData<Presupuesto[]>(() => api.get('/presupuestos?limit=2000&ocultar_cerrados=false'), [])
  const [dragId, setDragId] = useState<number | null>(null)
  const [target, setTarget] = useState<{ presupuesto: Presupuesto; status: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  function drop(status: string) {
    const presupuesto = (data || []).find(p => p.id === dragId)
    if (!presupuesto || presupuesto.estado === status) return
    setMsg(null)
    setTarget({ presupuesto, status })
  }
  async function apply(payload: KanbanPayload) {
    if (!target) return
    try {
      if (payload.action === 'direct_status') {
        await api.patch(`/presupuestos/${target.presupuesto.id}`, { estado: target.status, expected_version: target.presupuesto.version })
      } else {
        await api.post(`/presupuestos/${target.presupuesto.id}/quick-action`, payload)
      }
      setTarget(null)
      reload()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }
  return <>
    <PageHeader title="Kanban" subtitle="Mueve tarjetas entre estados. Si el estado exige datos, se abre una ventana guiada antes de guardar." />
    {msg && <div className="error" style={{ marginBottom: 14 }}>{msg}</div>}
    {error && <div className="error">{error}</div>}
    {loading ? <SkeletonCard /> : <div className="kanban">
      {columns.map(col => <div className="kanban-col" key={col} onDragOver={e => e.preventDefault()} onDrop={() => drop(col)}>
        <h3>{col} <span className="muted">{(data || []).filter(p => p.estado === col).length}</span></h3>
        {(data || []).filter(p => p.estado === col).map(p => {
          const pri = (p.prioridad_calculada || 'verde').toLowerCase()
          return (
            <div key={p.id} className={`kanban-card priority-${pri}`} draggable onDragStart={() => setDragId(p.id)}>
              <div className="kanban-card-header">
                <span className="kanban-card-num">{p.numero_presupuesto}</span>
                <span className="kanban-card-version">v{p.version}</span>
              </div>
              <div className="kanban-card-cliente">{p.cliente}</div>
              <div className="kanban-card-ref">{p.obra_referencia}</div>
              <div className="kanban-card-divider" />
              <div className="kanban-card-footer">
                <span className="importe">{euro(p.importe)}</span>
                <div className="meta">
                  <span>📅 {fmtDate(p.fecha_limite_siguiente_accion)}</span>
                  <span>{p.gestor.split(' ')[0]}</span>
                </div>
              </div>
              <div className="kanban-card-tooltip">
                <div>Responsável: {p.responsable_actual || '—'}</div>
                <div>Dias parado: {p.dias_parado}</div>
                {p.incidencia && <div style={{color:'#f87171'}}>⚠ Incidencia abierta</div>}
                {p.siguiente_accion && <div>Próxima: {p.siguiente_accion}</div>}
              </div>
              <Link to={`/presupuestos/${p.id}`} style={{ position: 'absolute', inset: 0 }} onClick={(e) => e.stopPropagation()} />
            </div>
          )
        })}
      </div>)}
    </div>}
    {target && <KanbanModal presupuesto={target.presupuesto} status={target.status} onClose={() => setTarget(null)} onSubmit={apply} />}
  </>
}

function KanbanModal({ presupuesto, status, onClose, onSubmit }: { presupuesto: Presupuesto; status: string; onClose: () => void; onSubmit: (payload: KanbanPayload) => void }) {
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
    responsable_actual: presupuesto.responsable_actual || '',
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
    <div className="modal-actions"><button className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSubmit(payload)}>Guardar movimiento</button></div>
  </div></div>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="field"><label>{label}</label>{children}</div> }
