import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Download, FilePlus, FileText, Package, PackageCheck, ShieldAlert, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, euro, fmtDate, type Presupuesto, ESTADOS } from '../utils/api'
import { ESTADO_COLOR, PRIORITY_COLOR } from '../utils/tokens'
import { useData } from '../utils/useData'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { PedidoSummaryBadge } from '../components/PedidoSummary'
import { getPedidoExceptionScore, getPedidoSummary } from '../utils/pedidoSummary'

type DashboardData = {
  cards: Record<string, number>
  sections: Record<string, Presupuesto[]>
  pedidos_pendientes?: Presupuesto[]
}

function MiniStat({ label, value, sublabel, tone }: { label: string; value: string | number; sublabel?: string; tone?: string }) {
  const toneClass = tone === '#dc2626' || tone === '#ef4444'
    ? 'border-l-danger'
    : tone === '#f97316' || tone === '#ea580c'
    ? 'border-l-warning'
    : tone === '#8b5cf6'
    ? 'border-l-purple-500'
    : ''

  return (
    <div className={`stat stat-card ${toneClass}`}>
      <div>
        <div className="value" style={tone ? { color: tone } : undefined}>{value}</div>
        <div className="label">{label}</div>
        {sublabel && <div className="text-xs text-ink-muted mt-1">{sublabel}</div>}
      </div>
    </div>
  )
}

function PriorityRow({ prioridad, count, color }: { prioridad: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-sm flex-1 text-ink">{prioridad}</span>
      <span className="text-sm font-mono font-semibold" style={{ color }}>{count}</span>
    </div>
  )
}

function EstadoBar({ estado, count, color }: { estado: string; count: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1" title={`${estado}: ${count}`}>
      <div className="rounded-full" style={{ backgroundColor: color, height: `${Math.max(4, count * 3)}px`, width: `${Math.max(4, count * 2)}px` }} />
      <span className="text-xs text-ink-muted">{count}</span>
    </div>
  )
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-panel border border-border text-sm text-ink hover:bg-brand-50 hover:border-brand-200 transition-all duration-150">
      <Icon size={14} className="text-brand-500" />
      <span>{label}</span>
    </Link>
  )
}

function CompactList({ items, maxItems = 8 }: { items: Presupuesto[]; maxItems?: number }) {
  const displayItems = items.slice(0, maxItems)
  return (
    <div className="compact-list">
      {displayItems.length === 0 && <span className="muted text-xs">Sin registros</span>}
      {displayItems.map(p => (
        <Link to={`/presupuestos/${p.id}`} className="compact-row-sm" key={p.id}>
          <span className="num-sm font-mono">{p.numero_presupuesto}</span>
          <span className="cliente-sm text-ink">{p.cliente}</span>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PRIORITY_COLOR[p.prioridad_calculada] || '#ccc' }} />
          <span className="text-xs text-ink-muted">{p.estado.split(' - ')[0]}</span>
          {p.fecha_limite_siguiente_accion && <span className="fecha-sm text-xs muted font-mono">{fmtDate(p.fecha_limite_siguiente_accion)}</span>}
        </Link>
      ))}
      {items.length > maxItems && <div className="text-xs muted pl-2">+{items.length - maxItems} más</div>}
    </div>
  )
}

export function Dashboard() {
  const { data, loading, error } = useData<DashboardData>(() => api.get('/dashboard'), [])
  const pedidosData = useData<Presupuesto[]>(() => api.get('/presupuestos?limit=2000&ocultar_cerrados=false'), [])
  const [showCharts, setShowCharts] = useState(true)

  const pedidoExceptions = useMemo(() => {
    return (pedidosData.data || [])
      .map(p => {
        const summary = getPedidoSummary(p)
        return { p, summary, score: getPedidoExceptionScore(summary) }
      })
      .filter(item => item.summary.tieneExcepciones)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }, [pedidosData.data])

  if (loading) return <div className="p-4"><div className="skeleton h-48" /></div>
  if (error || !data) return <div className="error p-4">{error || 'No se pudo cargar el dashboard'}</div>

  const cards = data.cards
  const allPresupuestos = Object.values(data.sections).flat()
  const uniquePresupuestos = allPresupuestos.filter((p, i, a) => a.findIndex(x => x.id === p.id) === i)

  const estadoCounts = ESTADOS.map(e => ({
    estado: e.split(' - ')[0],
    count: uniquePresupuestos.filter(p => p.estado === e).length,
    color: ESTADO_COLOR[e] || '#e5e7eb',
  })).filter(d => d.count > 0)

  const priorityCounts = { 'Crítico': 0, 'Rojo': 0, 'Naranja': 0, 'Amarillo': 0, 'Verde': 0 }
  uniquePresupuestos.forEach(p => {
    if (priorityCounts[p.prioridad_calculada as keyof typeof priorityCounts] !== undefined)
      priorityCounts[p.prioridad_calculada as keyof typeof priorityCounts]++
  })

  const riesgoData = [
    { name: 'Críticos', value: cards.aceptados_sin_pedido, color: '#ef4444' },
    { name: 'En riesgo', value: cards.enviados_sin_respuesta, color: '#f97316' },
    { name: 'Seguimiento', value: cards.pedidos_sin_plazo, color: '#eab308' },
    { name: 'OK', value: Math.max(0, cards.total_activos - cards.aceptados_sin_pedido - cards.enviados_sin_respuesta - cards.pedidos_sin_plazo), color: '#22c55e' },
  ]

  const byGestor: Record<string, number> = {}
  uniquePresupuestos.forEach(p => { byGestor[p.gestor] = (byGestor[p.gestor] || 0) + p.importe })
  const gestorData = Object.entries(byGestor).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, value]) => ({ name: name.split(' ')[0], value: Math.round(value / 1000) }))

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Dashboard</h1>
          <p className="text-sm text-ink-muted mt-0.5">Vista rápida de presupuestos activos</p>
        </div>
        <div className="flex gap-2">
          <button className={`btn secondary small ${showCharts ? 'active' : ''}`} onClick={() => setShowCharts(!showCharts)}>
            {showCharts ? 'Ocultar' : 'Ver'} charts
          </button>
          <Link className="btn primary small" to="/nuevo">
            <FilePlus size={14} /> Nuevo
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-4 stats-row">
        <MiniStat label="Total activos" value={cards.total_activos} />
        <MiniStat label="Aceptados s/ pedido" value={cards.aceptados_sin_pedido} sublabel={euro(cards.importe_aceptado_pendiente_pedido)} tone={cards.aceptados_sin_pedido ? '#dc2626' : undefined} />
        <MiniStat label="Enviados s/ respuesta" value={cards.enviados_sin_respuesta} tone={cards.enviados_sin_respuesta ? '#f97316' : undefined} />
        <MiniStat label="Pedidos s/ plazo" value={cards.pedidos_sin_plazo} />
        <MiniStat label="Incidencias" value={cards.incidencias_abiertas} tone={cards.incidencias_abiertas ? '#ea580c' : undefined} />
        <MiniStat label="Cerrados mes" value={cards.cerrados_mes} />
        {cards.pedidos_pendientes != null && <MiniStat label="Pedidos pendientes" value={cards.pedidos_pendientes} tone={cards.pedidos_pendientes ? '#8b5cf6' : undefined} />}
      </div>

      {/* Quick Links */}
      <div className="flex flex-wrap gap-2 mb-6">
        <QuickLink to="/nuevo" icon={FilePlus} label="Nuevo presupuesto" />
        <QuickLink to="/importar" icon={Download} label="Importar" />
        <QuickLink to="/reportes" icon={TrendingUp} label="Reportes" />
        <QuickLink to="/presupuestos" icon={FileText} label="Ver todos" />
      </div>

      {/* Charts Grid */}
      <div className="charts-section mb-6">
        <div className="charts-grid">
          {/* Priorities Card */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">Prioridades</h3>
              <div className="flex gap-1.5">
                {Object.entries(priorityCounts).map(([p, c]) => (
                  <span key={p} className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white" style={{ backgroundColor: PRIORITY_COLOR[p], opacity: c > 0 ? 1 : 0.2 }}>{c}</span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              {Object.entries(priorityCounts).map(([p, c]) => (
                <PriorityRow key={p} prioridad={p} count={c} color={PRIORITY_COLOR[p]} />
              ))}
            </div>
          </div>

          {/* Estado Card */}
          <div className="card">
            <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">Estado</h3>
            <div className="flex items-end gap-3 justify-center flex-wrap">
              {estadoCounts.map(e => <EstadoBar key={e.estado} estado={e.estado} count={e.count} color={e.color} />)}
            </div>
          </div>

          {showCharts && (
            <>
              {/* Riesgo Donut */}
              <div className="card">
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

              {/* Por Gestor Bar Chart */}
              {gestorData.length > 0 && (
                <div className="card">
                  <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">Por gestor (k€)</h3>
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={gestorData} layout="vertical" margin={{ left: 0, right: 20 }}>
                      <XAxis type="number" tickFormatter={v => `${v}k`} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={50} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => [`${Number(v).toLocaleString('es-ES')}k€`, 'Importe']} />
                      <Bar dataKey="value" fill="#d47043" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="sections-compact space-y-4">
        {/* Excepciones pedidos proveedor */}
        <div className="section-row bg-surface-panel rounded-xl border border-border p-4">
          <div className="section-header flex items-center gap-2 mb-3">
            <Package size={14} className="text-purple-500" />
            <span className="text-sm font-semibold text-ink">Excepciones pedidos proveedor</span>
            <span className="badge">{pedidoExceptions.length}</span>
          </div>
          <div className="pedido-exception-list space-y-2">
            {pedidosData.loading && <span className="muted text-xs">Cargando pedidos...</span>}
            {!pedidosData.loading && pedidoExceptions.length === 0 && <span className="muted text-xs">Sin excepciones de pedidos</span>}
            {pedidoExceptions.map(({ p, summary }) => (
              <Link to={`/kanban?focus=${p.id}`} className="pedido-exception-item flex items-start justify-between gap-3 p-3 rounded-lg bg-white border border-border hover:border-brand-200 hover:shadow-soft transition-all" key={p.id}>
                <div className="pedido-exception-text min-w-0">
                  <strong className="text-sm text-ink block truncate">{p.numero_presupuesto} · {p.cliente}</strong>
                  <span className="text-xs text-ink-muted block truncate">{p.obra_referencia || 'Sin obra'}</span>
                </div>
                <PedidoSummaryBadge presupuesto={p} summary={summary} variant="mini" />
              </Link>
            ))}
          </div>
        </div>

        {/* Críticos */}
        <div className="section-row bg-surface-panel rounded-xl border border-border p-4">
          <div className="section-header flex items-center gap-2 mb-3">
            <ShieldAlert size={14} className="text-danger" />
            <span className="text-sm font-semibold text-ink">Críticos (aceptados sin pedido)</span>
            <span className="badge rojo">{data.sections.criticos_aceptados_sin_pedido.length}</span>
          </div>
          <CompactList items={data.sections.criticos_aceptados_sin_pedido} maxItems={5} />
        </div>

        {/* Pendientes respuesta */}
        <div className="section-row bg-surface-panel rounded-xl border border-border p-4">
          <div className="section-header flex items-center gap-2 mb-3">
            <Clock3 size={14} className="text-warning" />
            <span className="text-sm font-semibold text-ink">Pendientes respuesta</span>
            <span className="badge naranja">{data.sections.pendientes_respuesta_cliente.length}</span>
          </div>
          <CompactList items={data.sections.pendientes_respuesta_cliente} maxItems={5} />
        </div>

        {/* Pedidos sin plazo */}
        <div className="section-row bg-surface-panel rounded-xl border border-border p-4">
          <div className="section-header flex items-center gap-2 mb-3">
            <PackageCheck size={14} className="text-yellow-500" />
            <span className="text-sm font-semibold text-ink">Pedidos sin plazo</span>
            <span className="badge amarillo">{data.sections.pedidos_sin_plazo.length}</span>
          </div>
          <CompactList items={data.sections.pedidos_sin_plazo} maxItems={5} />
        </div>

        {/* Incidencias abiertas */}
        <div className="section-row bg-surface-panel rounded-xl border border-border p-4">
          <div className="section-header flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-orange-600" />
            <span className="text-sm font-semibold text-ink">Incidencias abiertas</span>
            <span className="badge naranja">{data.sections.incidencias_abiertas.length}</span>
          </div>
          <CompactList items={data.sections.incidencias_abiertas} maxItems={5} />
        </div>

        {/* Próximas fechas límite */}
        <div className="section-row bg-surface-panel rounded-xl border border-border p-4">
          <div className="section-header flex items-center gap-2 mb-3">
            <Package size={14} className="text-info" />
            <span className="text-sm font-semibold text-ink">Próximas fechas límite</span>
          </div>
          <CompactList items={data.sections.proximas_fechas_limite} maxItems={5} />
        </div>

        {/* Pedidos pendientes */}
        {data.sections.pedidos_pendientes?.length > 0 && (
          <div className="section-row bg-surface-panel rounded-xl border border-border p-4">
            <div className="section-header flex items-center gap-2 mb-3">
              <Package size={14} className="text-purple-500" />
              <span className="text-sm font-semibold text-ink">Pedidos pendientes</span>
              <span className="badge">{data.sections.pedidos_pendientes.length}</span>
            </div>
            <CompactList items={data.sections.pedidos_pendientes} maxItems={5} />
          </div>
        )}
      </div>
    </div>
  )
}