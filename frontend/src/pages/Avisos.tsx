import { useState } from 'react'
import { Bell, Mail, PlayCircle, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { PriorityBadge } from '../components/Badges'
import { api, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'

type Aviso = { tipo: string; presupuesto: Presupuesto }

export function Avisos() {
  const { data, loading, error, reload } = useData<Aviso[]>(() => api.get('/avisos'), [])
  const [msg, setMsg] = useState<string | null>(null)
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
      <button className="btn secondary" onClick={reload}>Actualizar</button>
      <button className="btn secondary" onClick={runAutomatic}><PlayCircle size={16}/>Revisión automática</button>
      <button className="btn secondary" onClick={escalateNow}><Send size={16}/>Escalar ahora</button>
      <button className="btn" onClick={sendDigest}><Mail size={16}/>Enviar resumen email</button>
    </>} />
    {msg && <div className={msg.startsWith('Email') || msg.startsWith('Revisión') || msg.startsWith('Escalado') ? 'success' : 'notice'} style={{ marginBottom: 14 }}>{msg}</div>}
    {error && <div className="error">{error}</div>}
    {loading ? <div className="card">Cargando avisos...</div> : <div className="compact-list">
      {!(data || []).length && <div className="card">No hay avisos activos.</div>}
      {(data || []).map((a, idx) => <Link className="compact-row" to={`/presupuestos/${a.presupuesto.id}`} key={idx}>
        <div><strong><Bell size={14}/> {a.tipo}</strong><span>{a.presupuesto.numero_presupuesto} · {a.presupuesto.cliente} · {a.presupuesto.siguiente_accion || 'Sin acción'}</span></div>
        <PriorityBadge value={a.presupuesto.prioridad_calculada}/>
      </Link>)}
    </div>}
  </>
}
