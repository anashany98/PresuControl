import { AlertCircle, AlertTriangle, Calendar, CheckCircle2, Clock3, Download, FilePlus, FileText, Package, PackageCheck, ShieldAlert, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, ESTADOS } from '../utils/api'
import { ESTADO_COLOR } from '../utils/tokens'
import { useData } from '../utils/useData'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { KpiCard } from '../components/KpiCard'
import { AlertBanner } from '../components/AlertBanner'
import { TrendChart } from '../components/TrendChart'
import { EstadoChart } from '../components/EstadoChart'
import { DashboardTabs, type DashboardTab } from '../components/DashboardTabs'
import { BudgetRowList } from '../components/BudgetRow'
import { AtAGlance } from '../components/AtAGlance'
import { DashboardSkeleton } from '../components/DashboardSkeleton'
import type { DashboardPayload } from '../utils/dashboard'

export function Dashboard() {
  const { data, loading, error } = useData<DashboardPayload>(() => api.get('/dashboard'), [])

  if (loading) return <DashboardSkeleton />
  if (error || !data) return <div className="error p-4">{error || 'No se pudo cargar el dashboard'}</div>

  const cards = data.cards
  const allPresupuestos = Object.values(data.sections).flat()
  const uniquePresupuestos = allPresupuestos.filter((p, i, a) => a.findIndex(x => x.id === p.id) === i)

  const estadoCounts = ESTADOS.map(e => ({
    estado: e.split(' - ')[0],
    count: uniquePresupuestos.filter(p => p.estado === e).length,
    color: ESTADO_COLOR[e] || '#e5e7eb',
  })).filter(d => d.count > 0)

  const riesgoData = [
    { name: 'Críticos', value: cards.aceptados_sin_pedido, color: '#ef4444' },
    { name: 'En riesgo', value: cards.enviados_sin_respuesta, color: '#f97316' },
    { name: 'Seguimiento', value: cards.pedidos_sin_plazo, color: '#eab308' },
    { name: 'OK', value: Math.max(0, cards.total_activos - cards.aceptados_sin_pedido - cards.enviados_sin_respuesta - cards.pedidos_sin_plazo), color: '#22c55e' },
  ]

  const byGestor: Record<string, number> = {}
  const gestorCriticos: Record<string, number> = {}
  uniquePresupuestos.forEach(p => {
    byGestor[p.gestor] = (byGestor[p.gestor] || 0) + p.importe
    if (p.prioridad_calculada === 'Rojo' || p.prioridad_calculada === 'Crítico') {
      gestorCriticos[p.gestor] = (gestorCriticos[p.gestor] || 0) + 1
    }
  })
  const gestorStackData = Object.entries(byGestor).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, value]) => ({
      name: name.split(' ')[0],
      total: Math.round(value / 1000),
      criticos: gestorCriticos[name] || 0,
    }))

  const tabs: DashboardTab[] = [
    { id: 'excepciones', label: 'Excepciones', icon: AlertCircle, count: data.excepciones_pedidos?.length || 0, iconColor: 'text-purple-500', content: <BudgetRowList items={data.excepciones_pedidos || []} /> },
    { id: 'criticos', label: 'Críticos', icon: ShieldAlert, count: data.sections.criticos_aceptados_sin_pedido.length, iconColor: 'text-danger', content: <BudgetRowList items={data.sections.criticos_aceptados_sin_pedido} /> },
    { id: 'pendientes', label: 'Pendientes', icon: Clock3, count: data.sections.pendientes_respuesta_cliente.length, iconColor: 'text-warning', content: <BudgetRowList items={data.sections.pendientes_respuesta_cliente} /> },
    { id: 'sin_plazo', label: 'Sin plazo', icon: PackageCheck, count: data.sections.pedidos_sin_plazo.length, iconColor: 'text-yellow-500', content: <BudgetRowList items={data.sections.pedidos_sin_plazo} /> },
    { id: 'incidencias', label: 'Incidencias', icon: AlertTriangle, count: data.sections.incidencias_abiertas.length, iconColor: 'text-orange-600', content: <BudgetRowList items={data.sections.incidencias_abiertas} /> },
    { id: 'proximas', label: 'Próximas', icon: Calendar, count: data.sections.proximas_fechas_limite.length, iconColor: 'text-info', content: <BudgetRowList items={data.sections.proximas_fechas_limite} /> },
    { id: 'pedidos', label: 'Pedidos', icon: Package, count: data.sections.pedidos_pendientes?.length || 0, iconColor: 'text-purple-500', content: <BudgetRowList items={data.sections.pedidos_pendientes || []} /> },
  ]

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <AlertBanner alerta={data.alerta} />
      <AtAGlance text={data.resumen_texto} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Dashboard</h1>
          <p className="text-sm text-ink-muted mt-0.5">Vista rápida de presupuestos activos</p>
        </div>
        <div className="flex gap-2">
          <Link className="btn primary small" to="/nuevo">
            <FilePlus size={14} /> Nuevo
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {data.kpis[0] && <KpiCard label="Total activos" value={data.kpis[0].value} trend={data.kpis[0].trend != null ? { value: data.kpis[0].trend, isGood: data.kpis[0].trendUp ?? true } : undefined} icon={FileText} />}
        {data.kpis[1] && <KpiCard label="En riesgo" value={data.kpis[1].value} sublabel={data.kpis[1].sublabel} trend={data.kpis[1].trend != null ? { value: data.kpis[1].trend, isGood: data.kpis[1].trendUp ?? false } : undefined} tone="danger" icon={ShieldAlert} />}
        {data.kpis[2] && <KpiCard label="Cerrados este mes" value={data.kpis[2].value} trend={data.kpis[2].trend != null ? { value: data.kpis[2].trend, isGood: data.kpis[2].trendUp ?? true } : undefined} tone="success" icon={CheckCircle2} />}
        {data.kpis[3] && <KpiCard label="Pedidos pendientes" value={data.kpis[3].value} tone="purple" icon={Package} />}
      </div>

      {/* Quick Links */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link to="/nuevo" className="btn secondary small"><FilePlus size={14} /> Nuevo presupuesto</Link>
        <Link to="/importar" className="btn secondary small"><Download size={14} /> Importar</Link>
        <Link to="/reportes" className="btn secondary small"><TrendingUp size={14} /> Reportes</Link>
        <Link to="/presupuestos" className="btn secondary small"><FileText size={14} /> Ver todos</Link>
      </div>

      {/* Charts Grid 2x2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Riesgo Donut */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">Riesgo</h3>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: 11 }} />
                <Pie data={riesgoData} cx="50%" cy="50%" innerRadius={30} outerRadius={48} paddingAngle={2} dataKey="value" animationBegin={0} animationDuration={600} animationEasing="ease-out">
                  {riesgoData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v}`, n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2 flex-wrap">
            {riesgoData.map(d => (
              <span key={d.name} className="inline-flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-ink-muted">{d.name}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Trend Chart */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">Tendencia mensual</h3>
          <TrendChart data={data.tendencias} />
        </div>

        {/* Por Gestor */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">Por gestor</h3>
          {gestorStackData.length > 0 ? (
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={gestorStackData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" tickFormatter={v => `${v}k`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={50} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v, n) => [`${v}`, n === 'total' ? 'Total' : 'Críticos']} />
                <Bar dataKey="total" fill="#3b82f6" stackId="a" radius={[0, 3, 3, 0]} />
                <Bar dataKey="criticos" fill="#ef4444" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-xs text-ink-muted py-6 text-center">Sin datos</div>
          )}
        </div>

        {/* Estado Chart */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">Estado</h3>
          <EstadoChart data={estadoCounts} />
        </div>
      </div>

      {/* Sections Tabs */}
      <DashboardTabs tabs={tabs} />
    </div>
  )
}