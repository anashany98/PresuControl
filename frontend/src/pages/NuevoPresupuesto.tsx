import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { api, ESTADOS, isoDate, type Presupuesto } from '../utils/api'
import { useToast } from '../utils/toast'

type Tab = 'datos' | 'seguimiento' | 'pedidos' | 'control'

export function NuevoPresupuesto() {
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('datos')
  const [form, setForm] = useState<Partial<Presupuesto> & { modificado_por?: string }>({
    estado: 'Pendiente de enviar',
    fecha_presupuesto: new Date().toISOString().slice(0,10),
    pedido_proveedor_realizado: false,
    incidencia: false,
  })
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof typeof form, value: any) => setForm(f => ({ ...f, [key]: value }))

  async function submit() {
    setError(null)
    try {
      const dateFields = ['fecha_envio_cliente', 'fecha_aceptacion', 'fecha_pedido_proveedor', 'plazo_proveedor', 'fecha_prevista_entrega', 'fecha_limite_siguiente_accion', 'fecha_cancelacion_rechazo']
      const cleaned = { ...form }
      for (const f of dateFields) {
        if ((cleaned as any)[f] === '') (cleaned as any)[f] = null
      }
      const created = await api.post<Presupuesto>('/presupuestos', cleaned)
      navigate(`/presupuestos/${created.id}`)
      toast.success('Presupuesto creado correctamente')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); toast.error('Error al crear') }
  }

  return <>
    <PageHeader title="Nuevo presupuesto" subtitle="Alta manual de presupuesto creado en FactuSOL." />
    {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}

    <div className="tabs" style={{ marginBottom: 16 }}>
      <button className={`tab ${tab === 'datos' ? 'active' : ''}`} onClick={() => setTab('datos')}>Datos</button>
      <button className={`tab ${tab === 'seguimiento' ? 'active' : ''}`} onClick={() => setTab('seguimiento')}>Seguimiento</button>
      <button className={`tab ${tab === 'pedidos' ? 'active' : ''}`} onClick={() => setTab('pedidos')}>Pedidos</button>
      <button className={`tab ${tab === 'control' ? 'active' : ''}`} onClick={() => setTab('control')}>Control</button>
    </div>

    {tab === 'datos' && <section className="card">
      <h3>A) Datos generales</h3>
      <div className="form-grid">
        <div className="field"><label>Nº presupuesto FactuSOL *</label><input className="input" value={form.numero_presupuesto || ''} onChange={e => set('numero_presupuesto', e.target.value)} /></div>
        <div className="field"><label>Cliente *</label><input className="input" value={form.cliente || ''} onChange={e => set('cliente', e.target.value)} /></div>
        <div className="field"><label>Obra / referencia *</label><input className="input" value={form.obra_referencia || ''} onChange={e => set('obra_referencia', e.target.value)} /></div>
        <div className="field"><label>Gestor *</label><input className="input" value={form.gestor || ''} onChange={e => set('gestor', e.target.value)} /></div>
        <div className="field"><label>Importe *</label><input className="input" type="number" step="0.01" value={form.importe ?? ''} onChange={e => set('importe', Number(e.target.value))} /></div>
        <div className="field"><label>Fecha presupuesto *</label><input className="input" type="date" value={isoDate(form.fecha_presupuesto)} onChange={e => set('fecha_presupuesto', e.target.value)} /></div>
      </div>
    </section>}

    {tab === 'seguimiento' && <section className="card">
      <h3>B) Seguimiento cliente</h3>
      <div className="form-grid">
        <div className="field"><label>Estado *</label><select className="select" value={form.estado || ''} onChange={e => set('estado', e.target.value)}><option value="">Seleccionar</option>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label>Fecha envío cliente</label><input className="input" type="date" value={isoDate(form.fecha_envio_cliente)} onChange={e => set('fecha_envio_cliente', e.target.value || null)} /></div>
        <div className="field"><label>Fecha aceptación</label><input className="input" type="date" value={isoDate(form.fecha_aceptacion)} onChange={e => set('fecha_aceptacion', e.target.value || null)} /></div>
        <div className="field"><label>Fecha cancelación / rechazo</label><input className="input" type="date" value={isoDate(form.fecha_cancelacion_rechazo)} onChange={e => set('fecha_cancelacion_rechazo', e.target.value || null)} /></div>
      </div>
      <div className="form-grid two" style={{ marginTop: 14 }}><div className="field"><label>Motivo cancelación / rechazo</label><textarea rows={3} value={form.motivo_cancelacion_rechazo || ''} onChange={e => set('motivo_cancelacion_rechazo', e.target.value)} /></div></div>
    </section>}

    {tab === 'pedidos' && <section className="card">
      <h3>C) Pedido proveedor</h3>
      <p className="muted" style={{ marginBottom: 14 }}>Después de crear el presupuesto puedes añadir pedidos desde la pestaña "Pedidos Proveedor".</p>
      <div className="form-grid">
        <div className="field"><label>Proveedor</label><input className="input" value={form.proveedor || ''} onChange={e => set('proveedor', e.target.value)} /></div>
        <div className="field"><label>Pedido proveedor realizado</label><select className="select" value={form.pedido_proveedor_realizado ? 'true' : 'false'} onChange={e => set('pedido_proveedor_realizado', e.target.value === 'true')}><option value="false">No</option><option value="true">Sí</option></select></div>
        <div className="field"><label>Nº pedido proveedor</label><input className="input" value={form.numero_pedido_proveedor || ''} onChange={e => set('numero_pedido_proveedor', e.target.value)} /></div>
        <div className="field"><label>Fecha pedido proveedor</label><input className="input" type="date" value={isoDate(form.fecha_pedido_proveedor)} onChange={e => set('fecha_pedido_proveedor', e.target.value || null)} /></div>
        <div className="field"><label>Plazo proveedor confirmado</label><input className="input" type="date" value={isoDate(form.plazo_proveedor)} onChange={e => set('plazo_proveedor', e.target.value || null)} /></div>
        <div className="field"><label>Fecha prevista entrega</label><input className="input" type="date" value={isoDate(form.fecha_prevista_entrega)} onChange={e => set('fecha_prevista_entrega', e.target.value || null)} /></div>
      </div>
    </section>}

    {tab === 'control' && <section className="card">
      <h3>D) Control interno</h3>
      <div className="form-grid two">
        <div className="field"><label>Responsable actual</label><input className="input" value={form.responsable_actual || ''} onChange={e => set('responsable_actual', e.target.value)} /></div>
        <div className="field"><label>Fecha límite siguiente acción</label><input className="input" type="date" value={isoDate(form.fecha_limite_siguiente_accion)} onChange={e => set('fecha_limite_siguiente_accion', e.target.value || null)} /></div>
        <div className="field"><label>Siguiente acción</label><input className="input" value={form.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} /></div>
        <div className="field"><label>Incidencia</label><select className="select" value={form.incidencia ? 'true' : 'false'} onChange={e => set('incidencia', e.target.value === 'true')}><option value="false">No</option><option value="true">Sí</option></select></div>
      </div>
      <div className="form-grid two" style={{ marginTop: 14 }}>
        <div className="field"><label>Descripción incidencia</label><textarea rows={4} value={form.descripcion_incidencia || ''} onChange={e => set('descripcion_incidencia', e.target.value)} /></div>
        <div className="field"><label>Observaciones internas</label><textarea rows={4} value={form.observaciones || ''} onChange={e => set('observaciones', e.target.value)} /></div>
      </div>
      <div className="form-grid two" style={{ marginTop: 14 }}><div className="field"><label>Modificado por / creado por</label><input className="input" value={form.modificado_por || ''} onChange={e => set('modificado_por', e.target.value)} placeholder="Opcional" /></div></div>
    </section>}

    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
      <button className="btn" onClick={submit}>Crear presupuesto</button>
    </div>
  </>
}