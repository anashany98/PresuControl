import { AlertTriangle, CheckCircle2, Clock3, Euro, FileText, PackageCheck, ShieldAlert, TimerReset } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { PriorityBadge, StateBadge } from '../components/Badges'
import { api, euro, fmtDate, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'

type DashboardData = {
  cards: Record<string, number>
  sections: Record<string, Presupuesto[]>
}

export function Dashboard() {
  const { data, loading, error } = useData<DashboardData>(() => api.get('/dashboard'), [])
  if (loading) return <div className="card">Cargando dashboard...</div>
  if (error) return <div className="error">{error}</div>
  const cards = data!.cards
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Vista rápida para detectar presupuestos aceptados que aún no tienen pedido al proveedor." actions={<Link className="btn" to="/nuevo">Nuevo presupuesto</Link>} />
      <div className="grid cards">
        <StatCard label="Total presupuestos activos" value={cards.total_activos} icon={FileText} />
        <StatCard label="Aceptados sin pedido proveedor" value={cards.aceptados_sin_pedido} icon={ShieldAlert} tone={cards.aceptados_sin_pedido ? '#dc2626' : undefined} />
        <StatCard label="Enviados sin respuesta" value={cards.enviados_sin_respuesta} icon={Clock3} />
        <StatCard label="Pedidos sin plazo confirmado" value={cards.pedidos_sin_plazo} icon={PackageCheck} />
        <StatCard label="Incidencias abiertas" value={cards.incidencias_abiertas} icon={AlertTriangle} tone={cards.incidencias_abiertas ? '#ea580c' : undefined} />
        <StatCard label="Cerrados este mes" value={cards.cerrados_mes} icon={CheckCircle2} />
        <StatCard label="Importe aceptado pendiente pedido" value={euro(cards.importe_aceptado_pendiente_pedido)} icon={Euro} tone={cards.importe_aceptado_pendiente_pedido ? '#dc2626' : undefined} />
        <StatCard label="Días medios aceptación → pedido" value={cards.dias_medios_aceptacion_a_pedido} icon={TimerReset} />
      </div>

      <div className="sections">
        <Quick title="Críticos: aceptados sin pedido proveedor" items={data!.sections.criticos_aceptados_sin_pedido} />
        <Quick title="Pendientes de respuesta del cliente" items={data!.sections.pendientes_respuesta_cliente} />
        <Quick title="Pedidos proveedor sin plazo" items={data!.sections.pedidos_sin_plazo} />
        <Quick title="Incidencias abiertas" items={data!.sections.incidencias_abiertas} />
        <Quick title="Próximas fechas límite" items={data!.sections.proximas_fechas_limite} />
      </div>
    </>
  )
}

function Quick({ title, items }: { title: string; items: Presupuesto[] }) {
  return <section className="card"><h3>{title}</h3><div className="compact-list">
    {!items.length && <p className="muted">Sin registros.</p>}
    {items.map(p => <Link to={`/presupuestos/${p.id}`} className="compact-row" key={p.id}>
      <div><strong>{p.numero_presupuesto} · {p.cliente}</strong><span>{p.siguiente_accion || p.obra_referencia} · vence {fmtDate(p.fecha_limite_siguiente_accion)}</span></div>
      <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}><PriorityBadge value={p.prioridad_calculada} /><StateBadge value={p.estado} /></div>
    </Link>)}
  </div></section>
}
