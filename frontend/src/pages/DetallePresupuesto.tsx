import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, CheckCircle2, MessageSquarePlus, Package, PackageCheck, Pencil, Plus, RefreshCw, Send, ShieldAlert, Trash2, Truck, Users, XCircle } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PresupuestoForm } from '../components/PresupuestoForm'
import { PriorityBadge, StateBadge } from '../components/Badges'
import { SkeletonCard } from '../components/Skeleton'
import { api, fmtDate, isoDate, euro, type Presupuesto, type PedidoProveedor } from '../utils/api'
import { useAuth } from '../utils/auth'
import { useData } from '../utils/useData'
import { ProveedorList } from '../components/ProveedorList'
import { useToast } from '../utils/toast'
import { PedidoSummaryBadge } from '../components/PedidoSummary'

type Comentario = { id: number; comentario: string; nombre_opcional?: string; usuario_nombre?: string; usuario_email?: string; creado_en: string }
type Historial = { id: number; campo: string; valor_anterior?: string; valor_nuevo?: string; descripcion: string; nombre_opcional?: string; usuario_nombre?: string; usuario_email?: string; creado_en: string }
type QuickPayload = Partial<Presupuesto> & { action: string; expected_version?: number; motivo_cancelacion_rechazo?: string | null; fecha_cancelacion_rechazo?: string | null }

type Tab = 'form' | 'comentarios' | 'historial' | 'pedidos' | 'proveedores'

const ESTADO_ENTREGA_COLORS: Record<string, string> = {
  pendiente: '#f59e0b',
  parcial: '#3b82f6',
  completado: '#22c55e',
}

export function DetallePresupuesto() {
  const { id } = useParams()
  const { data, loading, error, reload, setData } = useData<Presupuesto>(() => api.get(`/presupuestos/${id}`), [id])
  const comments = useData<Comentario[]>(() => api.get(`/presupuestos/${id}/comentarios`), [id])
  const history = useData<Historial[]>(() => api.get(`/presupuestos/${id}/historial`), [id])
  const pedidos = useData<PedidoProveedor[]>(() => api.get(`/presupuestos/${id}/pedidos`), [id])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [commentName, setCommentName] = useState('')
  const [quickAction, setQuickAction] = useState<string | null>(null)
  const [archiveReason, setArchiveReason] = useState('')
  const [showArchive, setShowArchive] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('form')
  const [showPedidoForm, setShowPedidoForm] = useState(false)
  const [editingPedido, setEditingPedido] = useState<PedidoProveedor | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const toast = useToast()

  if (loading) return <SkeletonCard />
  if (error || !data) return <div className="error">{error || 'No encontrado'}</div>

  async function save() {
    if (!data) return
    const current = data
    setSaveError(null)
    try {
      const dateFields = ['plazo_proveedor', 'fecha_prevista_entrega', 'fecha_envio_cliente', 'fecha_aceptacion', 'fecha_pedido_proveedor', 'fecha_limite_siguiente_accion', 'fecha_cancelacion_rechazo']
      const cleaned = { ...current }
      for (const f of dateFields) {
        const val = (cleaned as any)[f]
        if (val === '') (cleaned as any)[f] = null
      }
      const updated = await api.patch<Presupuesto>(`/presupuestos/${id}`, { ...cleaned, expected_version: cleaned.version })
      setData(updated)
      reload(); history.reload()
      toast.success('Presupuesto guardado correctamente')
    } catch (e) { setSaveError(e instanceof Error ? e.message : String(e)); toast.error('Error al guardar') }
  }
  async function addComment() {
    if (!comment.trim()) return
    await api.post(`/presupuestos/${id}/comentarios`, { comentario: comment, nombre_opcional: commentName || null })
    setComment(''); setCommentName('')
    comments.reload(); history.reload()
  }

  async function runQuick(payload: QuickPayload) {
    if (!data) return
    setSaveError(null)
    try {
      const dateFields = ['plazo_proveedor', 'fecha_prevista_entrega', 'fecha_envio_cliente', 'fecha_aceptacion', 'fecha_pedido_proveedor', 'fecha_limite_siguiente_accion', 'fecha_cancelacion_rechazo']
      const cleaned = { ...payload }
      for (const f of dateFields) {
        const val = (cleaned as any)[f]
        if (val === '') (cleaned as any)[f] = null
      }
      const updated = await api.post<Presupuesto>(`/presupuestos/${id}/quick-action`, { ...cleaned, expected_version: data.version })
      setData(updated); setQuickAction(null); reload(); history.reload(); pedidos.reload()
    } catch (e) { setSaveError(e instanceof Error ? e.message : String(e)) }
  }

  async function archiveBudget() {
    if (!data) return
    if (!archiveReason.trim()) { setSaveError('Indica el motivo de archivado.'); return }
    try {
      const updated = await api.post<Presupuesto>(`/presupuestos/${id}/archivar`, { motivo_archivado: archiveReason, expected_version: data.version })
      setData(updated); setShowArchive(false); history.reload()
    } catch (e) { setSaveError(e instanceof Error ? e.message : String(e)) }
  }

  async function savePedido(payload: Partial<PedidoProveedor>) {
    try {
      if (editingPedido) {
        await api.updatePedido(editingPedido.id, payload)
        toast.success('Pedido actualizado')
      } else {
        await api.createPedido(Number(id), payload)
        toast.success('Pedido creado')
      }
      setEditingPedido(null); setShowPedidoForm(false)
      pedidos.reload(); history.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function deletePedido(pedidoId: number) {
    if (deleteConfirm !== pedidoId) { setDeleteConfirm(pedidoId); return }
    try {
      await api.deletePedido(pedidoId)
      pedidos.reload(); history.reload()
      toast.success('Pedido eliminado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return <>
    <PageHeader title={`${data.numero_presupuesto} · ${String(data.cliente || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`} subtitle={String(data.obra_referencia || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')} actions={<Link className="btn secondary" to="/presupuestos"><ArrowLeft size={16}/>Volver</Link>} />
    <div className="toolbar"><StateBadge value={data.estado}/><PriorityBadge value={data.prioridad_calculada}/><span className="badge state">Días parado: {data.dias_parado}</span><span className="badge state" title="El control de versión previene que dos personas editen el mismo presupuesto a la vez. Si la versión no coincide, la edición será rechazada.">Versión: {data.version}</span>{data.archivado && <span className="badge danger">Archivado</span>}<button className="btn secondary small" onClick={reload}><RefreshCw size={14}/>Actualizar</button></div>
    <section className="card" style={{ marginBottom: 16 }}>
      <h3>Acciones rápidas guiadas</h3>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <button className="btn secondary small" onClick={() => setQuickAction('marcar_enviado')}><Send size={14}/>Marcar enviado</button>
        <button className="btn secondary small" onClick={() => setQuickAction('marcar_aceptado')}><CheckCircle2 size={14}/>Marcar aceptado</button>
        <button className="btn secondary small" onClick={() => setQuickAction('crear_pedido_proveedor')}><PackageCheck size={14}/>Crear pedido proveedor</button>
        <button className="btn secondary small" onClick={() => setQuickAction('confirmar_plazo')}><Truck size={14}/>Confirmar plazo</button>
        <button className="btn secondary small" onClick={() => setQuickAction('cerrar')}><CheckCircle2 size={14}/>Cerrar</button>
        <button className="btn danger small" onClick={() => setQuickAction('bloquear')}><ShieldAlert size={14}/>Bloquear incidencia</button>
        <button className="btn danger small" onClick={() => setQuickAction('cancelar')}><XCircle size={14}/>Cancelar / rechazar</button>
        <button className="btn secondary small" onClick={() => setShowArchive(true)}><Archive size={14}/>Archivar</button>
      </div>
      <p className="muted">Cada acción abre solo los campos necesarios y el backend aplica las validaciones estrictas.</p>
    </section>
    {saveError && <div className="error" style={{ marginBottom: 14 }}>{saveError}</div>}

    <div className="tabs" style={{ marginBottom: 16 }}>
      <button className={`tab ${activeTab === 'form' ? 'active' : ''}`} onClick={() => setActiveTab('form')}>Datos</button>
      <button className={`tab ${activeTab === 'pedidos' ? 'active' : ''}`} onClick={() => setActiveTab('pedidos')}>
        <Package size={14}/>Pedidos {pedidos.data?.length ? `(${pedidos.data.length})` : ''}
      </button>
      <button className={`tab ${activeTab === 'comentarios' ? 'active' : ''}`} onClick={() => setActiveTab('comentarios')}>Comentarios</button>
      <button className={`tab ${activeTab === 'historial' ? 'active' : ''}`} onClick={() => setActiveTab('historial')}>Historial</button>
      <button className={`tab ${activeTab === 'proveedores' ? 'active' : ''}`} onClick={() => setActiveTab('proveedores')}><Users size={14}/>Proveedores</button>
    </div>

    {activeTab === 'form' && <PresupuestoForm value={data} onChange={patch => setData({ ...data, ...patch })} onSubmit={save} />}

    {activeTab === 'pedidos' && (
      <section className="card">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Pedidos a Proveedor</h3>
          <button className="btn secondary small" onClick={() => { setEditingPedido(null); setShowPedidoForm(true) }}>
            <Plus size={14}/>Nuevo pedido
          </button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <PedidoSummaryBadge presupuesto={{ ...data, pedidos: pedidos.data || data.pedidos }} variant="detail" />
        </div>
        {pedidos.data?.length === 0 && <p className="muted">Sin pedidos registrados.</p>}
        {pedidos.data?.length !== 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th><th>Nº Pedido</th><th>Fecha</th><th>Importe</th>
                  <th>Estado</th><th>Entrega Prevista</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.data?.map(p => (
                  <tr key={p.id}>
                    <td>{p.proveedor}</td>
                    <td><strong>{p.numero_pedido || '—'}</strong></td>
                    <td>{fmtDate(p.fecha_pedido)}</td>
                    <td className="money">{p.importe != null ? euro(p.importe) : '—'}</td>
                    <td>
                      <span className="badge" style={{ color: ESTADO_ENTREGA_COLORS[p.estado_entrega], borderColor: ESTADO_ENTREGA_COLORS[p.estado_entrega] }}>
                        {p.estado_entrega}
                      </span>
                    </td>
                    <td>{fmtDate(p.fecha_entrega_prevista)}</td>
                    <td>
                      <div className="flex gap-1">
                        <button className="btn secondary small" onClick={() => { setEditingPedido(p); setShowPedidoForm(true) }}><Pencil size={12}/></button>
                        <button className="btn danger small" onClick={() => deletePedido(p.id)}><Trash2 size={12}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    )}

    {activeTab === 'comentarios' && (
      <section className="card">
        <h3>Comentarios internos</h3>
        <div className="form-grid two">
          <input className="input" placeholder="Nombre opcional" value={commentName} onChange={e => setCommentName(e.target.value)} />
          <button className="btn" onClick={addComment}><MessageSquarePlus size={16}/>Añadir comentario</button>
        </div>
        <textarea style={{ marginTop: 10 }} rows={4} placeholder="Comentario interno..." value={comment} onChange={e => setComment(e.target.value)} />
        <div className="timeline" style={{ marginTop: 14 }}>
          {comments.data?.map(c => <div className="timeline-item" key={c.id}><strong>{String(c.comentario).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</strong><br/><small>{fmtDate(c.creado_en)} · {c.usuario_nombre || c.nombre_opcional || c.usuario_email || 'Sin nombre'}</small></div>)}
        </div>
      </section>
    )}

    {activeTab === 'historial' && (
      <section className="card">
        <h3>Historial de cambios</h3>
        <div className="timeline">
          {history.data?.map(h => <div className="timeline-item" key={h.id}><strong>{h.descripcion}</strong><br/><small>{fmtDate(h.creado_en)} · {h.usuario_nombre || h.nombre_opcional || h.usuario_email || 'Sin usuario'}</small></div>)}
        </div>
      </section>
    )}

    {showPedidoForm && <PedidoFormModal
      pedido={editingPedido}
      onClose={() => { setShowPedidoForm(false); setEditingPedido(null) }}
      onSubmit={savePedido}
    />}
    {quickAction && <QuickActionModal action={quickAction} base={data} onClose={() => setQuickAction(null)} onSubmit={runQuick} />}
    {showArchive && (
      <div className="modal-backdrop">
        <div className="modal card">
          <h3>Archivar presupuesto</h3>
          <p className="muted">No se borra: queda oculto de las vistas normales y mantiene historial.</p>
          <textarea rows={4} value={archiveReason} onChange={e => setArchiveReason(e.target.value)} placeholder="Motivo de archivado..."/>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setShowArchive(false)}>Cancelar</button>
            <button className="btn danger" onClick={archiveBudget}>Archivar</button>
          </div>
        </div>
      </div>
    )}
    {activeTab === 'proveedores' && (
      <ProveedorList presupuestoId={Number(id)} presupuestoImporte={data.importe} />
    )}
    {deleteConfirm !== null && (
      <div className="modal-backdrop">
        <div className="modal card">
          <h3>Eliminar pedido</h3>
          <p className="muted">Esta acción no se puede deshacer. ¿Continuar?</p>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
            <button className="btn danger" onClick={async () => {
              setDeleteConfirm(null)
              try {
                await api.deletePedido(deleteConfirm)
                pedidos.reload(); history.reload()
                toast.success('Pedido eliminado')
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e))
              }
            }}>Eliminar</button>
          </div>
        </div>
      </div>
    )}
  </>
}

function QuickActionModal({ action, base, onClose, onSubmit }: { action: string; base: Presupuesto; onClose: () => void; onSubmit: (payload: QuickPayload) => void }) {
  const { user } = useAuth()
  const [payload, setPayload] = useState<QuickPayload>({
    action,
    fecha_envio_cliente: isoDate(base.fecha_envio_cliente) || new Date().toISOString().slice(0, 10),
    fecha_aceptacion: isoDate(base.fecha_aceptacion) || new Date().toISOString().slice(0, 10),
    proveedor: base.proveedor || '',
    numero_pedido_proveedor: base.numero_pedido_proveedor || '',
    fecha_pedido_proveedor: isoDate(base.fecha_pedido_proveedor) || new Date().toISOString().slice(0, 10),
    plazo_proveedor: isoDate(base.plazo_proveedor),
    fecha_prevista_entrega: isoDate(base.fecha_prevista_entrega),
    responsable_actual: user?.nombre || base.responsable_actual || '',
    siguiente_accion: base.siguiente_accion || '',
    fecha_limite_siguiente_accion: isoDate(base.fecha_limite_siguiente_accion) || new Date().toISOString().slice(0, 10),
    descripcion_incidencia: base.descripcion_incidencia || '',
    motivo_cancelacion_rechazo: base.motivo_cancelacion_rechazo || '',
    fecha_cancelacion_rechazo: isoDate(base.fecha_cancelacion_rechazo) || new Date().toISOString().slice(0, 10),
  })
  const set = (key: keyof QuickPayload, value: string | null) => setPayload(p => ({ ...p, [key]: value }))
  const title: Record<string,string> = {
    marcar_enviado: 'Marcar enviado al cliente', marcar_aceptado: 'Marcar aceptado', crear_pedido_proveedor: 'Crear pedido proveedor', confirmar_plazo: 'Confirmar plazo proveedor', cerrar: 'Cerrar presupuesto', bloquear: 'Bloquear por incidencia', cancelar: 'Cancelar / rechazar presupuesto'
  }
  return (
    <div className="modal-backdrop">
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="quick-action-title">
        <h3 id="quick-action-title">{title[action] || 'Acción rápida'}</h3>
        <div className="form-grid two">
          {action === 'marcar_enviado' && <>
            <Field label="Fecha envío cliente"><input className="input" type="date" value={payload.fecha_envio_cliente || ''} onChange={e => set('fecha_envio_cliente', e.target.value)} /></Field>
            <Field label="Siguiente acción"><input className="input" value={payload.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} placeholder="Hacer seguimiento comercial" /></Field>
            <Field label="Fecha límite"><input className="input" type="date" value={payload.fecha_limite_siguiente_accion || ''} onChange={e => set('fecha_limite_siguiente_accion', e.target.value)} /></Field>
          </>}
          {action === 'marcar_aceptado' && <>
            <Field label="Fecha aceptación"><input className="input" type="date" value={payload.fecha_aceptacion || ''} onChange={e => set('fecha_aceptacion', e.target.value)} /></Field>
            <Field label="Responsable actual"><input className="input" value={payload.responsable_actual || ''} onChange={e => set('responsable_actual', e.target.value)} placeholder="Compras" /></Field>
            <Field label="Siguiente acción"><input className="input" value={payload.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} placeholder="Hacer pedido proveedor" /></Field>
            <Field label="Fecha límite"><input className="input" type="date" value={payload.fecha_limite_siguiente_accion || ''} onChange={e => set('fecha_limite_siguiente_accion', e.target.value)} /></Field>
          </>}
          {action === 'crear_pedido_proveedor' && <>
            <Field label="Proveedor"><input className="input" value={payload.proveedor || ''} onChange={e => set('proveedor', e.target.value)} /></Field>
            <Field label="Nº pedido proveedor"><input className="input" value={payload.numero_pedido_proveedor || ''} onChange={e => set('numero_pedido_proveedor', e.target.value)} /></Field>
            <Field label="Fecha pedido proveedor"><input className="input" type="date" value={payload.fecha_pedido_proveedor || ''} onChange={e => set('fecha_pedido_proveedor', e.target.value)} /></Field>
            <Field label="Fecha límite para confirmar plazo"><input className="input" type="date" value={payload.fecha_limite_siguiente_accion || ''} onChange={e => set('fecha_limite_siguiente_accion', e.target.value)} /></Field>
          </>}
          {action === 'confirmar_plazo' && <>
            <Field label="Plazo proveedor"><input className="input" type="date" value={payload.plazo_proveedor || ''} onChange={e => set('plazo_proveedor', e.target.value)} /></Field>
            <Field label="Fecha prevista entrega"><input className="input" type="date" value={payload.fecha_prevista_entrega || ''} onChange={e => set('fecha_prevista_entrega', e.target.value)} /></Field>
            <Field label="Siguiente acción"><input className="input" value={payload.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} /></Field>
          </>}
          {action === 'cerrar' && <p className="muted">Se validará que el pedido proveedor y el plazo estén correctamente informados antes de cerrar.</p>}
          {action === 'bloquear' && <>
            <Field label="Responsable"><input className="input" value={payload.responsable_actual || ''} onChange={e => set('responsable_actual', e.target.value)} /></Field>
            <Field label="Siguiente acción"><input className="input" value={payload.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} placeholder="Resolver incidencia" /></Field>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Descripción incidencia</label><textarea rows={4} value={payload.descripcion_incidencia || ''} onChange={e => set('descripcion_incidencia', e.target.value)} /></div>
          </>}
          {action === 'cancelar' && <>
            <Field label="Fecha cancelación / rechazo"><input className="input" type="date" value={payload.fecha_cancelacion_rechazo || ''} onChange={e => set('fecha_cancelacion_rechazo', e.target.value)} /></Field>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Motivo cancelación / rechazo</label><textarea rows={4} value={payload.motivo_cancelacion_rechazo || ''} onChange={e => set('motivo_cancelacion_rechazo', e.target.value)} /></div>
          </>}
        </div>
        <div className="modal-actions"><button className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSubmit(payload)}>Aplicar</button></div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>
}

function PedidoFormModal({ pedido, onClose, onSubmit }: { pedido: PedidoProveedor | null; onClose: () => void; onSubmit: (payload: Partial<PedidoProveedor>) => void }) {
  const [form, setForm] = useState({
    proveedor: pedido?.proveedor || '',
    numero_pedido: pedido?.numero_pedido || '',
    fecha_pedido: pedido?.fecha_pedido || new Date().toISOString().slice(0, 10),
    importe: pedido?.importe != null ? String(pedido.importe) : '',
    estado_entrega: pedido?.estado_entrega || 'pendiente',
    fecha_entrega_prevista: pedido?.fecha_entrega_prevista || '',
    observaciones: pedido?.observaciones || '',
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  function handleSubmit() {
    if (!form.proveedor.trim() || !form.numero_pedido.trim()) {
      alert('Proveedor y número de pedido son obligatorios')
      return
    }
    onSubmit({
      proveedor: form.proveedor,
      numero_pedido: form.numero_pedido,
      fecha_pedido: form.fecha_pedido,
      importe: form.importe ? parseFloat(form.importe) : null,
      estado_entrega: form.estado_entrega as 'pendiente' | 'parcial' | 'completado',
      fecha_entrega_prevista: form.fecha_entrega_prevista || null,
      observaciones: form.observaciones || null,
    })
  }

  return (
    <div className="modal-backdrop">
      <div className="modal card">
        <h3>{pedido ? 'Editar pedido' : 'Nuevo pedido proveedor'}</h3>
        <div className="form-grid two">
          <Field label="Proveedor *"><input className="input" value={form.proveedor} onChange={e => set('proveedor', e.target.value)} placeholder="Nombre del proveedor" /></Field>
          <Field label="Nº Pedido *"><input className="input" value={form.numero_pedido} onChange={e => set('numero_pedido', e.target.value)} placeholder="Número de pedido" /></Field>
          <Field label="Fecha pedido"><input className="input" type="date" value={form.fecha_pedido} onChange={e => set('fecha_pedido', e.target.value)} /></Field>
          <Field label="Importe (€)"><input className="input" type="number" step="0.01" value={form.importe} onChange={e => set('importe', e.target.value)} placeholder="0.00" /></Field>
          <Field label="Estado entrega">
            <select className="input" value={form.estado_entrega} onChange={e => set('estado_entrega', e.target.value)}>
              <option value="pendiente">Pendiente</option>
              <option value="parcial">Parcial</option>
              <option value="completado">Completado</option>
            </select>
          </Field>
          <Field label="Fecha entrega prevista"><input className="input" type="date" value={form.fecha_entrega_prevista} onChange={e => set('fecha_entrega_prevista', e.target.value)} /></Field>
        </div>
        <Field label="Observaciones"><textarea className="input" rows={3} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Observaciones..." /></Field>
        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={handleSubmit}>{pedido ? 'Guardar' : 'Crear pedido'}</button>
        </div>
      </div>
    </div>
  )
}
