import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Download, FilePlus, FileText, Package, PackageCheck, ShieldAlert, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, euro, fmtDate, type Presupuesto, ESTADOS } from '../utils/api'
import { useData } from '../utils/useData'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { PedidoSummaryBadge } from '../components/PedidoSummary'
import { getPedidoExceptionScore, getPedidoSummary } from '../utils/pedidoSummary'

type DashboardData = {
  cards: Record<string, number>
  sections: Record<string, Presupuesto[]>
  pedidos_pendientes?: Presupuesto[]
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

const PRIORITY_COLORS: Record<string, string> = {
  'Crítico': '#dc2626',
  'Rojo': '#ef4444',
  'Naranja': '#f97316',
  'Amarillo': '#eab308',
  'Verde': '#22c55e',
}

function MiniStat({ label, value, sublabel, tone }: { label: string; value: string | number; sublabel?: string; tone?: string }) {
  return (
    <div className="mini-stat" style={tone ? { borderLeftColor: tone } : undefined}>
      <div className="mini-stat-value" style={tone ? { color: tone } : undefined}>{value}</div>
      <div className="mini-stat-label">{label}</div>
      {sublabel && <div className="mini-stat-sub">{sublabel}</div>}
    </div>
  )
}

function PriorityRow({ prioridad, count, color }: { prioridad: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="priority-dot" style={{ background: color }} />
      <span className="text-sm flex-1">{prioridad}</span>
      <span className="text-sm font-mono" style={{ color }}>{count}</span>
    </div>
  )
}

function EstadoBar({ estado, count, color }: { estado: string; count: number; color: string }) {
  return (
    <div className="estado-item" title={`${estado}: ${count}`}>
      <div className="estado-bar" style={{ background: color, height: `${Math.max(4, count * 3)}px`, width: `${Math.max(4, count * 2)}px` }} />
      <span className="text-xs muted">{count}</span>
    </div>
  )
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link to={to} className="quick-link">
      <Icon size={14} />
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
          <span className="num-sm">{p.numero_presupuesto}</span>
          <span className="cliente-sm">{p.cliente}</span>
          <span className={`priority-dot-sm`} style={{ background: PRIORITY_COLORS[p.prioridad_calculada] || '#ccc' }} />
          <span className="estado-sm text-xs" style={{ color: ESTADO_COLORS[p.estado] }}>{p.estado.split(' - ')[0]}</span>
          {p.fecha_limite_siguiente_accion && <span className="fecha-sm text-xs muted">{fmtDate(p.fecha_limite_siguiente_accion)}</span>}
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
  if (error) return <div className="error p-4">{error}</div>

  const cards = data!.cards
  const allPresupuestos = Object.values(data!.sections).flat()
  const uniquePresupuestos = allPresupuestos.filter((p, i, a) => a.findIndex(x => x.id === p.id) === i)

  const estadoCounts = ESTADOS.map(e => ({
    estado: e.split(' - ')[0],
    count: uniquePresupuestos.filter(p => p.estado === e).length,
    color: ESTADO_COLORS[e] || '#e5e7eb',
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
    <div className="dashboard-compact">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-xs muted">Vista rápida de presupuestos activos</p>
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

      <div className="stats-row">
        <MiniStat label="Total activos" value={cards.total_activos} />
        <MiniStat label="Aceptados s/ pedido" value={cards.aceptados_sin_pedido} sublabel={euro(cards.importe_aceptado_pendiente_pedido)} tone={cards.aceptados_sin_pedido ? '#dc2626' : undefined} />
        <MiniStat label="Enviados s/ respuesta" value={cards.enviados_sin_respuesta} tone={cards.enviados_sin_respuesta ? '#f97316' : undefined} />
        <MiniStat label="Pedidos s/ plazo" value={cards.pedidos_sin_plazo} />
        <MiniStat label="Incidencias" value={cards.incidencias_abiertas} tone={cards.incidencias_abiertas ? '#ea580c' : undefined} />
        <MiniStat label="Cerrados mes" value={cards.cerrados_mes} />
        {cards.pedidos_pendientes != null && <MiniStat label="Pedidos pendientes" value={cards.pedidos_pendientes} tone={cards.pedidos_pendientes ? '#8b5cf6' : undefined} />}
      </div>

      <div className="flex gap-3 quick-links-row">
        <QuickLink to="/nuevo" icon={FilePlus} label="Nuevo presupuesto" />
        <QuickLink to="/importar" icon={Download} label="Importar" />
        <QuickLink to="/reportes" icon={TrendingUp} label="Reportes" />
        <QuickLink to="/presupuestos" icon={FileText} label="Ver todos" />
      </div>

      <div className="dashboard-grid">
        <div className="dash-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Prioridades</h3>
            <div className="flex gap-1">
              {Object.entries(priorityCounts).map(([p, c]) => (
                <span key={p} className="priority-badge" style={{ background: PRIORITY_COLORS[p], opacity: c > 0 ? 1 : 0.2 }}>{c}</span>
              ))}
            </div>
          </div>
          <div className="priority-breakdown">
            {Object.entries(priorityCounts).map(([p, c]) => (
              <PriorityRow key={p} prioridad={p} count={c} color={PRIORITY_COLORS[p]} />
            ))}
          </div>
        </div>

        <div className="dash-card">
          <h3 className="text-sm font-medium mb-2">Estado</h3>
          <div className="estado-summary">
            {estadoCounts.map(e => <EstadoBar key={e.estado} estado={e.estado} count={e.count} color={e.color} />)}
          </div>
        </div>

        {showCharts && (
          <>
            <div className="dash-card">
              <h3 className="text-sm font-medium mb-2">Riesgo</h3>
              <ResponsiveContainer width="100%" height={100}>
                <PieChart>
                  <Pie data={riesgoData} cx="50%" cy="50%" innerRadius={30} outerRadius={45} paddingAngle={2} dataKey="value">
                    {riesgoData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v}`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-3 mt-1">
                {riesgoData.map(d => (
                  <span key={d.name} className="text-xs flex items-center gap-1">
                    <span className="legend-dot-sm" style={{ background: d.color }} />
                    {d.name}
                  </span>
                ))}
              </div>
            </div>

            {gestorData.length > 0 && (
              <div className="dash-card">
                <h3 className="text-sm font-medium mb-2">Por gestor (k€)</h3>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={gestorData} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <XAxis type="number" tickFormatter={v => `${v}k`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={50} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => [`${Number(v).toLocaleString('es-ES')}k€`, 'Importe']} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>

      <div className="sections-compact">
        <div className="section-row">
          <div className="section-header">
            <Package size={14} className="text-purple-500" />
            <span className="text-sm font-medium">Excepciones pedidos proveedor</span>
            <span className="badge purple">{pedidoExceptions.length}</span>
          </div>
          <div className="pedido-exception-list">
            {pedidosData.loading && <span className="muted text-xs">Cargando pedidos...</span>}
            {!pedidosData.loading && pedidoExceptions.length === 0 && <span className="muted text-xs">Sin excepciones de pedidos</span>}
            {pedidoExceptions.map(({ p, summary }) => (
              <Link to={`/kanban?focus=${p.id}`} className="pedido-exception-item" key={p.id}>
                <div className="pedido-exception-text">
                  <strong>{p.numero_presupuesto} · {p.cliente}</strong>
                  <span>{p.obra_referencia || 'Sin obra'}</span>
                </div>
                <PedidoSummaryBadge presupuesto={p} summary={summary} variant="mini" />
              </Link>
            ))}
          </div>
        </div>

        <div className="section-row">
          <div className="section-header">
            <ShieldAlert size={14} className="text-red-500" />
            <span className="text-sm font-medium">Críticos (aceptados sin pedido)</span>
            <span className="badge red">{data!.sections.criticos_aceptados_sin_pedido.length}</span>
          </div>
          <CompactList items={data!.sections.criticos_aceptados_sin_pedido} maxItems={5} />
        </div>

        <div className="section-row">
          <div className="section-header">
            <Clock3 size={14} className="text-orange-500" />
            <span className="text-sm font-medium">Pendientes respuesta</span>
            <span className="badge orange">{data!.sections.pendientes_respuesta_cliente.length}</span>
          </div>
          <CompactList items={data!.sections.pendientes_respuesta_cliente} maxItems={5} />
        </div>

        <div className="section-row">
          <div className="section-header">
            <PackageCheck size={14} className="text-yellow-500" />
            <span className="text-sm font-medium">Pedidos sin plazo</span>
            <span className="badge yellow">{data!.sections.pedidos_sin_plazo.length}</span>
          </div>
          <CompactList items={data!.sections.pedidos_sin_plazo} maxItems={5} />
        </div>

        <div className="section-row">
          <div className="section-header">
            <AlertTriangle size={14} className="text-orange-600" />
            <span className="text-sm font-medium">Incidencias abiertas</span>
            <span className="badge orange">{data!.sections.incidencias_abiertas.length}</span>
          </div>
          <CompactList items={data!.sections.incidencias_abiertas} maxItems={5} />
        </div>

        <div className="section-row">
          <div className="section-header">
            <Package size={14} className="text-blue-500" />
            <span className="text-sm font-medium">Próximas fechas límite</span>
          </div>
          <CompactList items={data!.sections.proximas_fechas_limite} maxItems={5} />
        </div>

        {data!.sections.pedidos_pendientes?.length > 0 && (
          <div className="section-row">
            <div className="section-header">
              <Package size={14} className="text-purple-500" />
              <span className="text-sm font-medium">Pedidos pendientes</span>
              <span className="badge purple">{data!.sections.pedidos_pendientes.length}</span>
            </div>
            <CompactList items={data!.sections.pedidos_pendientes} maxItems={5} />
          </div>
        )}
      </div>
    </div>
  )
}
