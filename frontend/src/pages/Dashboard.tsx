import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Euro, FileText, PackageCheck, ShieldAlert, TimerReset } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { PriorityBadge, StateBadge } from '../components/Badges'
import { SkeletonCard } from '../components/Skeleton'
import { api, euro, fmtDate, type Presupuesto, ESTADOS } from '../utils/api'
import { useData } from '../utils/useData'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type DashboardData = {
  cards: Record<string, number>
  sections: Record<string, Presupuesto[]>
}

const COLORS = {
  pendiente: '#f59e0b',
  enviado: '#3b82f6',
  aceptado: '#22c55e',
  pedido: '#8b5cf6',
  plazo: '#06b6d4',
  fabricacion: '#ec4899',
  entregado: '#6b7280',
  cerrado: '#1c1917',
  incidencia: '#ef4444',
}

const ESTADO_COLORS: Record<string, string> = {
  'Pendiente de enviar': '#e5e7eb',
  'Enviado al cliente': '#3b82f6',
  'Aceptado - pendiente pedido proveedor': '#22c55e',
  'Pedido proveedor realizado': '#8b5cf6',
  'Plazo proveedor confirmado': '#06b6d4',
  'En preparación / fabricación': '#ec4899',
  'Entregado / cerrado': '#6b7280',
  'Cancelado / rechazado': '#1c1917',
  'Bloqueado / incidencia': '#ef4444',
}

function DonutChart({ data, title }: { data: { name: string; value: number; color: string }[]; title: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null
  return (
    <div className="chart-card">
      <h4>{title}</h4>
      <div className="donut-wrap">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value">
              {data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
            </Pie>
            <Tooltip formatter={(v, n) => [`${v} presupuestos`, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center"><strong>{total}</strong><span>total</span></div>
      </div>
      <div className="donut-legend">
        {data.filter(d => d.value > 0).map(d => (
          <div key={d.name} className="legend-item">
            <span className="legend-dot" style={{ background: d.color }} />
            <span className="legend-label">{d.name}</span>
            <span className="legend-value">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopGestoresChart({ presupuestos }: { presupuestos: Presupuesto[] }) {
  const byGestor: Record<string, number> = {}
  presupuestos.forEach(p => { byGestor[p.gestor] = (byGestor[p.gestor] || 0) + p.importe })
  const data = Object.entries(byGestor).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, value]) => ({ name: name.split(' ')[0], value: Math.round(value / 1000) }))

  if (!data.length) return null
  return (
    <div className="chart-card">
      <h4>Importe por gestor (miles €)</h4>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical">
          <XAxis type="number" tickFormatter={v => `${v}k€`} />
          <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v, n) => [`${Number(v).toLocaleString('es-ES')} €`, 'Importe']} />
          <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function PriorityChart({ presupuestos }: { presupuestos: Presupuesto[] }) {
  const counts = { 'Crítico': 0, 'Rojo': 0, 'Naranja': 0, 'Amarillo': 0, 'Verde': 0 }
  presupuestos.forEach(p => { if (counts[p.prioridad_calculada as keyof typeof counts] !== undefined) counts[p.prioridad_calculada as keyof typeof counts]++ })
  const data = Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({
    name, value, color: name === 'Crítico' || name === 'Rojo' ? '#ef4444' : name === 'Naranja' ? '#f97316' : name === 'Amarillo' ? '#eab308' : '#22c55e'
  }))
  if (!data.length) return null
  return (
    <div className="chart-card">
      <h4>Prioridades</h4>
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2} dataKey="value">
            {data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
          </Pie>
          <Tooltip formatter={(v, n) => [`${v} presupuestos`, n]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Dashboard() {
  const { data, loading, error } = useData<DashboardData>(() => api.get('/dashboard'), [])
  const [showCharts, setShowCharts] = useState(true)

  if (loading) return <SkeletonCard />
  if (error) return <div className="error">{error}</div>
  const cards = data!.cards
  const allPresupuestos = Object.values(data!.sections).flat()
  const uniquePresupuestos = allPresupuestos.filter((p, i, a) => a.findIndex(x => x.id === p.id) === i)

  const estadoData = ESTADOS.map(e => ({
    name: e.replace(' - ', '\n').replace(' / ', '/'),
    value: uniquePresupuestos.filter(p => p.estado === e).length,
    color: ESTADO_COLORS[e] || '#e5e7eb',
  })).filter(d => d.value > 0)

  const riesgoData = [
    { name: 'Críticos', value: cards.aceptados_sin_pedido, color: '#ef4444' },
    { name: 'En riesgo', value: cards.enviados_sin_respuesta, color: '#f97316' },
    { name: 'En seguimiento', value: cards.pedidos_sin_plazo, color: '#eab308' },
    { name: 'OK', value: cards.total_activos - cards.aceptados_sin_pedido - cards.enviados_sin_respuesta - cards.pedidos_sin_plazo, color: '#22c55e' },
  ].filter(d => d.value >= 0)

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Vista rápida para detectar presupuestos aceptados que aún no tienen pedido al proveedor."
        actions={<>
          <button className={`btn secondary small ${showCharts ? 'active' : ''}`} onClick={() => setShowCharts(!showCharts)}>
            📊 {showCharts ? 'Ocultar' : 'Ver'} gráficos
          </button>
          <Link className="btn" to="/nuevo">Nuevo presupuesto</Link>
        </>}
      />
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

      {showCharts && uniquePresupuestos.length > 0 && (
        <div className="charts-section">
          <div className="charts-grid">
            <DonutChart data={estadoData} title="Presupuestos por estado" />
            <DonutChart data={riesgoData} title="Distribución de riesgo" />
            <TopGestoresChart presupuestos={uniquePresupuestos} />
            <PriorityChart presupuestos={uniquePresupuestos} />
          </div>
        </div>
      )}

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