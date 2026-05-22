import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Mail, Plus, RotateCcw, Save, Server, Settings, Shield, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { api, type Settings as SettingsType } from '../utils/api'
import { useData } from '../utils/useData'
import { useMetadataOptions } from '../utils/useMetadataOptions'
import { useToast } from '../utils/toast'

type Tab = 'general' | 'avisos' | 'smtp' | 'seguridad' | 'sistema'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'general', label: 'General', icon: <Settings size={15} /> },
  { id: 'avisos', label: 'Avisos', icon: <AlertTriangle size={15} /> },
  { id: 'smtp', label: 'SMTP', icon: <Mail size={15} /> },
  { id: 'seguridad', label: 'Seguridad', icon: <Shield size={15} /> },
  { id: 'sistema', label: 'Sistema', icon: <Server size={15} /> },
]

const RANGE_RULES: Partial<Record<keyof SettingsType, { min: number; max: number; label: string }>> = {
  dias_critico_aceptado_sin_pedido: { min: 1, max: 90, label: 'Días crítico aceptado sin pedido' },
  dias_vencido_seguimiento_comercial: { min: 1, max: 90, label: 'Días vencido seguimiento comercial' },
  dias_aviso_pedido_sin_plazo: { min: 1, max: 60, label: 'Días aviso pedido sin plazo' },
  dias_sin_actualizar_aviso: { min: 1, max: 90, label: 'Días sin actualizar para aviso' },
  intervalo_revision_avisos_minutos: { min: 5, max: 1440, label: 'Intervalo de revisión' },
  horas_escalado_nivel_1: { min: 1, max: 168, label: 'Escalado nivel 1' },
  horas_escalado_nivel_2: { min: 1, max: 336, label: 'Escalado nivel 2' },
  horas_escalado_nivel_3: { min: 1, max: 720, label: 'Escalado nivel 3' },
}

function cleanList(values: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const item = value.trim()
    if (!item) continue
    const key = item.toLocaleLowerCase('es')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function stable(value: unknown) {
  return JSON.stringify(value)
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}

function validateSettings(data: SettingsType) {
  const errors: string[] = []
  for (const [key, rule] of Object.entries(RANGE_RULES) as Array<[keyof SettingsType, { min: number; max: number; label: string }]>) {
    const value = Number(data[key])
    if (!Number.isFinite(value) || value < rule.min || value > rule.max) {
      errors.push(`${rule.label}: debe estar entre ${rule.min} y ${rule.max}.`)
    }
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.hora_resumen_diario || '')) {
    errors.push('Hora resumen diario: usa formato HH:MM entre 00:00 y 23:59.')
  }
  for (const [label, emails] of [['Destinatarios', data.emails_destino_avisos], ['Escalado', data.emails_escalado_avisos]] as const) {
    for (const email of emails) {
      if (!isEmail(email)) errors.push(`${label}: email no válido (${email}).`)
    }
  }
  return errors
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="config-hint">{hint}</span>}
    </div>
  )
}

function ToggleField({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="config-toggle-row">
      <div>
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <button type="button" className={`toggle-switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value}>
        <span />
      </button>
    </div>
  )
}

function NumberField({ label, hint, value, onChange, min, max }: { label: string; hint?: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <Field label={label} hint={hint || `Rango permitido: ${min}-${max}`}>
      <input className="input" type="number" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} />
    </Field>
  )
}

function ListEditor({
  title,
  description,
  value,
  onChange,
  importLabel,
  importValues = [],
}: {
  title: string
  description: string
  value: string[]
  onChange: (v: string[]) => void
  importLabel?: string
  importValues?: string[]
}) {
  const [draft, setDraft] = useState('')
  const [bulk, setBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')

  const add = () => {
    const next = cleanList([...value, ...draft.split('\n')])
    onChange(next)
    setDraft('')
  }
  const remove = (item: string) => onChange(value.filter(v => v !== item))
  const importExisting = () => onChange(cleanList([...value, ...importValues]))
  const applyBulk = () => {
    onChange(cleanList(bulkText.split('\n')))
    setBulk(false)
  }

  return (
    <section className="card config-list-card">
      <div className="config-card-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="badge state">{value.length}</span>
      </div>
      <div className="chip-list">
        {value.length === 0 && <span className="muted">Sin valores configurados.</span>}
        {value.map(item => (
          <span className="config-chip" key={item}>
            {item}
            <button type="button" onClick={() => remove(item)} aria-label={`Eliminar ${item}`}><X size={12} /></button>
          </span>
        ))}
      </div>
      {bulk ? (
        <div className="config-bulk">
          <textarea className="input" rows={6} value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder="Una opción por línea" />
          <div className="toolbar">
            <button className="btn small" type="button" onClick={applyBulk}>Aplicar lista</button>
            <button className="btn secondary small" type="button" onClick={() => setBulk(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="config-add-row">
          <input className="input" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder={`Añadir ${title.toLocaleLowerCase('es')}`} />
          <button className="btn secondary small" type="button" onClick={add}><Plus size={14} />Añadir</button>
        </div>
      )}
      <div className="toolbar config-list-actions">
        {importLabel && <button className="btn secondary small" type="button" onClick={importExisting}>Importar {importLabel}</button>}
        <button className="btn secondary small" type="button" onClick={() => { setBulkText(value.join('\n')); setBulk(true) }}>Edición masiva</button>
      </div>
    </section>
  )
}

function StatusTile({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'ok' | 'warn' }) {
  return (
    <div className={`config-status-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function Configuracion() {
  const { data, loading, error, setData, reload } = useData<SettingsType>(() => api.get('/settings'), [])
  const metadataOptions = useMetadataOptions()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testEmail, setTestEmail] = useState<string | null>(null)

  useEffect(() => {
    if (data && savedSnapshot === null) setSavedSnapshot(stable(data))
  }, [data, savedSnapshot])

  const validationErrors = useMemo(() => data ? validateSettings(data) : [], [data])
  const dirty = Boolean(data && savedSnapshot && stable(data) !== savedSnapshot)
  const changedCount = useMemo(() => {
    if (!data || !savedSnapshot) return 0
    const saved = JSON.parse(savedSnapshot) as SettingsType
    return Object.keys(data).filter(key => stable(data[key as keyof SettingsType]) !== stable(saved[key as keyof SettingsType])).length
  }, [data, savedSnapshot])

  if (loading) return <div className="card">Cargando configuración...</div>
  if (error || !data) return <div className="error">{error || 'Error'}</div>

  const set = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => setData({ ...data, [key]: value })
  const setList = (key: keyof SettingsType, value: string[]) => setData({ ...data, [key]: cleanList(value) })
  const cleanCurrent = () => {
    setData({
      ...data,
      estados: cleanList(data.estados),
      gestores: cleanList(data.gestores),
      proveedores: cleanList(data.proveedores),
      tipos_incidencia: cleanList(data.tipos_incidencia),
      emails_destino_avisos: cleanList(data.emails_destino_avisos),
      emails_escalado_avisos: cleanList(data.emails_escalado_avisos),
    })
  }
  const reset = () => {
    if (!savedSnapshot) return
    setData(JSON.parse(savedSnapshot))
  }

  async function save() {
    if (!dirty || validationErrors.length || saving) return
    setSaving(true)
    try {
      const updated = await api.put<SettingsType>('/settings', data)
      setData(updated)
      setSavedSnapshot(stable(updated))
      toast.success('Configuración guardada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
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

  return (
    <>
      <PageHeader
        title="Configuración"
        subtitle="Ajustes operativos de seguimiento, avisos, listas maestras y estado del sistema."
        actions={
          <>
            <button className="btn secondary" onClick={reset} disabled={!dirty}><RotateCcw size={16} />Deshacer</button>
            <button className="btn" onClick={save} disabled={!dirty || validationErrors.length > 0 || saving}><Save size={16} />{saving ? 'Guardando...' : 'Guardar'}</button>
          </>
        }
      />

      <div className="config-summary">
        <StatusTile label="Cambios pendientes" value={dirty ? String(changedCount) : '0'} tone={dirty ? 'warn' : 'ok'} />
        <StatusTile label="SMTP" value={data.smtp_configured ? 'Configurado' : 'No configurado'} tone={data.smtp_configured ? 'ok' : 'warn'} />
        <StatusTile label="Avisos automáticos" value={data.avisos_automaticos_activos ? 'Activos' : 'Pausados'} tone={data.avisos_automaticos_activos ? 'ok' : 'neutral'} />
        <StatusTile label="Destinatarios" value={String(data.emails_destino_avisos.length)} />
      </div>

      {validationErrors.length > 0 && (
        <div className="error config-validation">
          <strong>Hay ajustes que corregir antes de guardar.</strong>
          {validationErrors.map(err => <span key={err}>{err}</span>)}
        </div>
      )}

      <div className="config-tabs" role="tablist">
        {TABS.map(tab => (
          <button key={tab.id} className={`config-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <>
          <section className="card">
            <div className="config-card-head">
              <div>
                <h3>Contexto de la instalación</h3>
                <p>Estos valores se leen del entorno del servidor y no se editan desde la aplicación.</p>
              </div>
              <button className="btn secondary small" type="button" onClick={reload}>Recargar</button>
            </div>
            <div className="form-grid two">
              <Field label="Timezone"><input className="input" value={data.timezone} disabled /></Field>
              <Field label="URL pública"><input className="input" value={data.public_url} disabled /></Field>
            </div>
          </section>
          <div className="sections">
            <ListEditor title="Estados" description="Estados disponibles para presupuestos y kanban." value={data.estados} onChange={v => setList('estados', v)} />
            <ListEditor title="Gestores" description="Personas o equipos que gestionan presupuestos." value={data.gestores} onChange={v => setList('gestores', v)} importLabel="existentes" importValues={metadataOptions.gestores} />
            <ListEditor title="Proveedores" description="Nombres que aparecerán como sugerencias al crear pedidos." value={data.proveedores} onChange={v => setList('proveedores', v)} importLabel="existentes" importValues={metadataOptions.proveedores} />
            <ListEditor title="Tipos de incidencia" description="Motivos habituales para clasificar bloqueos." value={data.tipos_incidencia} onChange={v => setList('tipos_incidencia', v)} />
          </div>
        </>
      )}

      {activeTab === 'avisos' && (
        <>
          <section className="card">
            <div className="config-card-head">
              <div>
                <h3>Reglas de prioridad</h3>
                <p>Estos umbrales alimentan Riesgo, Hoy, Mi mesa y los avisos automáticos.</p>
              </div>
              <button className="btn secondary small" type="button" onClick={cleanCurrent}>Limpiar listas</button>
            </div>
            <div className="form-grid">
              <NumberField label="Aceptado sin pedido" value={data.dias_critico_aceptado_sin_pedido} min={1} max={90} onChange={v => set('dias_critico_aceptado_sin_pedido', v)} hint="Días para elevar un aceptado sin pedido a crítico." />
              <NumberField label="Seguimiento comercial vencido" value={data.dias_vencido_seguimiento_comercial} min={1} max={90} onChange={v => set('dias_vencido_seguimiento_comercial', v)} hint="Días sin respuesta tras enviar al cliente." />
              <NumberField label="Pedido sin plazo" value={data.dias_aviso_pedido_sin_plazo} min={1} max={60} onChange={v => set('dias_aviso_pedido_sin_plazo', v)} hint="Días antes de avisar si falta plazo proveedor." />
              <NumberField label="Sin actualizar" value={data.dias_sin_actualizar_aviso} min={1} max={90} onChange={v => set('dias_sin_actualizar_aviso', v)} hint="Días sin cambios para considerarlo parado." />
            </div>
          </section>

          <section className="card" style={{ marginTop: 14 }}>
            <h3>Email y automatización</h3>
            <div className="config-toggle-grid">
              <ToggleField label="Avisos por email" hint="Permite enviar avisos a los destinatarios." value={data.email_avisos_activo} onChange={v => set('email_avisos_activo', v)} />
              <ToggleField label="Críticos inmediatos" hint="Envía aviso al detectar presupuestos críticos." value={data.enviar_email_criticos_inmediato} onChange={v => set('enviar_email_criticos_inmediato', v)} />
              <ToggleField label="Avisos automáticos" hint="Ejecuta revisiones periódicas en backend." value={data.avisos_automaticos_activos} onChange={v => set('avisos_automaticos_activos', v)} />
              <ToggleField label="Resumen diario" hint="Agrupa avisos a la hora configurada." value={data.resumen_diario_automatico_activo} onChange={v => set('resumen_diario_automatico_activo', v)} />
            </div>
            <div className="form-grid two" style={{ marginTop: 14 }}>
              <Field label="Asunto de avisos"><input className="input" value={data.asunto_email_avisos} onChange={e => set('asunto_email_avisos', e.target.value)} /></Field>
              <Field label="Hora resumen diario" hint="Formato HH:MM"><input className="input" value={data.hora_resumen_diario} onChange={e => set('hora_resumen_diario', e.target.value)} placeholder="08:30" /></Field>
              <NumberField label="Revisar cada X minutos" value={data.intervalo_revision_avisos_minutos} min={5} max={1440} onChange={v => set('intervalo_revision_avisos_minutos', v)} />
            </div>
          </section>

          <div className="sections">
            <ListEditor title="Destinatarios" description="Emails que reciben los avisos operativos." value={data.emails_destino_avisos} onChange={v => setList('emails_destino_avisos', v)} />
            <ListEditor title="Emails de escalado" description="Dirección o responsables para avisos que siguen sin resolverse." value={data.emails_escalado_avisos} onChange={v => setList('emails_escalado_avisos', v)} />
          </div>

          <section className="card" style={{ marginTop: 14 }}>
            <h3>Escalado</h3>
            <div className="config-toggle-grid">
              <ToggleField label="Escalado automático" hint="Sube avisos persistentes a responsables superiores." value={data.escalado_automatico_activo} onChange={v => set('escalado_automatico_activo', v)} />
            </div>
            <div className="form-grid" style={{ marginTop: 14 }}>
              <NumberField label="Nivel 1" value={data.horas_escalado_nivel_1} min={1} max={168} onChange={v => set('horas_escalado_nivel_1', v)} hint="Horas hasta primer escalado." />
              <NumberField label="Nivel 2" value={data.horas_escalado_nivel_2} min={1} max={336} onChange={v => set('horas_escalado_nivel_2', v)} hint="Horas hasta segundo escalado." />
              <NumberField label="Nivel 3" value={data.horas_escalado_nivel_3} min={1} max={720} onChange={v => set('horas_escalado_nivel_3', v)} hint="Horas hasta tercer escalado." />
            </div>
          </section>
        </>
      )}

      {activeTab === 'smtp' && (
        <>
          <section className="card">
            <div className="config-card-head">
              <div>
                <h3>Estado SMTP</h3>
                <p>La conexión SMTP se configura con variables de entorno del servidor.</p>
              </div>
              {data.smtp_configured ? <span className="badge verde"><CheckCircle2 size={13} />Configurado</span> : <span className="badge naranja"><AlertTriangle size={13} />Pendiente</span>}
            </div>
            <div className="config-summary compact">
              <StatusTile label="Host" value={data.smtp_host || 'Sin configurar'} tone={data.smtp_host ? 'ok' : 'warn'} />
              <StatusTile label="Puerto" value={String(data.smtp_port)} />
              <StatusTile label="Desde" value={data.smtp_from || 'Sin remitente'} tone={data.smtp_from ? 'ok' : 'warn'} />
              <StatusTile label="TLS" value={data.smtp_tls ? 'Sí' : 'No'} />
            </div>
            <button className="btn secondary small" style={{ marginTop: 14 }} onClick={sendTest}>Enviar email de prueba</button>
            {testEmail && <div className={testEmail.startsWith('Email') ? 'success' : 'notice'} style={{ marginTop: 12 }}>{testEmail}</div>}
          </section>
        </>
      )}

      {activeTab === 'seguridad' && (
        <section className="card">
          <div className="config-card-head">
            <div>
              <h3>Seguridad</h3>
              <p>Los controles críticos no se guardan en la base de datos para evitar cambios accidentales.</p>
            </div>
            <Shield size={24} />
          </div>
          <div className="config-info-list">
            <div><strong>Autenticación</strong><span>Controlada por variables de entorno y middleware del backend.</span></div>
            <div><strong>Usuarios gestores</strong><span>Se administran desde la pantalla Usuarios, no desde configuración general.</span></div>
            <div><strong>Secretos</strong><span>JWT, SMTP y claves de aplicación deben vivir en `.env` o secretos del servidor.</span></div>
          </div>
        </section>
      )}

      {activeTab === 'sistema' && (
        <section className="card">
          <div className="config-card-head">
            <div>
              <h3>Sistema</h3>
              <p>Resumen operativo del despliegue actual.</p>
            </div>
            <Server size={24} />
          </div>
          <div className="config-summary compact">
            <StatusTile label="Timezone" value={data.timezone} />
            <StatusTile label="URL pública" value={data.public_url} />
            <StatusTile label="SMTP" value={data.smtp_configured ? 'Configurado' : 'No configurado'} tone={data.smtp_configured ? 'ok' : 'warn'} />
            <StatusTile label="Automatización" value={data.avisos_automaticos_activos ? 'Activa' : 'Pausada'} />
          </div>
          <div className="notice" style={{ marginTop: 14 }}>Migraciones, backups, puertos y variables de entorno se gestionan desde Docker/Alembic y no desde esta pantalla.</div>
        </section>
      )}
    </>
  )
}
