import { PageHeader } from '../components/PageHeader'
import { api, fmtDate, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'
import { Link } from 'react-router-dom'

export function Calendario() {
  const { data, loading, error } = useData<Presupuesto[]>(() => api.get('/presupuestos?limit=2000'), [])
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const days = new Date(year, month + 1, 0).getDate()
  const first = new Date(year, month, 1).getDay() || 7
  const cells: Array<number | null> = [...Array.from({ length: first - 1 }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const events = (data || []).flatMap(p => [
    p.fecha_limite_siguiente_accion ? { date: p.fecha_limite_siguiente_accion, type: 'Acción', p } : null,
    p.plazo_proveedor ? { date: p.plazo_proveedor, type: 'Plazo proveedor', p } : null,
    p.fecha_prevista_entrega ? { date: p.fecha_prevista_entrega, type: 'Entrega', p } : null,
    p.estado === 'Enviado al cliente' && p.fecha_envio_cliente ? { date: p.fecha_envio_cliente, type: 'Enviado sin respuesta', p } : null,
  ].filter(Boolean) as { date: string; type: string; p: Presupuesto }[]).filter(e => e.date.startsWith(monthKey))
  return <>
    <PageHeader title="Calendario" subtitle="Fechas límite, plazos proveedor, entregas previstas y enviados pendientes de respuesta." />
    {error && <div className="error">{error}</div>}
    {loading ? <div className="card">Cargando calendario...</div> : <div className="calendar">
      {cells.map((day, i) => <div className="day" key={i}>{day && <><b>{day}</b>{events.filter(e => Number(e.date.slice(8,10)) === day).map((e, idx) => <Link to={`/presupuestos/${e.p.id}`} className="event" key={idx} style={{ display: 'block' }}><strong>{e.type}</strong><br />{e.p.numero_presupuesto} · {e.p.cliente}<br/><span className="muted">{fmtDate(e.date)}</span></Link>)}</>}</div>)}
    </div>}
  </>
}
