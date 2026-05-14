import { Link } from 'react-router-dom'
import { CheckSquare } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PriorityBadge, StateBadge } from '../components/Badges'
import { api, euro, fmtDate, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'

export function Hoy() {
  const { data, loading, error, reload } = useData<Presupuesto[]>(() => api.get('/hoy'), [])
  return <>
    <PageHeader title="Hoy hay que hacer" subtitle="Lista operativa: vencidos, críticos, aceptados sin pedido e incidencias abiertas." actions={<button className="btn secondary" onClick={reload}>Actualizar</button>} />
    {error && <div className="error">{error}</div>}
    {loading ? <div className="card">Cargando tareas...</div> : <div className="compact-list">
      {!(data || []).length && <div className="card">No hay acciones urgentes para hoy.</div>}
      {(data || []).map(p => <Link className="compact-row urgent-row" to={`/presupuestos/${p.id}`} key={p.id}>
        <div>
          <strong><CheckSquare size={14}/> {p.numero_presupuesto} · {p.cliente}</strong>
          <span>{p.siguiente_accion || 'Sin siguiente acción'} · responsable: {p.responsable_actual || 'Sin responsable'} · vence {fmtDate(p.fecha_limite_siguiente_accion)} · {euro(p.importe)}</span>
        </div>
        <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}><PriorityBadge value={p.prioridad_calculada}/><StateBadge value={p.estado}/></div>
      </Link>)}
    </div>}
  </>
}
