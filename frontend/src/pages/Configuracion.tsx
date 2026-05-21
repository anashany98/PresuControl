import { type ReactNode, useState } from 'react'
import { Settings, Mail, Shield, Server } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { api, type Settings as SettingsType } from '../utils/api'
import { useData } from '../utils/useData'

type Tab = 'general' | 'smtp' | 'seguridad' | 'sistema'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'general', label: 'General', icon: <Settings size={15} /> },
  { id: 'smtp', label: 'SMTP', icon: <Mail size={15} /> },
  { id: 'seguridad', label: 'Seguridad', icon: <Shield size={15} /> },
  { id: 'sistema', label: 'Sistema', icon: <Server size={15} /> },
]

export function Configuracion() {
  const { data, loading, error, setData } = useData<SettingsType>(() => api.get('/settings'), [])
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [msg, setMsg] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState<string | null>(null)

  if (loading) return <div className="card">Cargando configuración...</div>
  if (error || !data) return <div className="error">{error || 'Error'}</div>

  const set = (key: keyof SettingsType, value: unknown) => setData({ ...data, [key]: value })

  async function save() {
    const updated = await api.put<SettingsType>('/settings', data)
    setData(updated)
    setMsg('Configuración guardada.')
  }

  async function sendTest() {
    setTestEmail(null)
    try {
      const res = await api.post<{ sent: boolean; reason?: string }>('/email/test', {})
      setTestEmail(res.sent ? 'Email de prueba enviado.' : `No enviado: ${res.reason || 'revisa SMTP/destinatarios'}`)
    } catch (e) {
      setTestEmail(e instanceof Error ? e.message : String(e))
    }
  }

  function ListEditor({ title, value, onChange }: { title: string; value: string[]; onChange: (v: string[]) => void }) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <h3>{title}</h3>
        <textarea rows={6} className="input" value={value.join('\n')} onChange={e => onChange(e.target.value.split('\n').map(x => x.trim()).filter(Boolean))} />
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Una opción por línea.</p>
      </div>
    )
  }

  function Field({ label, children }: { label: string; children: ReactNode }) {
    return <div className="field"><label>{label}</label>{children}</div>
  }

  function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
    return <Field label={label}>
      <select className="select" value={value ? 'true' : 'false'} onChange={e => onChange(e.target.value === 'true')}>
        <option value="false">No</option>
        <option value="true">Sí</option>
      </select>
    </Field>
  }

  return (
    <>
      <PageHeader title="Configuración" subtitle="General, correo, seguridad y sistema" actions={<button className="btn" onClick={save}>Guardar configuración</button>} />
      {msg && <div className="success" style={{ marginBottom: 14 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #111827' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? '#111827' : '#6b7280',
              borderRadius: '8px 8px 0 0',
              marginBottom: -1,
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <>
          <section className="card">
            <h3 style={{ marginBottom: 14 }}>General</h3>
            <div className="form-grid two">
              <Field label="Timezone">
                <input className="input" value={data.timezone} disabled />
              </Field>
              <Field label="URL pública">
                <input className="input" value={data.public_url} disabled />
              </Field>
            </div>
          </section>
          <div className="sections">
            <ListEditor title="Estados" value={data.estados} onChange={v => set('estados', v)} />
            <ListEditor title="Gestores" value={data.gestores} onChange={v => set('gestores', v)} />
            <ListEditor title="Proveedores" value={data.proveedores} onChange={v => set('proveedores', v)} />
            <ListEditor title="Tipos de incidencia" value={data.tipos_incidencia} onChange={v => set('tipos_incidencia', v)} />
          </div>
          <section className="card" style={{ marginTop: 14 }}>
            <h3>Umbrales de aviso</h3>
            <div className="form-grid">
              <Field label="Días crítico aceptado sin pedido">
                <input className="input" type="number" value={data.dias_critico_aceptado_sin_pedido} onChange={e => set('dias_critico_aceptado_sin_pedido', Number(e.target.value))} />
              </Field>
              <Field label="Días vencido seguimiento comercial">
                <input className="input" type="number" value={data.dias_vencido_seguimiento_comercial} onChange={e => set('dias_vencido_seguimiento_comercial', Number(e.target.value))} />
              </Field>
              <Field label="Días aviso pedido sin plazo">
                <input className="input" type="number" value={data.dias_aviso_pedido_sin_plazo} onChange={e => set('dias_aviso_pedido_sin_plazo', Number(e.target.value))} />
              </Field>
              <Field label="Días sin actualizar para aviso">
                <input className="input" type="number" value={data.dias_sin_actualizar_aviso} onChange={e => set('dias_sin_actualizar_aviso', Number(e.target.value))} />
              </Field>
            </div>
          </section>
        </>
      )}

      {activeTab === 'smtp' && (
        <>
          <section className="card">
            <h3 style={{ marginBottom: 14 }}>Configuración SMTP</h3>
            <div className="form-grid two">
              <Field label="Estado SMTP">
                <input className="input" value={data.smtp_configured ? 'Configurado' : 'No configurado'} disabled />
              </Field>
              <Field label="Host SMTP">
                <input className="input" value={data.smtp_host || ''} disabled />
              </Field>
              <Field label="Puerto SMTP">
                <input className="input" type="number" value={data.smtp_port} disabled />
              </Field>
              <Field label="Desde (email)">
                <input className="input" value={data.smtp_from || ''} disabled />
              </Field>
              <Field label="TLS">
                <input className="input" value={data.smtp_tls ? 'Sí' : 'No'} disabled />
              </Field>
            </div>
          </section>
          <section className="card" style={{ marginTop: 14 }}>
            <h3>Avisos por email</h3>
            <div className="form-grid two">
              <BoolField label="Activar avisos por email" value={data.email_avisos_activo} onChange={v => set('email_avisos_activo', v)} />
              <BoolField label="Enviar críticos inmediatos" value={data.enviar_email_criticos_inmediato} onChange={v => set('enviar_email_criticos_inmediato', v)} />
              <Field label="Asunto email avisos">
                <input className="input" value={data.asunto_email_avisos} onChange={e => set('asunto_email_avisos', e.target.value)} />
              </Field>
              <Field label="Destinatarios">
                <textarea rows={4} className="input" value={data.emails_destino_avisos.join('\n')} onChange={e => set('emails_destino_avisos', e.target.value.split('\n').map(x => x.trim()).filter(Boolean))} placeholder="compras@empresa.com" />
              </Field>
            </div>
          </section>
          <section className="card" style={{ marginTop: 14 }}>
            <h3>Automatización y escalado</h3>
            <div className="form-grid two">
              <BoolField label="Activar avisos automáticos" value={data.avisos_automaticos_activos} onChange={v => set('avisos_automaticos_activos', v)} />
              <BoolField label="Resumen diario automático" value={data.resumen_diario_automatico_activo} onChange={v => set('resumen_diario_automatico_activo', v)} />
              <Field label="Hora resumen diario">
                <input className="input" value={data.hora_resumen_diario} onChange={e => set('hora_resumen_diario', e.target.value)} placeholder="08:30" />
              </Field>
              <Field label="Revisar avisos cada X minutos">
                <input className="input" type="number" value={data.intervalo_revision_avisos_minutos} onChange={e => set('intervalo_revision_avisos_minutos', Number(e.target.value))} />
              </Field>
              <BoolField label="Escalado automático" value={data.escalado_automatico_activo} onChange={v => set('escalado_automatico_activo', v)} />
              <Field label="Emails de escalado">
                <textarea rows={4} className="input" value={data.emails_escalado_avisos.join('\n')} onChange={e => set('emails_escalado_avisos', e.target.value.split('\n').map(x => x.trim()).filter(Boolean))} placeholder="direccion@empresa.com" />
              </Field>
              <Field label="Escalado nivel 1 después de X horas">
                <input className="input" type="number" value={data.horas_escalado_nivel_1} onChange={e => set('horas_escalado_nivel_1', Number(e.target.value))} />
              </Field>
              <Field label="Escalado nivel 2 después de X horas">
                <input className="input" type="number" value={data.horas_escalado_nivel_2} onChange={e => set('horas_escalado_nivel_2', Number(e.target.value))} />
              </Field>
              <Field label="Escalado nivel 3 después de X horas">
                <input className="input" type="number" value={data.horas_escalado_nivel_3} onChange={e => set('horas_escalado_nivel_3', Number(e.target.value))} />
              </Field>
            </div>
            <button className="btn secondary small" style={{ marginTop: 14 }} onClick={sendTest}>Enviar email de prueba</button>
            {testEmail && <div className={testEmail.startsWith('Email') ? 'success' : 'notice'} style={{ marginTop: 12 }}>{testEmail}</div>}
          </section>
        </>
      )}

      {activeTab === 'seguridad' && (
        <section className="card">
          <h3 style={{ marginBottom: 14 }}>Seguridad</h3>
          <div className="notice">La seguridad crítica se configura mediante variables de entorno del servidor.</div>
        </section>
      )}

      {activeTab === 'sistema' && (
        <section className="card">
          <h3 style={{ marginBottom: 14 }}>Sistema</h3>
          <div className="notice">Las migraciones y el arranque se gestionan desde Docker y Alembic.</div>
        </section>
      )}
    </>
  )
}
