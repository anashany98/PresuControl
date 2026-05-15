import { useState } from 'react'
import { Bell, CheckCircle, Clock, Mail, PlayCircle, Send, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { PriorityBadge } from '../components/Badges'
import { api, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'

type Aviso = { tipo: string; presupuesto: Presupuesto }
type AlertHistory = { id: number; tipo: string; presupuesto_id: number; numero_presupuesto: string; cliente: string; prioridad_calculada: string; enviado_a: string; enviado_en: string; status: string }

export function Avisos() {
  const { data, loading, error, reload } = useData<Aviso[]>(() => api.get('/avisos'), [])
  const { data: historyData } = useData<AlertHistory[]>(() => api.get('/avisos/historial'), [])
  const [tab, setTab] = useState<'activos' | 'historial'>('activos')
  const [msg, setMsg] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  async function sendDigest() {
    setMsg(null)
    try {
      const res = await api.post<any>('/avisos/email-digest', {})
      setMsg(res.sent ? `Email enviado con ${res.alerts} avisos.` : `No enviado: ${res.reason || 'sin detalle'}`)
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }
  async function runAutomatic() {
    setMsg(null)
    try {
      const res = await api.post<any>('/avisos/run-automatic', {})
      setMsg(res.active ? 'Revisión automática ejecutada manualmente.' : `No ejecutado: ${res.reason}`)
      reload()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }
  async function escalateNow() {
    setMsg(null)
    try {
      const res = await api.post<any>('/avisos/escalar-ahora', {})
      setMsg(res.count ? `Escalado ejecutado: ${res.count} avisos.` : `Sin escalados enviados: ${res.reason || 'no hay avisos que cumplan umbral'}`)
      reload()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }
  return <>
    <PageHeader title="Centro de avisos" subtitle="Avisos internos, resumen por email y escalado si nadie actúa." actions={<>
      <button className="btn secondary" onClick={() => setShowConfig(true)}><Settings size={16}/>Configurar</button>
      <button className="btn secondary" onClick={reload}>Actualizar</button>
      <button className="btn secondary" onClick={runAutomatic}><PlayCircle size={16}/>Revisión automática</button>
      <button className="btn secondary" onClick={escalateNow}><Send size={16}/>Escalar ahora</button>
      <button className="btn" onClick={sendDigest}><Mail size={16}/>Enviar resumen email</button>
    </>} />
    {msg && <div className={msg.startsWith('Email') || msg.startsWith('Revisión') || msg.startsWith('Escalado') ? 'success' : 'notice'} style={{ marginBottom: 14 }}>{msg}</div>}
    {error && <div className="error">{error}</div>}
    <div className="detail-tabs">
      <button className={`detail-tab ${tab === 'activos' ? 'active' : ''}`} onClick={() => setTab('activos')}>Avisos activos ({data?.length || 0})</button>
      <button className={`detail-tab ${tab === 'historial' ? 'active' : ''}`} onClick={() => setTab('historial')}>Historial</button>
    </div>
    {loading ? <div className="card">Cargando avisos...</div> : tab === 'activos' ? <div className="compact-list">
      {!(data || []).length && <div className="card">No hay avisos activos.</div>}
      {(data || []).map((a, idx) => <Link className="compact-row" to={`/presupuestos/${a.presupuesto.id}`} key={idx}>
        <div><strong><Bell size={14}/> {a.tipo}</strong><span>{a.presupuesto.numero_presupuesto} · {a.presupuesto.cliente} · {a.presupuesto.siguiente_accion || 'Sin acción'}</span></div>
        <PriorityBadge value={a.presupuesto.prioridad_calculada}/>
      </Link>)}
    </div> : <div className="compact-list">
      {!(historyData || []).length && <div className="card">No hay historial de avisos.</div>}
      {(historyData || []).map((h) => <div className="compact-row" key={h.id}>
        <div><strong>{h.tipo}</strong><span>{h.numero_presupuesto} · {h.cliente}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PriorityBadge value={h.prioridad_calculada} />
          <span className={`badge ${h.status === 'sent' ? 'success' : 'error'}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {h.status === 'sent' ? <CheckCircle size={12} /> : <Clock size={12} />}
            {h.status === 'sent' ? 'Enviado' : 'Pendiente'}
          </span>
        </div>
      </div>)}
    </div>}
    {showConfig && <div className="modal-backdrop" onClick={() => setShowConfig(false)}>
      <div className="modal card" onClick={e => e.stopPropagation()} style={{ padding: 24 }}>
        <h3 style={{ margin: '0 0 16px' }}>Configurar umbrales de aviso</h3>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>Los cambios se guardan automáticamente.</p>
        <div className="form-grid two">
          <div className="field">
            <label>Días para aviso naranja</label>
            <input type="number" className="input" defaultValue={3} min={1} />
          </div>
          <div className="field">
            <label>Días para aviso rojo</label>
            <input type="number" className="input" defaultValue={7} min={1} />
          </div>
          <div className="field">
            <label>Intervalo revisión (minutos)</label>
            <input type="number" className="input" defaultValue={30} min={5} />
          </div>
          <div className="field">
            <label>Email destino avisos</label>
            <input type="email" className="input" placeholder="avisos@empresa.com" />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn secondary" onClick={() => setShowConfig(false)}>Cerrar</button>
        </div>
      </div>
    </div>}
  </>
}
