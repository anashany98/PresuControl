import { Link } from 'react-router-dom'
import { Package, ShieldAlert } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PresupuestosTable } from './Presupuestos'
import { SkeletonTable } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'
import { api, euro, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'

export function AceptadosSinPedido() {
  const { data, loading, error, reload } = useData<Presupuesto[]>(() => api.get('/aceptados-sin-pedido'), [])
  const total = (data || []).reduce((sum, p) => sum + (p.importe || 0), 0)
  return <>
    <PageHeader title="Aceptados sin pedido proveedor" subtitle="Pantalla crítica: todo lo que está aceptado por cliente pero aún no consta como pedido al proveedor." actions={<><button className="btn secondary" onClick={reload}>Actualizar</button><Link className="btn" to="/nuevo">Nuevo</Link></>} />
    <div className="grid cards" style={{ marginBottom: 16 }}>
      <div className="card stat"><div><div className="value">{data?.length || 0}</div><div className="label">Presupuestos bloqueando compra</div></div><div className="icon"><ShieldAlert size={18}/></div></div>
      <div className="card stat"><div><div className="value">{euro(total)}</div><div className="label">Importe aceptado pendiente de pedido</div></div><div className="icon"><ShieldAlert size={18}/></div></div>
    </div>
    {error && <div className="error">{error}</div>}
    {loading ? <SkeletonTable rows={6} /> : (data && data.length === 0 ? <EmptyState icon={Package} title="Sin presupuestos aceptados sin pedido" description="Todos los presupuestos aceptados ya tienen pedido al proveedor. Sigue avanzando desde el Kanban." actions={[{ label: 'Ir al Kanban', to: '/kanban' }, { label: 'Ver todos', to: '/presupuestos' }]} /> : <PresupuestosTable rows={data || []} />)}
  </>
}
