import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, CheckCircle2, MessageSquarePlus, PackageCheck, RefreshCw, Send, ShieldAlert, Truck, XCircle } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PresupuestoForm } from '../components/PresupuestoForm'
import { PriorityBadge, StateBadge } from '../components/Badges'
import { SkeletonCard } from '../components/Skeleton'
import { api, fmtDate, isoDate, type Presupuesto } from '../utils/api'
import { useAuth } from '../utils/auth'
import { useData } from '../utils/useData'
import { useToast } from '../utils/toast'

type Comentario = { id: number; comentario: string; nombre_opcional?: string; usuario_nombre?: string; usuario_email?: string; creado_en: string }
type Historial = { id: number; campo: string; valor_anterior?: string; valor_nuevo?: string; descripcion: string; nombre_opcional?: string; usuario_nombre?: string; usuario_email?: string; creado_en: string }
type QuickPayload = Partial<Presupuesto> & { action: string; expected_version?: number; motivo_cancelacion_rechazo?: string | null; fecha_cancelacion_rechazo?: string | null }

export function DetallePresupuesto() {
  const { id } = useParams()
  const { data, loading, error, reload, setData } = useData<Presupuesto>(() => api.get(`/presupuestos/${id}`), [id])
  const comments = useData<Comentario[]>(() => api.get(`/presupuestos/${id}/comentarios`), [id])
  const history = useData<Historial[]>(() => api.get(`/presupuestos/${id}/historial`), [id])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [commentName, setCommentName] = useState('')
  const [quickAction, setQuickAction] = useState<string | null>(null)
  const [archiveReason, setArchiveReason] = useState('')
  const [showArchive, setShowArchive] = useState(false)
  const toast = useToast()

  if (loading) return <SkeletonCard />
  if (error || !data) return <div className="error">{error || 'No encontrado'}</div>

  async function save() {
    if (!data) return
    const current = data
    setSaveError(null)
    try {
      const updated = await api.patch<Presupuesto>(`/presupuestos/${id}`, { ...current, expected_version: current.version })
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
      const updated = await api.post<Presupuesto>(`/presupuestos/${id}/quick-action`, { ...payload, expected_version: data.version })
      setData(updated); setQuickAction(null); reload(); history.reload()
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

  return <>
    <PageHeader title={`${data.numero_presupuesto} · ${data.cliente}`} subtitle={data.obra_referencia} actions={<Link className="btn secondary" to="/presupuestos"><ArrowLeft size={16}/>Volver</Link>} />
    <div className="toolbar"><StateBadge value={data.estado}/><PriorityBadge value={data.prioridad_calculada}/><span className="badge state">Días parado: {data.dias_parado}</span><span className="badge state">Versión: {data.version}</span>{data.archivado && <span className="badge danger">Archivado</span>}<button className="btn secondary small" onClick={reload}><RefreshCw size={14}/>Actualizar</button></div>
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
    <PresupuestoForm value={data} onChange={patch => setData({ ...data, ...patch })} onSubmit={save} />

    <div className="sections">
      <section className="card">
        <h3>Comentarios internos</h3>
        <div className="form-grid two">
          <input className="input" placeholder="Nombre opcional" value={commentName} onChange={e => setCommentName(e.target.value)} />
          <button className="btn" onClick={addComment}><MessageSquarePlus size={16}/>Añadir comentario</button>
        </div>
        <textarea style={{ marginTop: 10 }} rows={4} placeholder="Comentario interno..." value={comment} onChange={e => setComment(e.target.value)} />
        <div className="timeline" style={{ marginTop: 14 }}>
          {comments.data?.map(c => <div className="timeline-item" key={c.id}><strong>{c.comentario}</strong><br/><small>{fmtDate(c.creado_en)} · {c.usuario_nombre || c.nombre_opcional || c.usuario_email || 'Sin nombre'}</small></div>)}
        </div>
      </section>
      <section className="card">
        <h3>E) Historial de cambios</h3>
        <div className="timeline">
          {history.data?.map(h => <div className="timeline-item" key={h.id}><strong>{h.descripcion}</strong><br/><small>{fmtDate(h.creado_en)} · {h.usuario_nombre || h.nombre_opcional || h.usuario_email || 'Sin usuario'}</small></div>)}
        </div>
      </section>
    </div>
    {quickAction && <QuickActionModal action={quickAction} base={data} onClose={() => setQuickAction(null)} onSubmit={runQuick} />}
    {showArchive && <div className="modal-backdrop"><div className="modal card"><h3>Archivar presupuesto</h3><p className="muted">No se borra: queda oculto de las vistas normales y mantiene historial.</p><textarea rows={4} value={archiveReason} onChange={e => setArchiveReason(e.target.value)} placeholder="Motivo de archivado..."/><div className="modal-actions"><button className="btn secondary" onClick={() => setShowArchive(false)}>Cancelar</button><button className="btn danger" onClick={archiveBudget}>Archivar</button></div></div></div>}
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
  return <div className="modal-backdrop"><div className="modal card"><h3>{title[action] || 'Acción rápida'}</h3>
    <div className="form-grid two">
      {action === 'marcar_enviado' && <><Field label="Fecha envío cliente"><input className="input" type="date" value={payload.fecha_envio_cliente || ''} onChange={e => set('fecha_envio_cliente', e.target.value)} /></Field><Field label="Siguiente acción"><input className="input" value={payload.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} placeholder="Hacer seguimiento comercial" /></Field><Field label="Fecha límite"><input className="input" type="date" value={payload.fecha_limite_siguiente_accion || ''} onChange={e => set('fecha_limite_siguiente_accion', e.target.value)} /></Field></>}
      {action === 'marcar_aceptado' && <><Field label="Fecha aceptación"><input className="input" type="date" value={payload.fecha_aceptacion || ''} onChange={e => set('fecha_aceptacion', e.target.value)} /></Field><Field label="Responsable actual"><input className="input" value={payload.responsable_actual || ''} onChange={e => set('responsable_actual', e.target.value)} placeholder="Compras" /></Field><Field label="Siguiente acción"><input className="input" value={payload.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} placeholder="Hacer pedido proveedor" /></Field><Field label="Fecha límite"><input className="input" type="date" value={payload.fecha_limite_siguiente_accion || ''} onChange={e => set('fecha_limite_siguiente_accion', e.target.value)} /></Field></>}
      {action === 'crear_pedido_proveedor' && <><Field label="Proveedor"><input className="input" value={payload.proveedor || ''} onChange={e => set('proveedor', e.target.value)} /></Field><Field label="Nº pedido proveedor"><input className="input" value={payload.numero_pedido_proveedor || ''} onChange={e => set('numero_pedido_proveedor', e.target.value)} /></Field><Field label="Fecha pedido proveedor"><input className="input" type="date" value={payload.fecha_pedido_proveedor || ''} onChange={e => set('fecha_pedido_proveedor', e.target.value)} /></Field><Field label="Fecha límite para confirmar plazo"><input className="input" type="date" value={payload.fecha_limite_siguiente_accion || ''} onChange={e => set('fecha_limite_siguiente_accion', e.target.value)} /></Field></>}
      {action === 'confirmar_plazo' && <><Field label="Plazo proveedor"><input className="input" type="date" value={payload.plazo_proveedor || ''} onChange={e => set('plazo_proveedor', e.target.value)} /></Field><Field label="Fecha prevista entrega"><input className="input" type="date" value={payload.fecha_prevista_entrega || ''} onChange={e => set('fecha_prevista_entrega', e.target.value)} /></Field><Field label="Siguiente acción"><input className="input" value={payload.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} /></Field></>}
      {action === 'cerrar' && <><p className="muted">Se validará que el pedido proveedor y el plazo estén correctamente informados antes de cerrar.</p></>}
      {action === 'bloquear' && <><Field label="Responsable"><input className="input" value={payload.responsable_actual || ''} onChange={e => set('responsable_actual', e.target.value)} /></Field><Field label="Siguiente acción"><input className="input" value={payload.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} placeholder="Resolver incidencia" /></Field><Field label="Descripción incidencia"><textarea rows={4} value={payload.descripcion_incidencia || ''} onChange={e => set('descripcion_incidencia', e.target.value)} /></Field></>}
      {action === 'cancelar' && <><Field label="Fecha cancelación / rechazo"><input className="input" type="date" value={payload.fecha_cancelacion_rechazo || ''} onChange={e => set('fecha_cancelacion_rechazo', e.target.value)} /></Field><Field label="Motivo cancelación / rechazo"><textarea rows={4} value={payload.motivo_cancelacion_rechazo || ''} onChange={e => set('motivo_cancelacion_rechazo', e.target.value)} /></Field></>}
    </div>
    <div className="modal-actions"><button className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSubmit(payload)}>Aplicar</button></div>
  </div></div>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>
}
