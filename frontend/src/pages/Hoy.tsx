import { useState, useMemo } from 'react'
import { CheckCircle2, Circle, RefreshCw, SortAsc } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { PriorityBadge, StateBadge } from '../components/Badges'
import { SkeletonCard } from '../components/Skeleton'
import { api, euro, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'
import { useAuth } from '../utils/auth'

type FilterType = 'todos' | 'vencidos' | 'criticos'
type SortType = 'fecha' | 'importe' | 'prioridad'
type UrgencyGroup = { label: string; urgency: 'vencido' | 'critico' | 'pendiente'; items: Presupuesto[] }

const PRIORITY_ICON: Record<string, string> = {
  'Crítico': '🚨',
  'Rojo': '⚠️',
  'Naranja': '📅',
  'Amarillo': '📅',
  'Verde': '✓',
}

function getTimeRemaining(fecha: string | null | undefined): { text: string; days: number; isPast: boolean } {
  if (!fecha) return { text: 'Sin fecha', days: 0, isPast: false }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(fecha)
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return { text: `Vencido ${Math.abs(diff)}d`, days: diff, isPast: true }
  if (diff === 0) return { text: 'Hoy', days: 0, isPast: false }
  if (diff === 1) return { text: 'Mañana', days: diff, isPast: false }
  return { text: `${diff}d`, days: diff, isPast: false }
}

function sortItems(items: Presupuesto[], sort: SortType): Presupuesto[] {
  return [...items].sort((a, b) => {
    if (sort === 'importe') return (b.importe || 0) - (a.importe || 0)
    if (sort === 'prioridad') {
      const order: Record<string, number> = { 'Crítico': 0, 'Rojo': 1, 'Naranja': 2, 'Amarillo': 3, 'Verde': 4 }
      return (order[a.prioridad_calculada] ?? 5) - (order[b.prioridad_calculada] ?? 5)
    }
    return (a.fecha_limite_siguiente_accion || '').localeCompare(b.fecha_limite_siguiente_accion || '')
  })
}

export function Hoy() {
  const { data, loading, error, reload } = useData<Presupuesto[]>(() => api.get('/hoy'), [])
  const { user } = useAuth()
  const [filter, setFilter] = useState<FilterType>('todos')
  const [sort, setSort] = useState<SortType>('fecha')
  const [done, setDone] = useState<Set<number>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)

  const groups = useMemo(() => {
    if (!data) return []
    const vencidos = data.filter(p => {
      const t = getTimeRemaining(p.fecha_limite_siguiente_accion)
      return t.isPast
    })
    const criticos = data.filter(p => {
      const t = getTimeRemaining(p.fecha_limite_siguiente_accion)
      return !t.isPast && (p.prioridad_calculada === 'Crítico' || p.prioridad_calculada === 'Rojo')
    })
    const pendientes = data.filter(p => {
      const t = getTimeRemaining(p.fecha_limite_siguiente_accion)
      return !t.isPast && p.prioridad_calculada !== 'Crítico' && p.prioridad_calculada !== 'Rojo'
    })

    let result: UrgencyGroup[] = [
      { label: 'Vencidos', urgency: 'vencido', items: sortItems(vencidos, sort) },
      { label: 'Críticos', urgency: 'critico', items: sortItems(criticos, sort) },
      { label: 'Pendientes', urgency: 'pendiente', items: sortItems(pendientes, sort) },
    ]

    if (filter === 'vencidos') result = result.filter(g => g.urgency === 'vencido')
    if (filter === 'criticos') result = result.filter(g => g.urgency === 'critico')

    return result.filter(g => g.items.length > 0)
  }, [data, filter, sort])

  const myItems = useMemo(() => {
    if (!user) return []
    return groups.flatMap(g => g.items.filter(p => p.gestor === user.nombre || p.responsable_actual === user.nombre))
  }, [groups, user])

  const otherItems = useMemo(() => {
    if (!user) return groups.flatMap(g => g.items)
    return groups.flatMap(g => g.items.filter(p => p.gestor !== user.nombre && p.responsable_actual !== user.nombre))
  }, [groups, user])

  async function markDone(p: Presupuesto) {
    setDone(d => new Set([...d, p.id]))
    try {
      await api.patch<Presupuesto>(`/presupuestos/${p.id}`, {
        ...p,
        expected_version: p.version,
      })
      setMsg('✓ Tarea completada')
      setTimeout(() => setMsg(null), 3000)
    } catch {
      setDone(d => { const n = new Set(d); n.delete(p.id); return n })
      setMsg('Error')
    }
  }

  return <>
    <PageHeader title="Hoy hay que hacer" subtitle="Priorizado por urgencia" actions={<button className="btn secondary" onClick={reload}><RefreshCw size={16}/></button>} />
    {msg && <div className="notice" style={{ marginBottom: 14 }}>{msg}</div>}
    {error && <div className="error">{error}</div>}
    {loading ? <SkeletonCard /> : <>
      <div className="hoy-toolbar">
        <div className="filter-tabs">
          <button className={`filter-tab ${filter === 'todos' ? 'active' : ''}`} onClick={() => setFilter('todos')}>Todos</button>
          <button className={`filter-tab ${filter === 'vencidos' ? 'active' : ''}`} onClick={() => setFilter('vencidos')}>🔴 Vencidos</button>
          <button className={`filter-tab ${filter === 'criticos' ? 'active' : ''}`} onClick={() => setFilter('criticos')}>⚠️ Críticos</button>
        </div>
        <div className="sort-select">
          <SortAsc size={14} />
          <select value={sort} onChange={e => setSort(e.target.value as SortType)}>
            <option value="fecha">Fecha</option>
            <option value="importe">Importe</option>
            <option value="prioridad">Prioridad</option>
          </select>
        </div>
      </div>
      {groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎉</div>
          <h3>¡Todo bajo control!</h3>
          <p>No hay tareas urgentes.</p>
        </div>
      ) : (
        <div className="hoy-content">
          {myItems.length > 0 && (
            <div className="hoy-section">
              <h4 className="hoy-section-title">📋 Mis tareas ({myItems.length})</h4>
              <div className="timeline-list">
                {myItems.filter(p => !done.has(p.id)).map(p => <HoyItem key={p.id} p={p} onDone={markDone} done={done.has(p.id)} />)}
                {myItems.filter(p => done.has(p.id)).length > 0 && (
                  <details className="hoy-done"><summary>Completadas ({myItems.filter(p => done.has(p.id)).length})</summary>
                    {myItems.filter(p => done.has(p.id)).map(p => <HoyItem key={p.id} p={p} onDone={markDone} done />)}
                  </details>
                )}
              </div>
            </div>
          )}
          {otherItems.length > 0 && (
            <div className="hoy-section">
              <h4 className="hoy-section-title">👥 Otros ({otherItems.length})</h4>
              <div className="timeline-list">
                {otherItems.filter(p => !done.has(p.id)).map(p => <HoyItem key={p.id} p={p} onDone={markDone} done={done.has(p.id)} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </>}
    <style>{`
      .hoy-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
      .filter-tabs { display: flex; gap: 4px; }
      .filter-tab { padding: 6px 12px; border-radius: 6px; border: 1px solid #e5e7eb; background: white; cursor: pointer; font-size: 13px; transition: all 0.15s; }
      .filter-tab:hover { background: #f3f4f6; }
      .filter-tab.active { background: #3b82f6; color: white; border-color: #3b82f6; }
      .sort-select { display: flex; align-items: center; gap: 6px; color: #6b7280; font-size: 13px; }
      .sort-select select { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 8px; background: white; cursor: pointer; }
      .empty-state { text-align: center; padding: 60px 20px; background: white; border-radius: 12px; border: 1px solid #e5e7eb; }
      .empty-icon { font-size: 64px; margin-bottom: 16px; }
      .empty-state h3 { font-size: 22px; color: #1c1917; margin-bottom: 8px; }
      .empty-state p { color: #78716c; font-size: 14px; }
      .hoy-section { margin-bottom: 24px; }
      .hoy-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #a8a29e; margin-bottom: 10px; }
      .timeline-list { position: relative; padding-left: 36px; }
      .timeline-list::before { content: ''; position: absolute; left: 14px; top: 20px; bottom: 20px; width: 2px; background: linear-gradient(to bottom, #e5e7eb, #d1d5db); border-radius: 1px; }
      .hoy-item { display: flex; align-items: flex-start; gap: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; position: relative; transition: all 0.2s; }
      .hoy-item:hover { box-shadow: 0 3px 10px rgba(0,0,0,0.06); transform: translateY(-1px); }
      .hoy-item.vencido { border-left: 3px solid #ef4444; }
      .hoy-item.critico { border-left: 3px solid #f97316; }
      .hoy-item.pendiente { border-left: 3px solid #22c55e; }
      .hoy-item.done { opacity: 0.5; }
      .hoy-item.done .hoy-item-title { text-decoration: line-through; }
      .hoy-item-marker { position: absolute; left: -36px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; border-radius: 50%; background: white; border: 2px solid #d1d5db; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; color: #d1d5db; }
      .hoy-item-marker:hover { border-color: #3b82f6; color: #3b82f6; }
      .hoy-item.vencido .hoy-item-marker { border-color: #ef4444; color: #ef4444; }
      .hoy-item.critico .hoy-item-marker { border-color: #f97316; color: #f97316; }
      .hoy-item.pendiente .hoy-item-marker { border-color: #22c55e; color: #22c55e; }
      .hoy-item-marker.done { background: #22c55e; border-color: #22c55e; color: white; }
      .hoy-item-content { flex: 1; min-width: 0; }
      .hoy-item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; gap: 8px; }
      .hoy-item-title { font-size: 14px; font-weight: 600; color: #1c1917; display: flex; align-items: center; gap: 6px; }
      .hoy-item-meta { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; color: #78716c; }
      .hoy-item-meta span { display: flex; align-items: center; gap: 3px; }
      .hoy-item-time { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; white-space: nowrap; flex-shrink: 0; }
      .hoy-item-time.past { background: #fef2f2; color: #ef4444; }
      .hoy-item-time.today { background: #fef3c7; color: #b45309; }
      .hoy-item-time.future { background: #f0fdf4; color: #166534; }
      .hoy-done { margin-top: 8px; padding: 8px 12px; background: #f9fafb; border-radius: 8px; font-size: 13px; color: #78716c; }
      .hoy-done summary { cursor: pointer; font-weight: 600; }
    `}</style>
  </>
}

function HoyItem({ p, onDone, done = false }: { p: Presupuesto; onDone: (p: Presupuesto) => void; done?: boolean }) {
  const time = getTimeRemaining(p.fecha_limite_siguiente_accion)
  const urgency = time.isPast ? 'vencido' : p.prioridad_calculada === 'Crítico' || p.prioridad_calculada === 'Rojo' ? 'critico' : 'pendiente'
  const icon = PRIORITY_ICON[p.prioridad_calculada] || '📅'
  const timeClass = time.isPast ? 'past' : time.days === 0 ? 'today' : 'future'

  return (
    <div className={`hoy-item ${urgency}${done ? ' done' : ''}`}>
      <div className={`hoy-item-marker${done ? ' done' : ''}`} onClick={() => !done && onDone(p)}>
        {done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
      </div>
      <div className="hoy-item-content">
        <div className="hoy-item-header">
          <Link to={`/presupuestos/${p.id}`} className="hoy-item-title">{icon} {p.numero_presupuesto} · {p.cliente}</Link>
          <span className={`hoy-item-time ${timeClass}`}>{time.text}</span>
        </div>
        <div className="hoy-item-meta">
          <span>📋 {p.siguiente_accion || 'Sin acción'}</span>
          <span>👤 {p.responsable_actual || p.gestor}</span>
          <span>💰 {euro(p.importe)}</span>
          <span><PriorityBadge value={p.prioridad_calculada}/></span>
        </div>
      </div>
    </div>
  )
}