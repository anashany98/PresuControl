import { useState, useMemo } from 'react'
import { Download, RefreshCw, Filter, Calendar, User, X, Mail, ClipboardList } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { API_URL, api, fmtDate, type ActivityLog, type EmailLog } from '../utils/api'
import { useData } from '../utils/useData'
import { useAuth } from '../utils/auth'

type Tab = 'actividad' | 'emails'

const PAGE_SIZES = [25, 50, 100] as const
type PageSize = typeof PAGE_SIZES[number]

const TIPO_OPTIONS = ['recordatorio', 'aprobacion', 'vencimiento', 'escalado', 'estado']
const STATUS_OPTIONS = ['sent', 'failed', 'skipped', 'pending']

const BADGE_COLORS: Record<string, string> = {
  sent: 'badge-success',
  failed: 'badge-error',
  skipped: 'badge-warning',
  pending: 'badge-muted',
  recordatorio: 'badge-info',
  aprobacion: 'badge-success',
  vencimiento: 'badge-warning',
  escalado: 'badge-error',
  estado: 'badge-muted',
}

export function Logs() {
  const { token } = useAuth()
  const [tab, setTab] = useState<Tab>('actividad')
  const [filters, setFilters] = useState({ tipo: '', usuario: '', presupuesto_id: '', date_from: '', date_to: '' })
  const [pageSize, setPageSize] = useState<PageSize>(25)
  const [page, setPage] = useState(1)

  const emailQuery = useMemo(() => {
    const q = new URLSearchParams()
    if (filters.tipo) q.set('tipo', filters.tipo)
    if (filters.presupuesto_id) q.set('presupuesto_id', filters.presupuesto_id)
    if (filters.date_from) q.set('date_from', filters.date_from)
    if (filters.date_to) q.set('date_to', filters.date_to)
    q.set('limit', '500')
    return q
  }, [filters])

  const activityQuery = useMemo(() => {
    const q = new URLSearchParams()
    if (filters.usuario) q.set('usuario', filters.usuario)
    if (filters.presupuesto_id) q.set('presupuesto_id', filters.presupuesto_id)
    if (filters.date_from) q.set('date_from', filters.date_from)
    if (filters.date_to) q.set('date_to', filters.date_to)
    q.set('limit', '500')
    return q
  }, [filters])

  const emails = useData<EmailLog[]>(() => api.get(`/logs/emails?${emailQuery.toString()}`), [emailQuery.toString()])
  const activity = useData<ActivityLog[]>(() => api.get(`/logs/actividad?${activityQuery.toString()}`), [activityQuery.toString()])

  const set = (k: keyof typeof filters, v: string) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }
  const clearFilters = () => { setFilters({ tipo: '', usuario: '', presupuesto_id: '', date_from: '', date_to: '' }); setPage(1) }

  async function handleExport(path: string, filename: string) {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export failed:', e)
    }
  }

  const paginatedEmails = useMemo(() => {
    if (!emails.data) return { items: [], total: 0 }
    const start = (page - 1) * pageSize
    return { items: emails.data.slice(start, start + pageSize), total: emails.data.length }
  }, [emails.data, page, pageSize])

  const paginatedActivity = useMemo(() => {
    if (!activity.data) return { items: [], total: 0 }
    const start = (page - 1) * pageSize
    return { items: activity.data.slice(start, start + pageSize), total: activity.data.length }
  }, [activity.data, page, pageSize])

  const totalPages = (total: number) => Math.ceil(total / pageSize) || 1

  return <>
    <PageHeader title="Logs" subtitle="Trazabilidad filtrable de avisos por email y actividad interna." actions={<button className="btn secondary" onClick={() => { emails.reload(); activity.reload() }}><RefreshCw size={16}/>Actualizar</button>} />
    <section className="card">
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'actividad' ? 'active' : ''}`} onClick={() => { setTab('actividad'); setPage(1) }}>
          <ClipboardList size={16}/>Actividad
        </button>
        <button className={`tab ${tab === 'emails' ? 'active' : ''}`} onClick={() => { setTab('emails'); setPage(1) }}>
          <Mail size={16}/>Emails
        </button>
      </div>
      <div className="toolbar">
        <Filter size={16} className="muted" />
        <select className="select" value={filters.tipo} onChange={e => set('tipo', e.target.value)}><option value="">Tipo</option>{TIPO_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <select className="select" value={filters.usuario} onChange={e => set('usuario', e.target.value)}><option value="">Usuario</option>{activity.data ? [...new Map(activity.data.filter(a => a.usuario_nombre || a.usuario_email).map(a => [a.usuario_nombre || a.usuario_email, a])).keys()].filter(Boolean).map(u => <option key={u as string} value={u as string}>{u}</option>) : null}</select>
        <input className="input" placeholder="Presupuesto ID" value={filters.presupuesto_id} onChange={e => set('presupuesto_id', e.target.value)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Calendar size={14} className="muted" />
          <input className="input" type="date" value={filters.date_from} onChange={e => set('date_from', e.target.value)} placeholder="Desde" title="Desde" />
          <span className="muted">—</span>
          <input className="input" type="date" value={filters.date_to} onChange={e => set('date_to', e.target.value)} placeholder="Hasta" title="Hasta" />
        </div>
        <button className="btn secondary" onClick={clearFilters} title="Limpiar filtros"><X size={16}/></button>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}>
        {tab === 'emails' ? (
          <button className="btn secondary" onClick={() => handleExport('/logs/emails/export', `logs_emails_${new Date().toISOString().slice(0, 10)}.xlsx`)}><Download size={16}/>Exportar Excel</button>
        ) : (
          <button className="btn secondary" onClick={() => handleExport('/logs/actividad/export', `logs_actividad_${new Date().toISOString().slice(0, 10)}.xlsx`)}><Download size={16}/>Exportar Excel</button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="muted">Mostrar</span>
          <select className="select" value={pageSize} onChange={e => { setPageSize(Number(e.target.value) as PageSize); setPage(1) }}>
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="muted">por página</span>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>Nota: los logs están protegidos. Solo los usuarios con gestión del sistema pueden acceder.</p>
    </section>

    {tab === 'emails' ? (
      <section className="card">
        <h3>Logs de emails / avisos</h3>
        {emails.error && <div className="error">{emails.error}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Presupuesto</th><th>Tipo</th><th>Estado</th><th>Destino</th><th>Nivel</th><th>Error</th></tr></thead>
            <tbody>
              {paginatedEmails.items.map(log => (
                <tr key={log.id}>
                  <td>{fmtDate(log.creado_en)}</td>
                  <td>{log.presupuesto_id ? <a href={`/presupuestos/${log.presupuesto_id}`}>#{log.presupuesto_id}</a> : '—'}</td>
                  <td><span className={`badge ${BADGE_COLORS[log.tipo] || 'badge-muted'}`}>{log.tipo}</span></td>
                  <td><span className={`badge ${BADGE_COLORS[log.status] || 'badge-muted'}`}>{log.status}</span></td>
                  <td>{log.sent_to || '—'}</td>
                  <td>{log.escalation_level}</td>
                  <td className="error-text">{log.error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paginatedEmails.total > 0 && (
          <div className="pagination">
            <button className="btn secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
            <span>{page} / {totalPages(paginatedEmails.total)} ({paginatedEmails.total} total)</span>
            <button className="btn secondary" disabled={page >= totalPages(paginatedEmails.total)} onClick={() => setPage(p => p + 1)}>Siguiente</button>
          </div>
        )}
      </section>
    ) : (
      <section className="card">
        <h3>Actividad / historial global</h3>
        {activity.error && <div className="error">{activity.error}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Descripción</th><th>Presupuesto</th><th>Campo</th></tr></thead>
            <tbody>
              {paginatedActivity.items.map(item => (
                <tr key={item.id}>
                  <td>{fmtDate(item.creado_en)}</td>
                  <td><User size={14}/> {item.usuario_nombre || item.nombre_opcional || item.usuario_email || 'Sin usuario'}</td>
                  <td>{item.descripcion}</td>
                  <td><a href={`/presupuestos/${item.presupuesto_id}`}>#{item.presupuesto_id}</a></td>
                  <td><span className="badge badge-muted">{item.campo}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paginatedActivity.total > 0 && (
          <div className="pagination">
            <button className="btn secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
            <span>{page} / {totalPages(paginatedActivity.total)} ({paginatedActivity.total} total)</span>
            <button className="btn secondary" disabled={page >= totalPages(paginatedActivity.total)} onClick={() => setPage(p => p + 1)}>Siguiente</button>
          </div>
        )}
      </section>
    )}
  </>
}