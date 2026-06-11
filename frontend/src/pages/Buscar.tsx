import { Link, useSearchParams } from 'react-router-dom'
import { FileSearch, Search } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PriorityBadge, StateBadge } from '../components/Badges'
import { useSearch } from '../utils/useQueries'
import { euro, fmtDate } from '../utils/api'
import { PedidoSummaryBadge } from '../components/PedidoSummary'
import { SkeletonTable } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'

type ComentarioSearch = { id: number; comentario: string; presupuesto_id: number; numero_presupuesto: string; cliente: string; creado_en: string; usuario_nombre?: string }
type HistorialSearch = { id: number; descripcion: string; presupuesto_id: number; numero_presupuesto: string; cliente: string; creado_en: string; usuario_nombre?: string }

export function Buscar() {
  const [params] = useSearchParams()
  const q = params.get('q') || ''
  const { data, isLoading, error } = useSearch(q)
  return <>
    <PageHeader title="Búsqueda global" subtitle={q ? `Resultados para “${q}”` : 'Busca por nº presupuesto, cliente, obra, proveedor, comentarios o historial.'} />
    {isLoading && <SkeletonTable rows={4} />}
    {error && <div className="error">{(error as Error).message}</div>}
    {!isLoading && data && data.presupuestos.length === 0 && data.comentarios.length === 0 && data.historial.length === 0 && q && <EmptyState icon={FileSearch} title={`Sin resultados para "${q}"`} description="Prueba con otro termino de busqueda." actions={[{ label: 'Ver todos los presupuestos', to: '/presupuestos' }]} />}
    <section className="card"><h3><Search size={17}/> Presupuestos</h3><div className="table-wrap"><table><thead><tr><th>Nº</th><th>Cliente</th><th>Estado</th><th>Importe</th><th>Pedidos</th><th>Prioridad</th><th>Última act.</th></tr></thead><tbody>
      {data?.presupuestos.map(p => <tr key={p.id}><td><Link to={`/presupuestos/${p.id}`}><strong>{p.numero_presupuesto}</strong></Link></td><td>{String(p.cliente || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}<br/><small>{String(p.obra_referencia || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</small></td><td><StateBadge value={p.estado}/></td><td>{euro(p.importe)}</td><td><PedidoSummaryBadge presupuesto={p} variant="table" /></td><td><PriorityBadge value={p.prioridad_calculada}/></td><td>{fmtDate(p.fecha_ultima_actualizacion)}</td></tr>)}
    </tbody></table></div></section>
    <div className="sections" style={{ marginTop: 16 }}>
      <section className="card"><h3>Comentarios encontrados</h3><div className="timeline">{(data?.comentarios as unknown as ComentarioSearch[] | undefined)?.map(c => <div className="timeline-item" key={c.id}><Link to={`/presupuestos/${c.presupuesto_id}`}>Presupuesto #{c.presupuesto_id}</Link><br/><strong>{String(c.comentario || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</strong><br/><small>{fmtDate(c.creado_en)} · {c.usuario_nombre || 'Sin usuario'}</small></div>)}</div></section>
      <section className="card"><h3>Historial encontrado</h3><div className="timeline">{(data?.historial as unknown as HistorialSearch[] | undefined)?.map(h => <div className="timeline-item" key={h.id}><Link to={`/presupuestos/${h.presupuesto_id}`}>Presupuesto #{h.presupuesto_id}</Link><br/><strong>{String(h.descripcion || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</strong><br/><small>{fmtDate(h.creado_en)} · {h.usuario_nombre || 'Sin usuario'}</small></div>)}</div></section>
    </div>
  </>
}
