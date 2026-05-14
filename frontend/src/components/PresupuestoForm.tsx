import type { ReactNode } from 'react'
import { Save } from 'lucide-react'
import { ESTADOS, isoDate, type Presupuesto } from '../utils/api'

type FormValue = Partial<Presupuesto> & { modificado_por?: string }

export function PresupuestoForm({ value, onChange, onSubmit, submitLabel = 'Guardar' }: {
  value: FormValue
  onChange: (patch: Partial<FormValue>) => void
  onSubmit: () => void
  submitLabel?: string
}) {
  const set = (key: keyof FormValue, raw: string | boolean | number | null) => onChange({ [key]: raw } as Partial<FormValue>)
  return (
    <div className="grid" style={{ gap: 18 }}>
      <section className="card">
        <h3>A) Datos generales</h3>
        <div className="form-grid">
          <Field label="Nº presupuesto FactuSOL *"><input className="input" value={value.numero_presupuesto || ''} onChange={e => set('numero_presupuesto', e.target.value)} /></Field>
          <Field label="Cliente *"><input className="input" value={value.cliente || ''} onChange={e => set('cliente', e.target.value)} /></Field>
          <Field label="Obra / referencia *"><input className="input" value={value.obra_referencia || ''} onChange={e => set('obra_referencia', e.target.value)} /></Field>
          <Field label="Gestor *"><input className="input" value={value.gestor || ''} onChange={e => set('gestor', e.target.value)} /></Field>
          <Field label="Importe *"><input className="input" type="number" step="0.01" value={value.importe ?? ''} onChange={e => set('importe', Number(e.target.value))} /></Field>
          <Field label="Fecha presupuesto *"><input className="input" type="date" value={isoDate(value.fecha_presupuesto)} onChange={e => set('fecha_presupuesto', e.target.value)} /></Field>
        </div>
      </section>

      <section className="card">
        <h3>B) Seguimiento cliente</h3>
        <div className="form-grid">
          <Field label="Estado *"><select className="select" value={value.estado || ''} onChange={e => set('estado', e.target.value)}><option value="">Seleccionar</option>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Fecha envío cliente"><input className="input" type="date" value={isoDate(value.fecha_envio_cliente)} onChange={e => set('fecha_envio_cliente', e.target.value || null)} /></Field>
          <Field label="Fecha aceptación"><input className="input" type="date" value={isoDate(value.fecha_aceptacion)} onChange={e => set('fecha_aceptacion', e.target.value || null)} /></Field>
          <Field label="Fecha cancelación / rechazo"><input className="input" type="date" value={isoDate(value.fecha_cancelacion_rechazo)} onChange={e => set('fecha_cancelacion_rechazo', e.target.value || null)} /></Field>
        </div>
        <div className="form-grid two" style={{ marginTop: 14 }}>
          <Field label="Motivo cancelación / rechazo"><textarea rows={3} value={value.motivo_cancelacion_rechazo || ''} onChange={e => set('motivo_cancelacion_rechazo', e.target.value)} /></Field>
        </div>
      </section>

      <section className="card">
        <h3>C) Pedido proveedor</h3>
        <div className="form-grid">
          <Field label="Proveedor"><input className="input" value={value.proveedor || ''} onChange={e => set('proveedor', e.target.value)} /></Field>
          <Field label="Pedido proveedor realizado"><select className="select" value={value.pedido_proveedor_realizado ? 'true' : 'false'} onChange={e => set('pedido_proveedor_realizado', e.target.value === 'true')}><option value="false">No</option><option value="true">Sí</option></select></Field>
          <Field label="Nº pedido proveedor"><input className="input" value={value.numero_pedido_proveedor || ''} onChange={e => set('numero_pedido_proveedor', e.target.value)} /></Field>
          <Field label="Fecha pedido proveedor"><input className="input" type="date" value={isoDate(value.fecha_pedido_proveedor)} onChange={e => set('fecha_pedido_proveedor', e.target.value || null)} /></Field>
          <Field label="Plazo proveedor confirmado"><input className="input" type="date" value={isoDate(value.plazo_proveedor)} onChange={e => set('plazo_proveedor', e.target.value || null)} /></Field>
          <Field label="Fecha prevista entrega"><input className="input" type="date" value={isoDate(value.fecha_prevista_entrega)} onChange={e => set('fecha_prevista_entrega', e.target.value || null)} /></Field>
        </div>
      </section>

      <section className="card">
        <h3>D) Control interno</h3>
        <div className="form-grid two">
          <Field label="Responsable actual"><input className="input" value={value.responsable_actual || ''} onChange={e => set('responsable_actual', e.target.value)} /></Field>
          <Field label="Fecha límite siguiente acción"><input className="input" type="date" value={isoDate(value.fecha_limite_siguiente_accion)} onChange={e => set('fecha_limite_siguiente_accion', e.target.value || null)} /></Field>
          <Field label="Siguiente acción"><input className="input" value={value.siguiente_accion || ''} onChange={e => set('siguiente_accion', e.target.value)} /></Field>
          <Field label="Incidencia"><select className="select" value={value.incidencia ? 'true' : 'false'} onChange={e => set('incidencia', e.target.value === 'true')}><option value="false">No</option><option value="true">Sí</option></select></Field>
        </div>
        <div className="form-grid two" style={{ marginTop: 14 }}>
          <Field label="Descripción incidencia"><textarea rows={4} value={value.descripcion_incidencia || ''} onChange={e => set('descripcion_incidencia', e.target.value)} /></Field>
          <Field label="Observaciones internas"><textarea rows={4} value={value.observaciones || ''} onChange={e => set('observaciones', e.target.value)} /></Field>
        </div>
        <div className="form-grid two" style={{ marginTop: 14 }}>
          <Field label="Modificado por / creado por"><input className="input" value={value.modificado_por || ''} onChange={e => set('modificado_por', e.target.value)} placeholder="Opcional; si hay login se guarda automáticamente" /></Field>
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onSubmit}><Save size={17} />{submitLabel}</button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>
}
