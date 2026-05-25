import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, CheckCircle2, MessageSquarePlus, Package, PackageCheck, Pencil, Plus, RefreshCw, Send, ShieldAlert, Trash2, Truck, Users, XCircle } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PresupuestoForm } from '../components/PresupuestoForm'
import { OptionInput } from '../components/OptionInput'
import { PriorityBadge, StateBadge } from '../components/Badges'
import { SkeletonCard } from '../components/Skeleton'
import { api, fmtDate, isoDate, euro, type Presupuesto, type PedidoProveedor } from '../utils/api'
import { useAuth } from '../utils/auth'
import { useData } from '../utils/useData'
import { ProveedorList } from '../components/ProveedorList'
import { useToast } from '../utils/toast'
import { PedidoSummaryBadge } from '../components/PedidoSummary'
import { useMetadataOptions } from '../utils/useMetadataOptions'
import { Modal } from '../components/Modal'
import { PRIORITY_COLOR } from '../utils/tokens'

type Comentario = { id: number; comentario: string; nombre_opcional?: string; usuario_nombre?: string; usuario_email?: string; creado_en: string }
type Historial = { id: number; campo: string; valor_anterior?: string; valor_nuevo?: string; descripcion: string; nombre_opcional?: string; usuario_nombre?: string; usuario_email?: string; creado_en: string }
type QuickPayload = Partial<Presupuesto> & { action: string; expected_version?: number; motivo_cancelacion_rechazo?: string | null; fecha_cancelacion_rechazo?: string | null }

type Tab = 'form' | 'pedidos' | 'historial' | 'proveedores'

const ESTADO_ENTREGA_COLORS: Record<string, string> = {
  pendiente: '#f59e0b', parcial: '#3b82f6', completado: '#22c55e',
}

type ActionDef = { key: string; label: string; icon: React.ComponentType<{ size?: number }>; danger?: boolean }

const ACTIONS_BY_ESTADO: Record<string, ActionDef[]> = {
  'Borrador': [
    { key: 'marcar_enviado', label: 'Enviar al cliente', icon: Send },
  ],
  'Pendiente de enviar': [
    { key: 'marcar_enviado', label: 'Enviar al cliente', icon: Send },
  ],
  'Enviado al cliente': [
    { key: 'marcar_aceptado', label: 'Marcar aceptado', icon: CheckCircle2 },
    { key: 'cancelar', label: 'Cancelar', icon: XCircle, danger: true },
  ],
  'Aceptado - pendiente pedido proveedor': [
    { key: 'crear_pedido_proveedor', label: 'Crear pedido', icon: PackageCheck },
    { key: 'cancelar', label: 'Cancelar', icon: XCircle, danger: true },
  ],
  'Pedido proveedor realizado': [
    { key: 'confirmar_plazo', label: 'Confirmar plazo', icon: Truck },
    { key: 'bloquear', label: 'Bloquear', icon: ShieldAlert, danger: true },
  ],
  'Plazo proveedor confirmado': [
    { key: 'cerrar', label: 'Cerrar', icon: CheckCircle2 },
    { key: 'bloquear', label: 'Bloquear', icon: ShieldAlert, danger: true },
  ],
  'En preparación / fabricación': [
    { key: 'cerrar', label: 'Cerrar', icon: CheckCircle2 },
    { key: 'bloquear', label: 'Bloquear', icon: ShieldAlert, danger: true },
  ],
  'Entregado / cerrado': [],
  'Cancelado / rechazado': [],
  'Bloqueado / incidencia': [
    { key: 'cerrar', label: 'Cerrar', icon: CheckCircle2 },
  ],
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

  const availableActions = ACTIONS_BY_ESTADO[data.estado] || []

  async function save() {
    if (!data) return
    setSaveError(null)
    try {
      const dateFields = ['plazo_proveedor', 'fecha_prevista_entrega', 'fecha_envio_cliente', 'fecha_aceptacion', 'fecha_pedido_proveedor', 'fecha_limite_siguiente_accion', 'fecha_cancelacion_rechazo']
      const cleaned = { ...data }
      for (const f of dateFields) { if ((cleaned as any)[f] === '') (cleaned as any)[f] = null }
      const updated = await api.patch<Presupuesto>(`/presupuestos/${id}`, { ...cleaned, expected_version: cleaned.version })
      setData(updated); reload(); history.reload()
      toast.success('Presupuesto guardado')
    } catch (e) { setSaveError(e instanceof Error ? e.message : String(e)) }
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
      for (const f of dateFields) { if ((cleaned as any)[f] === '') (cleaned as any)[f] = null }
      const updated = await api.post<Presupuesto>(`/presupuestos/${id}/quick-action`, { ...cleaned, expected_version: data.version })
      setData(updated); setQuickAction(null); reload(); history.reload(); pedidos.reload()
      toast.success('Acción aplicada')
    } catch (e) { setSaveError(e instanceof Error ? e.message : String(e)) }
  }
  async function archiveBudget() {
    if (!data) return
    if (!archiveReason.trim()) { setSaveError('Indica el motivo de archivado.'); return }
    try {
      await api.post(`/presupuestos/${id}/archivar`, { motivo_archivado: archiveReason, expected_version: data.version })
      setShowArchive(false); history.reload(); reload()
      toast.success('Archivado')
    } catch (e) { setSaveError(e instanceof Error ? e.message : String(e)) }
  }
  async function savePedido(payload: Partial<PedidoProveedor>) {
    try {
      if (editingPedido) { await api.updatePedido(editingPedido.id, payload); toast.success('Pedido actualizado') }
      else { await api.createPedido(Number(id), payload); toast.success('Pedido creado') }
      setEditingPedido(null); setShowPedidoForm(false)
      pedidos.reload(); history.reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }
  async function deletePedido(pedidoId: number) {
    if (deleteConfirm !== pedidoId) { setDeleteConfirm(pedidoId); return }
    try { await api.deletePedido(pedidoId); pedidos.reload(); history.reload(); setDeleteConfirm(null); toast.success('Pedido eliminado') }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }

  const allPedidos = pedidos.data || data.pedidos || []

  return <>
    <PageHeader
      title={`${data.numero_presupuesto} · ${String(data.cliente || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`}
      subtitle={String(data.obra_referencia || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      actions={<Link className="btn secondary" to="/presupuestos"><ArrowLeft size={16}/>Volver</Link>}
    />

    {/* Summary Card */}
    <div className="bg-white border border-border rounded-xl p-4 mb-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <StateBadge value={data.estado} />
        <PriorityBadge value={data.prioridad_calculada} />
        <div className="flex items-center gap-2 text-sm">
          <span className="font-black text-2xl text-ink">{euro(data.importe)}</span>
        </div>
        <span className="text-xs text-ink-muted">v{data.version}</span>
        {data.archivado && <span className="badge danger">Archivado</span>}
        <button className="btn secondary small ml-auto" onClick={reload}><RefreshCw size={14}/></button>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-ink-muted">Gestor: <strong className="text-ink">{data.gestor || '—'}</strong></span>
        <span className="text-ink-muted">Responsable: <strong className="text-ink">{data.responsable_actual || '—'}</strong></span>
        {data.fecha_limite_siguiente_accion && (
          <span className="text-ink-muted">Límite: <strong className="text-ink">{fmtDate(data.fecha_limite_siguiente_accion)}</strong></span>
        )}
        <span className="text-ink-muted">Parado: <strong className="text-ink">{data.dias_parado}d</strong></span>
      </div>
      <PedidoSummaryBadge presupuesto={{ ...data, pedidos: allPedidos }} variant="detail" />
    </div>

    {/* Smart Actions */}
    {availableActions.length > 0 && (
      <div className="flex flex-wrap gap-2 mb-4">
        {availableActions.map(a => (
          <button key={a.key} className={`btn small ${a.danger ? 'danger' : 'secondary'}`} onClick={() => setQuickAction(a.key)}>
            <a.icon size={14} /> {a.label}
          </button>
        ))}
        <button className="btn secondary small" onClick={() => setShowArchive(true)}><Archive size={14}/>Archivar</button>
      </div>
    )}

    {saveError && <div className="error mb-4">{saveError}</div>}

    {/* Tabs */}
    <div className="border-b border-border mb-4 overflow-x-auto">
      <div className="flex min-w-max">
        <TabBtn active={activeTab === 'form'} onClick={() => setActiveTab('form')}>Datos</TabBtn>
        <TabBtn active={activeTab === 'pedidos'} onClick={() => setActiveTab('pedidos')}>
          <Package size={14}/>Pedidos {allPedidos.length > 0 ? `(${allPedidos.length})` : ''}
        </TabBtn>
        <TabBtn active={activeTab === 'historial'} onClick={() => setActiveTab('historial')}>Historial</TabBtn>
        <TabBtn active={activeTab === 'proveedores'} onClick={() => setActiveTab('proveedores')}><Users size={14}/>Proveedores</TabBtn>
      </div>
    </div>

    {/* Tab: Datos */}
    {activeTab === 'form' && (
      <div>
        <PresupuestoForm value={data} onChange={patch => setData({ ...data, ...patch })} onSubmit={save} />
        {/* Quick comment */}
        <div className="card mt-4">
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Nombre (opcional)" value={commentName} onChange={e => setCommentName(e.target.value)} />
            <button className="btn secondary" onClick={addComment} disabled={!comment.trim()}><MessageSquarePlus size={16}/></button>
          </div>
          <textarea className="mt-2 input" rows={3} style={{ width: '100%' }} placeholder="Añadir comentario..." value={comment} onChange={e => setComment(e.target.value)} />
        </div>
      </div>
    )}

    {/* Tab: Pedidos */}
    {activeTab === 'pedidos' && (
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ margin: 0 }}>Pedidos a Proveedor</h3>
          <button className="btn secondary small" onClick={() => { setEditingPedido(null); setShowPedidoForm(true) }}><Plus size={14}/>Nuevo pedido</button>
        </div>
        {allPedidos.length === 0 ? (
          <p className="muted text-center py-6">Sin pedidos registrados. Crea uno con el botón de arriba.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {allPedidos.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-3 bg-surface-panel rounded-lg border border-border">
                <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: ESTADO_ENTREGA_COLORS[p.estado_entrega] || '#9ca3af' }} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{p.proveedor}</div>
                  <div className="text-xs text-ink-muted">
                    {p.numero_pedido || 'Sin nº'} · {fmtDate(p.fecha_pedido)}
                    {p.fecha_entrega_prevista && ` · Prevista: ${fmtDate(p.fecha_entrega_prevista)}`}
                  </div>
                </div>
                <span className="text-sm font-semibold">{p.importe != null ? euro(p.importe) : '—'}</span>
                <span className="badge text-xs" style={{ color: ESTADO_ENTREGA_COLORS[p.estado_entrega] }}>{p.estado_entrega}</span>
                <div className="flex gap-1">
                  <button className="btn secondary small" onClick={() => { setEditingPedido(p); setShowPedidoForm(true) }}><Pencil size={12}/></button>
                  <button className="btn danger small" onClick={() => deletePedido(p.id)}><Trash2 size={12}/></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {/* Tab: Historial (comments + history unified) */}
    {activeTab === 'historial' && (
      <div className="card">
        <h3>Historial de cambios y comentarios</h3>
        <div className="timeline">
          {[...(history.data || []).map(h => ({ ...h, type: 'history' as const })), ...(comments.data || []).map(c => ({ ...c, type: 'comment' as const }))]
            .sort((a, b) => new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime())
            .map(item => (
              <div className="timeline-item" key={`${item.type}-${item.id}`}>
                <strong>{item.type === 'comment'
                  ? (item as Comentario).comentario
                  : (item as Historial).descripcion
                }</strong>
                <br/><small>{fmtDate(item.creado_en)} · {item.usuario_nombre || item.nombre_opcional || item.usuario_email || 'Sin nombre'}</small>
              </div>
            ))}
        </div>
      </div>
    )}

    {/* Modals */}
    {quickAction && <QuickActionModal action={quickAction} base={data} onClose={() => setQuickAction(null)} onSubmit={runQuick} />}
    {showArchive && (
      <Modal open onClose={() => setShowArchive(false)} title="Archivar presupuesto">
        <p className="muted mb-3">No se borra: queda oculto de las vistas normales y mantiene historial.</p>
        <textarea rows={4} value={archiveReason} onChange={e => setArchiveReason(e.target.value)} placeholder="Motivo de archivado..." style={{ width: '100%' }} />
        <div className="modal-actions">
          <button className="btn secondary" onClick={() => setShowArchive(false)}>Cancelar</button>
          <button className="btn danger" onClick={archiveBudget}>Archivar</button>
        </div>
      </Modal>
    )}
    {showPedidoForm && <PedidoFormModal pedido={editingPedido} onClose={() => { setShowPedidoForm(false); setEditingPedido(null) }} onSubmit={savePedido} />}
    {deleteConfirm !== null && (
      <Modal open onClose={() => setDeleteConfirm(null)} title="Eliminar pedido">
        <p className="muted mb-3">Esta acción no se puede deshacer. ¿Continuar?</p>
        <div className="modal-actions">
          <button className="btn secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
          <button className="btn danger" onClick={() => deletePedido(deleteConfirm)}>Eliminar</button>
        </div>
      </Modal>
    )}
    {activeTab === 'proveedores' && (
      <ProveedorList presupuestoId={Number(id)} presupuestoImporte={data.importe} />
    )}
  </>
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors duration-150 ${active ? 'border-brand text-ink font-semibold' : 'border-transparent text-ink-muted hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

function QuickActionModal({ action, base, onClose, onSubmit }: { action: string; base: Presupuesto; onClose: () => void; onSubmit: (payload: QuickPayload) => void }) {
  const { user } = useAuth()
  const metadataOptions = useMetadataOptions()
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
    <Modal open onClose={onClose} title={title[action] || 'Acción rápida'}>
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
          <Field label="Proveedor"><OptionInput className="input" options={metadataOptions.proveedores} value={payload.proveedor || ''} onChange={e => set('proveedor', e.target.value)} /></Field>
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
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>
}

function PedidoFormModal({ pedido, onClose, onSubmit }: { pedido: PedidoProveedor | null; onClose: () => void; onSubmit: (payload: Partial<PedidoProveedor>) => void }) {
  const metadataOptions = useMetadataOptions()
  const [form, setForm] = useState({
    proveedor: pedido?.proveedor || '',
    numero_pedido: pedido?.numero_pedido || '',
    fecha_pedido: pedido?.fecha_pedido || new Date().toISOString().slice(0, 10),
    importe: pedido?.importe != null ? String(pedido.importe) : '',
    estado_entrega: pedido?.estado_entrega || 'pendiente',
    fecha_entrega_prevista: pedido?.fecha_entrega_prevista || '',
    observaciones: pedido?.observaciones || '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const set = (k: string, v: string) => { setFormError(null); setForm(f => ({ ...f, [k]: v })) }

  function handleSubmit() {
    if (!form.proveedor.trim() || !form.numero_pedido.trim()) { setFormError('Proveedor y número de pedido son obligatorios.'); return }
    onSubmit({
      proveedor: form.proveedor, numero_pedido: form.numero_pedido, fecha_pedido: form.fecha_pedido,
      importe: form.importe ? parseFloat(form.importe) : null,
      estado_entrega: form.estado_entrega as 'pendiente' | 'parcial' | 'completado',
      fecha_entrega_prevista: form.fecha_entrega_prevista || null, observaciones: form.observaciones || null,
    })
  }

  return (
    <Modal open onClose={onClose} title={pedido ? 'Editar pedido' : 'Nuevo pedido proveedor'}>
      <div className="form-grid two">
        <Field label="Proveedor *"><OptionInput className="input" options={metadataOptions.proveedores} value={form.proveedor} onChange={e => set('proveedor', e.target.value)} placeholder="Nombre del proveedor" /></Field>
        <Field label="Nº Pedido *"><input className="input" value={form.numero_pedido} onChange={e => set('numero_pedido', e.target.value)} placeholder="Número de pedido" /></Field>
        <Field label="Fecha pedido"><input className="input" type="date" value={form.fecha_pedido} onChange={e => set('fecha_pedido', e.target.value)} /></Field>
        <Field label="Importe (€)"><input className="input" type="number" step="0.01" value={form.importe} onChange={e => set('importe', e.target.value)} placeholder="0.00" /></Field>
        <Field label="Estado entrega"><select className="input" value={form.estado_entrega} onChange={e => set('estado_entrega', e.target.value)}><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="completado">Completado</option></select></Field>
        <Field label="Fecha entrega prevista"><input className="input" type="date" value={form.fecha_entrega_prevista} onChange={e => set('fecha_entrega_prevista', e.target.value)} /></Field>
      </div>
      <Field label="Observaciones"><textarea className="input" rows={3} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Observaciones..." style={{ width: '100%' }} /></Field>
      {formError && <div className="error mt-2">{formError}</div>}
      <div className="modal-actions"><button className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn" onClick={handleSubmit}>{pedido ? 'Guardar' : 'Crear pedido'}</button></div>
    </Modal>
  )
}
