import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { AlertTriangle, Clock3, Euro, TrendingUp } from 'lucide-react'
import { api, euro } from '../utils/api'
import { useData } from '../utils/useData'

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

async function downloadExcel() {
  try {
    const res = await fetch('/api/reports/export', { headers: { ...api.authHeaders() } })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `presucontrol_informe_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('Export failed:', e)
  }
}

export function Informes() {
  const { data, loading, error } = useData<Report>(() => api.get('/reports'), [])
  if (loading) return <div className="card">Cargando informes...</div>
  if (error || !data) return <div className="error">{error || 'Error'}</div>
  const conversionRate = data.tasa_conversion ?? 0
  const avgTime = data.tiempo_medio_fase ?? 0
  return <>
    <PageHeader title="Informes" subtitle="Métricas de seguimiento para dirección y administración." actions={<button className="btn secondary" onClick={downloadExcel}><Download size={16}/>Exportar Excel</button>} />
    <div className="grid cards">
      <StatCard label="Importe aceptado pendiente pedido" value={euro(data.metricas.importe_aceptado_pendiente_pedido)} icon={Euro} />
      <StatCard label="Días medios aceptación → pedido" value={data.metricas.dias_medios_aceptacion_a_pedido} icon={Clock3} />
      <StatCard label="Presupuestos bloqueados" value={data.metricas.bloqueados} icon={AlertTriangle} />
      {conversionRate > 0 && <StatCard label="Tasa conversión" value={`${conversionRate}%`} icon={TrendingUp} />}
      {avgTime > 0 && <StatCard label="Tiempo medio por fase" value={`${avgTime}d`} icon={Clock3} />}
    </div>
    <div className="sections">
      <Chart title="Presupuestos por estado" data={data.presupuestos_por_estado} />
      <Chart title="Prioridades" data={data.prioridades} />
      <TrendChart title="Aceptados por mes (tendencia)" data={data.aceptados_por_mes} />
      <Chart title="Cancelados / rechazados por mes" data={data.cancelados_por_mes} />
      <Chart title="Pendientes por gestor" data={data.pendientes_por_gestor} />
      <Chart title="Pendientes por proveedor" data={data.pendientes_por_proveedor} />
    </div>
  </>
}

function Chart({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return <section className="card"><h3>{title}</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={80}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="value" /></BarChart></ResponsiveContainer></div></section>
}

function TrendChart({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return <section className="card"><h3>{title}</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={80}/><YAxis allowDecimals={false}/><Tooltip /><Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} /></LineChart></ResponsiveContainer></div></section>
}
