import { useState } from 'react'
import { BriefcaseBusiness, ChevronRight, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { PriorityBadge } from '../components/Badges'
import { SkeletonTable } from '../components/Skeleton'
import { api, euro, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'

type MiMesaResponse = {
  usuario: { id?: number; nombre?: string; email?: string }
  items: Presupuesto[]
  resumen: { total: number; vencidos: number; criticos: number; incidencias: number; aceptados_sin_pedido: number }
}

function CountdownTimer({ dateStr }: { dateStr: string | null | undefined }) {
  if (!dateStr) return <span className="countdown countdown--week">Sin fecha</span>
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return <span className="countdown countdown--today">Vencido</span>
  if (diff === 0) return <span className="countdown countdown--today">Hoy</span>
  if (diff === 1) return <span className="countdown countdown--tomorrow">Mañana</span>
  if (diff <= 7) return <span className="countdown countdown--week">{diff}d</span>
  return <span className="countdown">{new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
}

function SwipeableCard({ item }: { item: Presupuesto }) {
  const [swiping, setSwiping] = useState(false)
  const priorityClass = item.prioridad_calculada === 'Crítico' || item.prioridad_calculada === 'Rojo' ? 'priority-rojo'
    : item.prioridad_calculada === 'Naranja' ? 'priority-naranja'
    : item.prioridad_calculada === 'Amarillo' ? 'priority-amarillo'
    : item.prioridad_calculada === 'Verde' ? 'priority-verde' : ''

  return (
    <Link to={`/presupuestos/${item.id}`} className={`mobile-card swipeable-card ${swiping ? 'swiping' : ''} ${priorityClass}`}
      style={{ borderLeftColor: priorityClass === 'priority-rojo' ? '#ef4444' : priorityClass === 'priority-naranja' ? '#f97316' : priorityClass === 'priority-amarillo' ? '#eab308' : priorityClass === 'priority-verde' ? '#22c55e' : '#e5e7eb' }}
    >
      <div className="mobile-card-header">
        <div>
          <strong>{item.cliente}</strong>
          <span>{item.numero_presupuesto} · {item.obra_referencia || 'Sin obra'}</span>
        </div>
        <PriorityBadge value={item.prioridad_calculada} />
      </div>
      <div className="mobile-card-meta">
        <span>{item.gestor}</span>
        <span className="mobile-importe">{euro(item.importe)}</span>
      </div>
      <div className="mobile-card-footer">
        <CountdownTimer dateStr={item.fecha_limite_siguiente_accion} />
        <span>{item.estado}</span>
        <ChevronRight size={16} style={{ color: '#9ca3af' }} />
      </div>
      <div className="swipe-hint">Desliza para avanzar</div>
    </Link>
  )
}

export function MiMesa() {
  const { data, loading, error, reload } = useData<MiMesaResponse>(() => api.get('/mi-mesa'), [])
  const r = data?.resumen
  return <>
    <PageHeader title="Mi mesa de trabajo" subtitle={`Acciones pendientes vinculadas al usuario actual${data?.usuario?.nombre ? `: ${data.usuario.nombre}` : ''}.`} actions={<button className="btn secondary" onClick={reload}><RefreshCw size={16}/>Actualizar</button>} />
    <div className="grid cards stats-row">
      <div className="card hero-mini"><BriefcaseBusiness size={22}/><div><strong>{r?.total || 0}</strong><p>Tareas visibles</p></div></div>
      <div className="card"><strong>{r?.vencidos || 0}</strong><p className="muted">Vencidos</p></div>
      <div className="card"><strong>{r?.criticos || 0}</strong><p className="muted">Críticos</p></div>
      <div className="card"><strong>{r?.aceptados_sin_pedido || 0}</strong><p className="muted">Aceptados sin pedido</p></div>
      <div className="card"><strong>{r?.incidencias || 0}</strong><p className="muted">Incidencias</p></div>
    </div>
    {error && <div className="error">{error}</div>}
    {loading ? <SkeletonTable rows={6} /> : <>
      <div className="mobile-list" style={{ marginTop: 16 }}>
        {(data?.items || []).map(item => <SwipeableCard key={item.id} item={item} />)}
      </div>
      {(data?.items || []).length === 0 && <div className="card" style={{ marginTop: 16 }}>No hay tareas pendientes en tu mesa.</div>}
    </>}
  </>
}
