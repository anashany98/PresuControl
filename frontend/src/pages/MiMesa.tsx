import { BriefcaseBusiness, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PresupuestosTable } from './Presupuestos'
import { SkeletonTable } from '../components/Skeleton'
import { api, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'

type MiMesaResponse = {
  usuario: { id?: number; nombre?: string; email?: string }
  items: Presupuesto[]
  resumen: { total: number; vencidos: number; criticos: number; incidencias: number; aceptados_sin_pedido: number }
}

export function MiMesa() {
  const { data, loading, error, reload } = useData<MiMesaResponse>(() => api.get('/mi-mesa'), [])
  const r = data?.resumen
  return <>
    <PageHeader title="Mi mesa de trabajo" subtitle={`Acciones pendientes vinculadas al usuario actual${data?.usuario?.nombre ? `: ${data.usuario.nombre}` : ''}.`} actions={<button className="btn secondary" onClick={reload}><RefreshCw size={16}/>Actualizar</button>} />
    <div className="grid cards">
      <div className="card hero-mini"><BriefcaseBusiness size={22}/><div><strong>{r?.total || 0}</strong><p>Tareas visibles</p></div></div>
      <div className="card"><strong>{r?.vencidos || 0}</strong><p className="muted">Vencidos</p></div>
      <div className="card"><strong>{r?.criticos || 0}</strong><p className="muted">Críticos</p></div>
      <div className="card"><strong>{r?.aceptados_sin_pedido || 0}</strong><p className="muted">Aceptados sin pedido</p></div>
      <div className="card"><strong>{r?.incidencias || 0}</strong><p className="muted">Incidencias</p></div>
    </div>
    {error && <div className="error">{error}</div>}
    {loading ? <SkeletonTable rows={6} /> : <PresupuestosTable rows={data?.items || []} compact />}
  </>
}
