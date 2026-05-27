import { CheckCircle2, Download, ShieldAlert } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PriorityBadge, StateBadge } from '../components/Badges'
import { api, exportUrl, fmtDate, getAuthToken, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'
import { Link } from 'react-router-dom'
import { PedidoSummaryBadge } from '../components/PedidoSummary'
import { SkeletonTable } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'

export function Riesgo() {
  const { data, loading, error } = useData<Presupuesto[]>(() => api.get('/riesgo'), [])
  return <>
    <PageHeader title="Riesgo de olvido" subtitle="Pantalla prioritaria: aceptados sin pedido, pedidos sin plazo, límites vencidos e incidencias." actions={<button className="btn" onClick={async () => {
    const token = getAuthToken()
    if (!token) return
    const url = exportUrl('aceptados_sin_pedido')
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const blob = await res.blob()
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `presucontrol_criticos_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(downloadUrl)
}}><Download size={16}/>Exportar críticos</button>} />
    <div className="notice" style={{ marginBottom: 16 }}><ShieldAlert size={16}/> Esta vista debe revisarse varias veces al día. Su objetivo es evitar que un presupuesto aceptado quede sin pedido proveedor.</div>
    {error && <div className="error">{error}</div>}
    {loading ? <SkeletonTable rows={5} /> : (!data || data.length === 0 ? <EmptyState icon={CheckCircle2} title="Sin presupuestos en riesgo" description="No hay presupuestos con riesgo de olvido. Todo esta bajo control." actions={[{ label: 'Ir al Dashboard', to: '/' }]} /> : <div className="table-wrap"><table>
      <thead><tr><th>Nº presupuesto</th><th>Cliente</th><th>Gestor</th><th>Estado</th><th>Días desde aceptación</th><th>Pedido proveedor</th><th>Responsable actual</th><th>Siguiente acción</th><th>Fecha límite</th><th>Prioridad</th></tr></thead>
      <tbody>{(data || []).map(p => <tr key={p.id}>
        <td><Link to={`/presupuestos/${p.id}`}><strong>{p.numero_presupuesto}</strong></Link></td><td>{p.cliente}</td><td>{p.gestor}</td><td><StateBadge value={p.estado}/></td><td>{p.fecha_aceptacion ? Math.max(Math.floor((Date.now()-new Date(p.fecha_aceptacion).getTime())/86400000),0) : '—'}</td><td><PedidoSummaryBadge presupuesto={p} variant="table" /></td><td>{p.responsable_actual || '—'}</td><td>{p.siguiente_accion || '—'}</td><td>{fmtDate(p.fecha_limite_siguiente_accion)}</td><td><PriorityBadge value={p.prioridad_calculada}/></td>
      </tr>)}</tbody>
    </table></div>)}
  </>
}
