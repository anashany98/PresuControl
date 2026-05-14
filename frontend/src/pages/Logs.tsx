import { useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { API_URL, api, fmtDate, type ActivityLog, type EmailLog } from '../utils/api'
import { useData } from '../utils/useData'

export function Logs() {
  const [filters, setFilters] = useState({ status: '', tipo: '', presupuesto_id: '', usuario: '', campo: '', q: '', date_from: '', date_to: '' })
  const emailQuery = new URLSearchParams()
  if (filters.status) emailQuery.set('status', filters.status)
  if (filters.tipo) emailQuery.set('tipo', filters.tipo)
  if (filters.presupuesto_id) emailQuery.set('presupuesto_id', filters.presupuesto_id)
  if (filters.q) emailQuery.set('q', filters.q)
  if (filters.date_from) emailQuery.set('date_from', filters.date_from)
  if (filters.date_to) emailQuery.set('date_to', filters.date_to)
  emailQuery.set('limit', '200')

  const activityQuery = new URLSearchParams()
  if (filters.presupuesto_id) activityQuery.set('presupuesto_id', filters.presupuesto_id)
  if (filters.usuario) activityQuery.set('usuario', filters.usuario)
  if (filters.campo) activityQuery.set('campo', filters.campo)
  if (filters.q) activityQuery.set('q', filters.q)
  if (filters.date_from) activityQuery.set('date_from', filters.date_from)
  if (filters.date_to) activityQuery.set('date_to', filters.date_to)
  activityQuery.set('limit', '250')

  const emails = useData<EmailLog[]>(() => api.get(`/logs/emails?${emailQuery.toString()}`), [emailQuery.toString()])
  const activity = useData<ActivityLog[]>(() => api.get(`/logs/actividad?${activityQuery.toString()}`), [activityQuery.toString()])
  const set = (k: keyof typeof filters, v: string) => setFilters(f => ({ ...f, [k]: v }))
  const token = localStorage.getItem('presucontrol_token')
  const exportLink = (path: string) => `${API_URL}${path}${token ? `?access_token=${encodeURIComponent(token)}` : ''}`
  return <>
    <PageHeader title="Logs" subtitle="Trazabilidad filtrable de avisos por email y actividad interna." actions={<button className="btn secondary" onClick={() => { emails.reload(); activity.reload() }}><RefreshCw size={16}/>Actualizar</button>} />
    <section className="card">
      <div className="toolbar">
        <input className="input" placeholder="Buscar texto/error" value={filters.q} onChange={e => set('q', e.target.value)} />
        <input className="input" placeholder="Presupuesto ID" value={filters.presupuesto_id} onChange={e => set('presupuesto_id', e.target.value)} />
        <select className="select" value={filters.status} onChange={e => set('status', e.target.value)}><option value="">Estado email</option><option value="sent">sent</option><option value="failed">failed</option><option value="skipped">skipped</option><option value="pending">pending</option></select>
        <input className="input" placeholder="Tipo aviso" value={filters.tipo} onChange={e => set('tipo', e.target.value)} />
        <input className="input" placeholder="Usuario actividad" value={filters.usuario} onChange={e => set('usuario', e.target.value)} />
        <input className="input" placeholder="Campo actividad" value={filters.campo} onChange={e => set('campo', e.target.value)} />
        <input className="input" type="date" value={filters.date_from} onChange={e => set('date_from', e.target.value)} />
        <input className="input" type="date" value={filters.date_to} onChange={e => set('date_to', e.target.value)} />
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}>
        <a className="btn secondary" href={exportLink('/logs/emails/export')}><Download size={16}/>Exportar emails</a>
        <a className="btn secondary" href={exportLink('/logs/actividad/export')}><Download size={16}/>Exportar actividad</a>
      </div>
      <p className="muted">Nota: los logs están protegidos. Solo los usuarios con gestión del sistema pueden acceder.</p>
    </section>
    <div className="sections" style={{ marginTop: 16 }}>
      <section className="card">
        <h3>Logs de emails / avisos</h3>
        {emails.error && <div className="error">{emails.error}</div>}
        <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Presupuesto</th><th>Tipo</th><th>Estado</th><th>Destino</th><th>Nivel</th><th>Error</th></tr></thead><tbody>
          {emails.data?.map(log => <tr key={log.id}><td>{fmtDate(log.creado_en)}</td><td>{log.presupuesto_id || '—'}</td><td>{log.tipo}</td><td><span className={`badge state ${log.status}`}>{log.status}</span></td><td>{log.sent_to || '—'}</td><td>{log.escalation_level}</td><td>{log.error || '—'}</td></tr>)}
        </tbody></table></div>
      </section>
      <section className="card">
        <h3>Actividad / historial global</h3>
        {activity.error && <div className="error">{activity.error}</div>}
        <div className="timeline">
          {activity.data?.map(item => <div className="timeline-item" key={item.id}><strong>{item.descripcion}</strong><br/><small>{fmtDate(item.creado_en)} · {item.usuario_nombre || item.nombre_opcional || item.usuario_email || 'Sin usuario'} · Presupuesto #{item.presupuesto_id}</small></div>)}
        </div>
      </section>
    </div>
  </>
}
