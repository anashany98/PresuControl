import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, Save } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { OptionInput } from '../components/OptionInput'
import { api, ESTADOS, isoDate, type Presupuesto } from '../utils/api'
import { useToast } from '../utils/toast'
import { useMetadataOptions } from '../utils/useMetadataOptions'

type SectionKey = 'seguimiento' | 'pedidos' | 'control'

export function NuevoPresupuesto() {
  const navigate = useNavigate()
  const toast = useToast()
  const metadataOptions = useMetadataOptions()
  const [form, setForm] = useState<Partial<Presupuesto> & { modificado_por?: string }>({
    estado: 'Pendiente de enviar',
    fecha_presupuesto: new Date().toISOString().slice(0, 10),
    pedido_proveedor_realizado: false,
    incidencia: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({ seguimiento: false, pedidos: false, control: false })
  const [saving, setSaving] = useState(false)

  const set = (key: keyof typeof form, value: any) => {
    setForm(f => ({ ...f, [key]: value }))
    setFieldErrors(prev => ({ ...prev, [key]: '' }))
  }
  const toggle = (s: SectionKey) => setExpanded(e => ({ ...e, [s]: !e[s] }))

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!(form.numero_presupuesto || '').trim()) errs.numero_presupuesto = 'Obligatorio'
    if (!(form.cliente || '').trim()) errs.cliente = 'Obligatorio'
    if (!(form.obra_referencia || '').trim()) errs.obra_referencia = 'Obligatorio'
    if (!(form.gestor || '').trim()) errs.gestor = 'Obligatorio'
    if (!form.importe && form.importe !== 0) errs.importe = 'Obligatorio'
    else if (Number(form.importe) <= 0) errs.importe = 'Debe ser > 0'
    if (!form.fecha_presupuesto) errs.fecha_presupuesto = 'Obligatorio'
    if (!form.estado) errs.estado = 'Obligatorio'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function submit() {
    setError(null)
    if (!validate()) return
    setSaving(true)
    try {
      const dateFields = ['fecha_envio_cliente', 'fecha_aceptacion', 'fecha_pedido_proveedor', 'plazo_proveedor', 'fecha_prevista_entrega', 'fecha_limite_siguiente_accion', 'fecha_cancelacion_rechazo']
      const cleaned = { ...form }
      for (const f of dateFields) { if ((cleaned as any)[f] === '') (cleaned as any)[f] = null }
      const created = await api.post<Presupuesto>('/presupuestos', cleaned)
      navigate(`/presupuestos/${created.id}`)
      toast.success('Presupuesto creado correctamente')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const hasFieldError = (key: string) => fieldErrors[key] ? 'field-error' : ''

  return <>
    <PageHeader title="Nuevo presupuesto" subtitle="Campos obligatorios marcados con *" />

    {error && <div className="error mb-4">{error}</div>}

    {/* ── Obligatorio: Datos generales ── */}
    <div className="card mb-4">
      <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">Datos obligatorios</h3>
      <div className="form-grid">
        <div className={`field ${hasFieldError('numero_presupuesto')}`}>
          <label>Nº presupuesto *</label>
          <input className="input" value={form.numero_presupuesto || ''} onChange={e => set('numero_presupuesto', e.target.value)} placeholder="PRE-2024-001" autoFocus />
          {fieldErrors.numero_presupuesto && <span className="field-error-msg">{fieldErrors.numero_presupuesto}</span>}
        </div>
        <div className={`field ${hasFieldError('cliente')}`}>
          <label>Cliente *</label>
          <input className="input" value={form.cliente || ''} onChange={e => set('cliente', e.target.value)} placeholder="Nombre del cliente" />
          {fieldErrors.cliente && <span className="field-error-msg">{fieldErrors.cliente}</span>}
        </div>
        <div className={`field ${hasFieldError('obra_referencia')}`}>
          <label>Obra / referencia *</label>
          <input className="input" value={form.obra_referencia || ''} onChange={e => set('obra_referencia', e.target.value)} placeholder="Nombre de la obra" />
          {fieldErrors.obra_referencia && <span className="field-error-msg">{fieldErrors.obra_referencia}</span>}
        </div>
        <div className={`field ${hasFieldError('gestor')}`}>
          <label>Gestor *</label>
          <OptionInput className="input" options={metadataOptions.gestores} value={form.gestor || ''} onChange={e => set('gestor', e.target.value)} placeholder="Seleccionar gestor" />
          {fieldErrors.gestor && <span className="field-error-msg">{fieldErrors.gestor}</span>}
        </div>
        <div className={`field ${hasFieldError('importe')}`}>
          <label>Importe (€) *</label>
          <input className="input" type="number" step="0.01" value={form.importe ?? ''} onChange={e => set('importe', Number(e.target.value))} placeholder="0.00" />
          {fieldErrors.importe && <span className="field-error-msg">{fieldErrors.importe}</span>}
        </div>
        <div className={`field ${hasFieldError('fecha_presupuesto')}`}>
          <label>Fecha presupuesto *</label>
          <input className="input" type="date" value={isoDate(form.fecha_presupuesto)} onChange={e => set('fecha_presupuesto', e.target.value)} />
          {fieldErrors.fecha_presupuesto && <span className="field-error-msg">{fieldErrors.fecha_presupuesto}</span>}
        </div>
        <div className={`field ${hasFieldError('estado')}`}>
          <label>Estado *</label>
          <select className="select" value={form.estado || ''} onChange={e => set('estado', e.target.value)}>
            <option value="">Seleccionar</option>
            {ESTADOS.map(s => <option key={s}>{s}</option>)}
          </select>
          {fieldErrors.estado && <span className="field-error-msg">{fieldErrors.estado}</span>}
        </div>
      </div>
    </div>

    {/* ── Opcional: Seguimiento ── */}
    <CollapsibleSection title="Seguimiento cliente" expanded={expanded.seguimiento} onToggle={() => toggle('seguimiento')}>
      <div className="form-grid">
        <div className="field"><label>Fecha envío cliente</label><input className="input" type="date" value={isoDate(form.fecha_envio_cliente)} onChange={e => set('fecha_envio_cliente', e.target.value || null)} /></div>
        <div className="field"><label>Fecha aceptación</label><input className="input" type="date" value={isoDate(form.fecha_aceptacion)} onChange={e => set('fecha_aceptacion', e.target.value || null)} /></div>
        <div className="field"><label>Fecha cancelación</label><input className="input" type="date" value={isoDate(form.fecha_cancelacion_rechazo)} onChange={e => set('fecha_cancelacion_rechazo', e.target.value || null)} /></div>
      </div>
      <div className="mt-3"><div className="field"><label>Motivo cancelación</label><textarea rows={2} value={form.motivo_cancelacion_rechazo || ''} onChange={e => set('motivo_cancelacion_rechazo', e.target.value)} style={{ width: '100%' }} /></div></div>
    </CollapsibleSection>

    {/* ── Opcional: Pedido proveedor ── */}
    <CollapsibleSection title="Pedido proveedor" expanded={expanded.pedidos} onToggle={() => toggle('pedidos')}>
      <p className="muted text-xs mb-3">Después de crear el presupuesto puedes añadir pedidos desde la pestaña "Pedidos" del detalle.</p>
      <div className="form-grid">
        <div className="field"><label>Proveedor</label><OptionInput className="input" options={metadataOptions.proveedores} value={form.proveedor || ''} onChange={e => set('proveedor', e.target.value)} /></div>
        <div className="field"><label>Nº pedido proveedor</label><input className="input" value={form.numero_pedido_proveedor || ''} onChange={e => set('numero_pedido_proveedor', e.target.value)} /></div>
        <div className="field"><label>Fecha pedido</label><input className="input" type="date" value={isoDate(form.fecha_pedido_proveedor)} onChange={e => set('fecha_pedido_proveedor', e.target.value || null)} /></div>
        <div className="field"><label>Plazo proveedor</label><input className="input" type="date" value={isoDate(form.plazo_proveedor)} onChange={e => set('plazo_proveedor', e.target.value || null)} /></div>
        <div className="field"><label>Fecha prevista entrega</label><input className="input" type="date" value={isoDate(form.fecha_prevista_entrega)} onChange={e => set('fecha_prevista_entrega', e.target.value || null)} /></div>
      </div>
    </CollapsibleSection>

    {/* ── Opcional: Control interno ── */}
    <CollapsibleSection title="Control interno" expanded={expanded.control} onToggle={() => toggle('control')}>
      <div className="form-grid">
        <div className="field"><label>Responsable actual</label><input className="input" value={form.responsable_actual || ''} onChange={e => set('responsable_actual', e.target.value)} /></div>
        <div className="field"><label>Fecha límite</label><input className="input" type="date" value={isoDate(form.fecha_limite_siguiente_accion)} onChange={e => set('fecha_limite_siguiente_accion', e.target.value || null)} /></div>
        <div className="field"><label>Siguiente acción</label><input className="input" value={form.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} /></div>
        <div className="field"><label>Incidencia</label><select className="select" value={form.incidencia ? 'true' : 'false'} onChange={e => set('incidencia', e.target.value === 'true')}><option value="false">No</option><option value="true">Sí</option></select></div>
      </div>
      <div className="form-grid two mt-3">
        <div className="field"><label>Descripción incidencia</label><textarea rows={3} value={form.descripcion_incidencia || ''} onChange={e => set('descripcion_incidencia', e.target.value)} style={{ width: '100%' }} /></div>
        <div className="field"><label>Observaciones</label><textarea rows={3} value={form.observaciones || ''} onChange={e => set('observaciones', e.target.value)} style={{ width: '100%' }} /></div>
      </div>
    </CollapsibleSection>

    <div className="flex justify-end mt-4">
      <button className="btn" onClick={submit} disabled={saving}>
        <Save size={17} /> {saving ? 'Creando...' : 'Crear presupuesto'}
      </button>
    </div>
  </>
}

function CollapsibleSection({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="card mb-4">
      <button
        className="flex items-center gap-2 w-full text-left cursor-pointer"
        onClick={onToggle}
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit' }}
      >
        {expanded ? <ChevronDown size={16} className="text-ink-muted" /> : <ChevronRight size={16} className="text-ink-muted" />}
        <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">{title}</h3>
        <span className="text-xs text-ink-muted ml-auto">{expanded ? 'Ocultar' : 'Mostrar'}</span>
      </button>
      {expanded && <div className="mt-3">{children}</div>}
    </div>
  )
}
