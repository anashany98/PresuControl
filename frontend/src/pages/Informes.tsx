import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { Download } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { AlertTriangle, Clock3, Euro, TrendingUp, Users, Building2 } from 'lucide-react'
import { api, euro, getAuthToken } from '../utils/api'
import { useData } from '../utils/useData'
import { useToast } from '../utils/toast'
import { PRIORITY_COLOR, ESTADO_COLOR } from '../utils/tokens'

type Report = {
  presupuestos_por_estado: { name: string; value: number }[]
  prioridades: { name: string; value: number }[]
  aceptados_por_mes: { name: string; value: number }[]
  cancelados_por_mes: { name: string; value: number }[]
  pendientes_por_gestor: { name: string; value: number }[]
  pendientes_por_proveedor: { name: string; value: number }[]
  metricas: { importe_aceptado_pendiente_pedido: number; dias_medios_aceptacion_a_pedido: number; bloqueados: number }
  tasa_conversion?: number
  tiempo_medio_fase?: number
}

async function downloadExcel(toastFn: (msg: string) => void) {
  try {
    const token = getAuthToken()
    const res = await fetch('/api/reports/export', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `presucontrol_informe_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    toastFn('Descarga iniciada')
  } catch {
    toastFn('Error exportando')
  }
}

export function Informes() {
  const toast = useToast()
  const { data, loading, error } = useData<Report>(() => api.get('/reports'), [])
  if (loading) return <div className="card">Cargando informes...</div>
  if (error || !data) return <div className="error">{error || 'Error'}</div>
  const conversionRate = data.tasa_conversion ?? 0
  const avgTime = data.tiempo_medio_fase ?? 0

  return <>
    <PageHeader title="Informes" subtitle="Métricas de seguimiento para dirección y administración." actions={<button className="btn secondary" onClick={() => downloadExcel(toast.error)}><Download size={16}/>Exportar Excel</button>} />

    {/* KPIs Row */}
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      <KpiCard label="Pendiente pedido" value={euro(data.metricas.importe_aceptado_pendiente_pedido)} icon={Euro} />
      <KpiCard label="Días a pedido" value={`${data.metricas.dias_medios_aceptacion_a_pedido}d`} icon={Clock3} />
      <KpiCard label="Bloqueados" value={data.metricas.bloqueados} icon={AlertTriangle} tone={data.metricas.bloqueados > 0 ? '#ef4444' : undefined} />
      {conversionRate > 0 && <KpiCard label="Conversión" value={`${conversionRate}%`} icon={TrendingUp} />}
      {avgTime > 0 && <KpiCard label="Tiempo medio" value={`${avgTime}d`} icon={Clock3} />}
    </div>

    {/* Charts Grid 2 columns */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <EstadoChart data={data.presupuestos_por_estado} />
      <PriorityChart data={data.prioridades} />
      <TrendChart title="Aceptados por mes" data={data.aceptados_por_mes} color="#22c55e" />
      <TrendChart title="Cancelados por mes" data={data.cancelados_por_mes} color="#ef4444" />
      <BarHChart title="Por gestor" data={data.pendientes_por_gestor} icon={Users} />
      <BarHChart title="Por proveedor" data={data.pendientes_por_proveedor} icon={Building2} />
    </div>
  </>
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: React.ComponentType<{ size?: number }>; tone?: string }) {
  return (
    <div className="card stat">
      <div>
        <div className="value" style={tone ? { color: tone } : undefined}>{value}</div>
        <div className="label">{label}</div>
      </div>
      <div className="icon"><Icon size={20} /></div>
    </div>
  )
}

function EstadoChart({ data }: { data: { name: string; value: number }[] }) {
  const items = [...data].sort((a, b) => b.value - a.value)
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">Por estado</h3>
      <ResponsiveContainer width="100%" height={Math.max(160, items.length * 28)}>
        <BarChart data={items} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v: number) => [v, 'Presupuestos']} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]}>
            {items.map((entry, i) => (
              <Cell key={i} fill={ESTADO_COLOR[entry.name] || '#6b7280'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function PriorityChart({ data }: { data: { name: string; value: number }[] }) {
  const priorityOrder = ['Crítico', 'Rojo', 'Naranja', 'Amarillo', 'Verde']
  const items = [...data].sort((a, b) => priorityOrder.indexOf(a.name) - priorityOrder.indexOf(b.name))
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">Prioridades</h3>
      <ResponsiveContainer width="100%" height={Math.max(120, items.length * 32)}>
        <BarChart data={items} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v: number) => [v, 'Presupuestos']} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]}>
            {items.map((entry, i) => (
              <Cell key={i} fill={PRIORITY_COLOR[entry.name] || '#6b7280'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function TrendChart({ title, data, color }: { title: string; data: { name: string; value: number }[]; color: string }) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={35} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function BarHChart({ title, data, icon: _Icon }: { title: string; data: { name: string; value: number }[]; icon: React.ComponentType<{ size?: number }> }) {
  const items = [...data].sort((a, b) => b.value - a.value).slice(0, 10)
  if (items.length === 0) return null
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={Math.max(120, items.length * 28)}>
        <BarChart data={items} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v: number) => [v, 'Presupuestos']} />
          <Bar dataKey="value" fill="#d47043" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
