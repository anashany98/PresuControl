import { type ReactNode, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { api, type Settings } from '../utils/api'
import { useData } from '../utils/useData'

export function Configuracion() {
  const { data, loading, error, setData } = useData<Settings>(() => api.get('/settings'), [])
  const [msg, setMsg] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState<string | null>(null)
  if (loading) return <div className="card">Cargando configuración...</div>
  if (error || !data) return <div className="error">{error || 'Error'}</div>
  const set = (key: keyof Settings, value: any) => setData({ ...data, [key]: value })
  async function save() {
    const updated = await api.put<Settings>('/settings', data)
    setData(updated); setMsg('Configuración guardada.')
  }
  async function sendTest() {
    setTestEmail(null)
    try {
      const res = await api.post<any>('/email/test', {})
      setTestEmail(res.sent ? 'Email de prueba enviado.' : `No enviado: ${res.reason || 'revisa SMTP/destinatarios'}`)
    } catch (e) { setTestEmail(e instanceof Error ? e.message : String(e)) }
  }
  return <>
    <PageHeader title="Configuración básica" subtitle="Listas, umbrales y avisos por email. Los usuarios no tienen roles ni permisos diferenciados." actions={<button className="btn" onClick={save}>Guardar configuración</button>} />
    {msg && <div className="success" style={{ marginBottom: 14 }}>{msg}</div>}
    <div className="sections">
      <ListEditor title="Estados" value={data.estados} onChange={v => set('estados', v)} />
      <ListEditor title="Gestores" value={data.gestores} onChange={v => set('gestores', v)} />
      <ListEditor title="Proveedores" value={data.proveedores} onChange={v => set('proveedores', v)} />
      <ListEditor title="Tipos de incidencia" value={data.tipos_incidencia} onChange={v => set('tipos_incidencia', v)} />
    </div>
    <section className="card" style={{ marginTop: 16 }}><h3>Umbrales de aviso</h3><div className="form-grid">
      <Field label="Días para considerar crítico aceptado sin pedido"><input className="input" type="number" value={data.dias_critico_aceptado_sin_pedido} onChange={e => set('dias_critico_aceptado_sin_pedido', Number(e.target.value))} /></Field>
      <Field label="Días para considerar vencido seguimiento comercial"><input className="input" type="number" value={data.dias_vencido_seguimiento_comercial} onChange={e => set('dias_vencido_seguimiento_comercial', Number(e.target.value))} /></Field>
      <Field label="Días para avisar pedido proveedor sin plazo"><input className="input" type="number" value={data.dias_aviso_pedido_sin_plazo} onChange={e => set('dias_aviso_pedido_sin_plazo', Number(e.target.value))} /></Field>
      <Field label="Días sin actualizar para aviso"><input className="input" type="number" value={data.dias_sin_actualizar_aviso} onChange={e => set('dias_sin_actualizar_aviso', Number(e.target.value))} /></Field>
    </div></section>

    <section className="card" style={{ marginTop: 16 }}>
      <h3>Avisos por email</h3>
      <div className="form-grid two">
        <Field label="Activar avisos por email"><select className="select" value={data.email_avisos_activo ? 'true' : 'false'} onChange={e => set('email_avisos_activo', e.target.value === 'true')}><option value="false">No</option><option value="true">Sí</option></select></Field>
        <Field label="Enviar críticos inmediatos"><select className="select" value={data.enviar_email_criticos_inmediato ? 'true' : 'false'} onChange={e => set('enviar_email_criticos_inmediato', e.target.value === 'true')}><option value="false">No</option><option value="true">Sí</option></select></Field>
        <Field label="Asunto email avisos"><input className="input" value={data.asunto_email_avisos} onChange={e => set('asunto_email_avisos', e.target.value)} /></Field>
        <Field label="Destinatarios"><textarea rows={4} value={data.emails_destino_avisos.join('\n')} onChange={e => set('emails_destino_avisos', e.target.value.split('\n').map(x => x.trim()).filter(Boolean))} placeholder="compras@empresa.com\nadministracion@empresa.com" /></Field>
      </div>
      <hr className="soft-separator" />
      <h3>Automatización y escalado</h3>
      <div className="form-grid two">
        <Field label="Activar avisos automáticos"><select className="select" value={data.avisos_automaticos_activos ? 'true' : 'false'} onChange={e => set('avisos_automaticos_activos', e.target.value === 'true')}><option value="false">No</option><option value="true">Sí</option></select></Field>
        <Field label="Resumen diario automático"><select className="select" value={data.resumen_diario_automatico_activo ? 'true' : 'false'} onChange={e => set('resumen_diario_automatico_activo', e.target.value === 'true')}><option value="false">No</option><option value="true">Sí</option></select></Field>
        <Field label="Hora resumen diario"><input className="input" value={data.hora_resumen_diario} onChange={e => set('hora_resumen_diario', e.target.value)} placeholder="08:30" /></Field>
        <Field label="Revisar avisos cada X minutos"><input className="input" type="number" value={data.intervalo_revision_avisos_minutos} onChange={e => set('intervalo_revision_avisos_minutos', Number(e.target.value))} /></Field>
        <Field label="Escalado automático"><select className="select" value={data.escalado_automatico_activo ? 'true' : 'false'} onChange={e => set('escalado_automatico_activo', e.target.value === 'true')}><option value="false">No</option><option value="true">Sí</option></select></Field>
        <Field label="Emails de escalado"><textarea rows={4} value={data.emails_escalado_avisos.join('\n')} onChange={e => set('emails_escalado_avisos', e.target.value.split('\n').map(x => x.trim()).filter(Boolean))} placeholder="direccion@empresa.com\nresponsable@empresa.com" /></Field>
        <Field label="Escalado nivel 1 después de X horas"><input className="input" type="number" value={data.horas_escalado_nivel_1} onChange={e => set('horas_escalado_nivel_1', Number(e.target.value))} /></Field>
        <Field label="Escalado nivel 2 después de X horas"><input className="input" type="number" value={data.horas_escalado_nivel_2} onChange={e => set('horas_escalado_nivel_2', Number(e.target.value))} /></Field>
        <Field label="Escalado nivel 3 después de X horas"><input className="input" type="number" value={data.horas_escalado_nivel_3} onChange={e => set('horas_escalado_nivel_3', Number(e.target.value))} /></Field>
      </div>
      <p className="muted">El servidor SMTP se configura en el archivo .env. Aquí defines destinatarios, resumen diario y escalado si nadie actualiza el presupuesto.</p>
      <button className="btn secondary small" onClick={sendTest}>Enviar email de prueba</button>
      {testEmail && <div className={testEmail.startsWith('Email') ? 'success' : 'notice'} style={{ marginTop: 12 }}>{testEmail}</div>}
    </section>
  </>
}

function ListEditor({ title, value, onChange }: { title: string; value: string[]; onChange: (v: string[]) => void }) {
  return <section className="card"><h3>{title}</h3><textarea rows={8} value={value.join('\n')} onChange={e => onChange(e.target.value.split('\n').map(x => x.trim()).filter(Boolean))}/><p className="muted">Una opción por línea.</p></section>
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="field"><label>{label}</label>{children}</div> }
