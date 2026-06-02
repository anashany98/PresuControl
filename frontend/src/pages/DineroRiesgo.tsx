import { Link } from 'react-router-dom'
import { AlertTriangle, Euro, TrendingUp } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { StatCard } from '../components/StatCard'
import { PriorityBadge, StateBadge } from '../components/Badges'
import { useQuery } from '@tanstack/react-query'
import { euro, type Presupuesto } from '../utils/api'
import { PedidoSummaryBadge } from '../components/PedidoSummary'


type Bucket = { label: string; count: number; importe: number; items: Presupuesto[] }
type Data = {
  total_presupuestos_en_riesgo: number
  importe_total_en_riesgo: number
  buckets: Record<string, Bucket>
}

export function DineroRiesgo() {
  const { data, isLoading, error, refetch } = useQuery<Data>({
    queryKey: ['dinero-riesgo'],
    queryFn: () => import('../utils/api').then(m => m.api.get<Data>('/dinero-riesgo')),
  })
  if (isLoading) return <div className="card">Calculando dinero en riesgo...</div>
  if (error || !data) return <div className="error">{(error as Error)?.message || 'Error'}</div>
  const buckets = Object.entries(data.buckets)
  return <>
    <PageHeader
      title="Dinero en riesgo"
      subtitle="Importe de presupuestos que pueden quedar bloqueados por falta de pedido, plazo, actualización o incidencia."
      actions={<button className="btn secondary" onClick={() => refetch()}>Actualizar</button>}
    />
    <div className="grid cards">
      <StatCard label="Presupuestos en riesgo" value={data.total_presupuestos_en_riesgo} icon={AlertTriangle} tone={data.total_presupuestos_en_riesgo ? '#dc2626' : undefined} />
      <StatCard label="Importe total en riesgo" value={euro(data.importe_total_en_riesgo)} icon={Euro} tone={data.importe_total_en_riesgo ? '#dc2626' : undefined} />
      <StatCard label="Buckets activos" value={buckets.filter(([, b]) => b.count > 0).length} icon={TrendingUp} />
    </div>

    <div className="sections">
      {buckets.map(([key, bucket]) => <section className="card" key={key}>
        <div className="card-title-row">
          <div>
            <h3>{bucket.label}</h3>
            <p className="muted">{bucket.count} presupuestos · {euro(bucket.importe)}</p>
          </div>
        </div>
        <div className="compact-list">
          {!bucket.items.length && <EmptyState icon={Euro} title={`Sin ${bucket.label.toLowerCase()}`} description="No hay presupuestos en esta categoría de riesgo." />}
          {bucket.items.map(p => <Link to={`/presupuestos/${p.id}`} className="compact-row" key={`${key}-${p.id}`}>
            <div>
              <strong>{p.numero_presupuesto} · {p.cliente}</strong>
              <span>{euro(p.importe)} · {p.responsable_actual || 'Sin responsable'} · {p.siguiente_accion || 'Sin acción'}</span>
              <PedidoSummaryBadge presupuesto={p} variant="mini" />
            </div>
            <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
              <PriorityBadge value={p.prioridad_calculada} />
              <StateBadge value={p.estado} />
            </div>
          </Link>)}
        </div>
      </section>)}
    </div>
  </>
}
