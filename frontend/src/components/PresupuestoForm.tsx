import type { ReactNode } from 'react'
import { Save, AlertCircle } from 'lucide-react'
import { ESTADOS, isoDate, type Presupuesto } from '../utils/api'
import { useFormValidation } from '../utils/useFormValidation'

type FormValue = Partial<Presupuesto> & { modificado_por?: string }

const RULES = [
  { field: 'numero_presupuesto', validate: (v: any) => !v?.trim() ? 'El nº presupuesto es obligatorio' : null },
  { field: 'cliente', validate: (v: any) => !v?.trim() ? 'El cliente es obligatorio' : null },
  { field: 'obra_referencia', validate: (v: any) => !v?.trim() ? 'La obra/referencia es obligatoria' : null },
  { field: 'gestor', validate: (v: any) => !v?.trim() ? 'El gestor es obligatorio' : null },
  { field: 'importe', validate: (v: any) => (!v && v !== 0) ? 'El importe es obligatorio' : Number(v) <= 0 ? 'El importe debe ser mayor que 0' : null },
  { field: 'fecha_presupuesto', validate: (v: any) => !v ? 'La fecha presupuesto es obligatoria' : null },
  { field: 'estado', validate: (v: any) => !v ? 'El estado es obligatorio' : null },
  { field: 'fecha_aceptacion', validate: (v: any, all: any) => all?.estado === 'Aceptado - pendiente pedido proveedor' && !v ? 'La fecha de aceptación es obligatoria para estado aceptado' : null },
  { field: 'proveedor', validate: (v: any, all: any) => (all?.pedido_proveedor_realizado || all?.estado === 'Pedido proveedor realizado') && !v ? 'El proveedor es obligatorio cuando hay pedido' : null },
]

function Field({ label, children, error, required }: { label: string; children: ReactNode; error?: string | null; required?: boolean }) {
  return (
    <div className={`field${error ? ' field-error' : ''}`}>
      <label>
        {label}
        {required && <span className="required-mark"> *</span>}
      </label>
      {children}
      {error && <span className="field-error-msg"><AlertCircle size={12} /> {error}</span>}
    </div>
  )
}

export function PresupuestoForm({ value, onChange, onSubmit, submitLabel = 'Guardar' }: {
  value: FormValue
  onChange: (patch: Partial<FormValue>) => void
  onSubmit: () => void
  submitLabel?: string
}) {
  const { errors, validateField } = useFormValidation(RULES)

  const set = (key: keyof FormValue, raw: string | boolean | number | null) => {
    onChange({ [key]: raw } as Partial<FormValue>)
    validateField(key as string, raw, value)
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <section className="card">
        <h3>A) Datos generales</h3>
        <div className="form-grid">
          <Field label="Nº presupuesto FactuSOL *" required error={errors.numero_presupuesto}><input className="input" value={value.numero_presupuesto || ''} onChange={e => set('numero_presupuesto', e.target.value)} onBlur={e => validateField('numero_presupuesto', e.target.value)} /></Field>
          <Field label="Cliente *" required error={errors.cliente}><input className="input" value={value.cliente || ''} onChange={e => set('cliente', e.target.value)} onBlur={e => validateField('cliente', e.target.value)} /></Field>
          <Field label="Obra / referencia *" required error={errors.obra_referencia}><input className="input" value={value.obra_referencia || ''} onChange={e => set('obra_referencia', e.target.value)} onBlur={e => validateField('obra_referencia', e.target.value)} /></Field>
          <Field label="Gestor *" required error={errors.gestor}><input className="input" value={value.gestor || ''} onChange={e => set('gestor', e.target.value)} onBlur={e => validateField('gestor', e.target.value)} /></Field>
          <Field label="Importe *" required error={errors.importe}><input className="input" type="number" step="0.01" value={value.importe ?? ''} onChange={e => set('importe', Number(e.target.value))} onBlur={e => validateField('importe', Number(e.target.value))} /></Field>
          <Field label="Fecha presupuesto *" required error={errors.fecha_presupuesto}><input className="input" type="date" value={isoDate(value.fecha_presupuesto)} onChange={e => set('fecha_presupuesto', e.target.value)} onBlur={e => validateField('fecha_presupuesto', e.target.value)} /></Field>
        </div>
      </section>

      <section className="card">
        <h3>B) Seguimiento cliente</h3>
        <div className="form-grid">
          <Field label="Estado *" required error={errors.estado}><select className="select" value={value.estado || ''} onChange={e => set('estado', e.target.value)} onBlur={e => validateField('estado', e.target.value)}><option value="">Seleccionar</option>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Fecha envío cliente"><input className="input" type="date" value={isoDate(value.fecha_envio_cliente)} onChange={e => set('fecha_envio_cliente', e.target.value || null)} /></Field>
          <Field label="Fecha aceptación" error={errors.fecha_aceptacion}><input className="input" type="date" value={isoDate(value.fecha_aceptacion)} onChange={e => set('fecha_aceptacion', e.target.value || null)} onBlur={e => validateField('fecha_aceptacion', e.target.value)} /></Field>
          <Field label="Fecha cancelación / rechazo"><input className="input" type="date" value={isoDate(value.fecha_cancelacion_rechazo)} onChange={e => set('fecha_cancelacion_rechazo', e.target.value || null)} /></Field>
        </div>
        <div className="form-grid two" style={{ marginTop: 14 }}>
          <Field label="Motivo cancelación / rechazo"><textarea rows={3} value={value.motivo_cancelacion_rechazo || ''} onChange={e => set('motivo_cancelacion_rechazo', e.target.value)} /></Field>
        </div>
      </section>

      <section className="card">
        <h3>C) Pedido proveedor</h3>
        <div className="form-grid">
          <Field label="Proveedor" error={errors.proveedor}><input className="input" value={value.proveedor || ''} onChange={e => set('proveedor', e.target.value)} onBlur={e => validateField('proveedor', e.target.value)} /></Field>
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