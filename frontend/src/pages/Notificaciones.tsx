import { useState } from 'react'
import { Bell, BellRing, Check, CheckCheck } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Link } from 'react-router-dom'
import { SkeletonCard } from '../components/Skeleton'
import { api, fmtDate } from '../utils/api'
import { useData } from '../utils/useData'

type Notificacion = {
  id: number
  tipo: string
  titulo: string
  mensaje: string
  leida: boolean
  link: string | null
  metadata: any
  creado_en: string
}

type NotificacionesResponse = {
  notificaciones: Notificacion[]
  sin_leer: number
}

export function Notificaciones() {
  const [filter, setFilter] = useState<'todas' | 'sin-leer'>('todas')
  const { data, loading, error, reload } = useData<NotificacionesResponse>(() =>
    api.get('/notificaciones?only_unread=false&limit=100'), [])
  const [msg, setMsg] = useState<string | null>(null)

  async function markRead(id: number) {
    try {
      await api.post(`/notificaciones/${id}/leer`, {})
      reload()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }

  async function markAllRead() {
    try {
      const res = await api.post<{marcadas: number}>('/notificaciones/marcar-todas-leidas', {})
      setMsg(`✓ ${res.marcadas} notificaciones marcadas como leídas`)
      reload()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }

  const notificaciones = data?.notificaciones || []
  const filtered = filter === 'sin-leer' ? notificaciones.filter(n => !n.leida) : notificaciones

  return <>
    <PageHeader
      title="Notificaciones"
      subtitle="Avisos internos de la aplicación"
      actions={<>
        <button className="btn secondary" onClick={reload}>Actualizar</button>
        {data?.sin_leer ? <button className="btn secondary" onClick={markAllRead}><CheckCheck size={16}/>Marcar todas leídas ({data.sin_leer})</button> : null}
      </>}
    />
    {msg && <div className="notice" style={{ marginBottom: 14 }}>{msg}</div>}
    {error && <div className="error">{error}</div>}
    <div className="toolbar" style={{ marginBottom: 16 }}>
      <button className={`btn secondary small ${filter === 'todas' ? 'active' : ''}`} onClick={() => setFilter('todas')}>Todas</button>
      <button className={`btn secondary small ${filter === 'sin-leer' ? 'active' : ''}`} onClick={() => setFilter('sin-leer')}>Sin leer {data?.sin_leer ? `(${data.sin_leer})` : ''}</button>
    </div>
    {loading ? <SkeletonCard /> : !filtered.length ? <div className="card">No hay notificaciones.</div> : (
      <div className="compact-list">
        {filtered.map(n => (
          <div key={n.id} className={`compact-row${n.leida ? '' : ' unread'}`}>
            <div className="notif-icon"><BellRing size={16}/></div>
            <div className="notif-content">
              <strong>{n.titulo}</strong>
              <span>{n.mensaje}</span>
              <small>{fmtDate(n.creado_en)}</small>
            </div>
            <div className="notif-actions">
              {n.link && <Link to={n.link} className="btn secondary small">Ver</Link>}
              {!n.leida && <button className="btn secondary small" onClick={() => markRead(n.id)} title="Marcar como leída"><Check size={14}/></button>}
            </div>
          </div>
        ))}
      </div>
    )}
    <style>{`
      .compact-row.unread { background: #fef3c7; border-left: 3px solid #f59e0b; }
      .notif-icon { color: #f59e0b; flex-shrink: 0; display: flex; align-items: center; padding: 0 8px; }
      .notif-content { flex: 1; display: flex; flex-direction: column; gap: 2px; }
      .notif-content strong { font-size: 14px; }
      .notif-content span { font-size: 13px; color: #6b7280; }
      .notif-content small { font-size: 11px; color: #9ca3af; }
      .notif-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
    `}</style>
  </>
}