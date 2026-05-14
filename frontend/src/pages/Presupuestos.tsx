import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Columns3, Download, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PriorityBadge, StateBadge } from '../components/Badges'
import { SkeletonTable } from '../components/Skeleton'
import { ESTADOS, api, euro, exportUrl, fmtDate, type PaginatedPresupuestos, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'

const PRIORIDADES = ['Verde','Amarillo','Naranja','Rojo','Crítico']
const defaultColumns = ['numero','cliente','obra','gestor','estado','importe','fechas','proveedor','pedido','responsable','accion','dias','prioridad','incidencia','ultima']

export function Presupuestos() {
  const [params, setParams] = useSearchParams({ page: '1', page_size: '50', ocultar_cerrados: 'true' })
  const [visible, setVisible] = useState<string[]>(defaultColumns)
  const [compact, setCompact] = useState(false)
  const query = params.toString()
  const { data, loading, error, reload } = useData<PaginatedPresupuestos>(() => api.get(`/presupuestos-page?${query}`), [query])
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (!['page','page_size'].includes(key)) next.set('page', '1')
    setParams(next)
  }
  const reset = () => setParams({ page: '1', page_size: '50', ocultar_cerrados: 'true' })
  const toggleColumn = (key: string) => setVisible(cols => cols.includes(key) ? cols.filter(c => c !== key) : [...cols, key])
  const rows = data?.items || []
  const has = (key: string) => visible.includes(key)
  const paramsForExport = useMemo(() => new URLSearchParams(params), [params])
  return (
    <>
      <PageHeader title="Presupuestos" subtitle="Tabla paginada con filtros, columnas configurables y exportación." actions={<Link className="btn" to="/nuevo"><Plus size={17}/>Nuevo</Link>} />
      <div className="card">
        <div className="toolbar">
          <input className="input" style={{ maxWidth: 310 }} value={params.get('search') || ''} onChange={e => set('search', e.target.value)} placeholder="Buscar por nº, cliente, obra, gestor..." />
          <select className="select" style={{ maxWidth: 260 }} value={params.get('estado') || ''} onChange={e => set('estado', e.target.value)}><option value="">Todos los estados</option>{ESTADOS.map(e => <option key={e}>{e}</option>)}</select>
          <select className="select" style={{ maxWidth: 170 }} value={params.get('prioridad') || ''} onChange={e => set('prioridad', e.target.value)}><option value="">Todas prioridades</option>{PRIORIDADES.map(e => <option key={e}>{e}</option>)}</select>
          <input className="input" style={{ maxWidth: 160 }} value={params.get('gestor') || ''} onChange={e => set('gestor', e.target.value)} placeholder="Gestor" />
          <input className="input" style={{ maxWidth: 170 }} value={params.get('proveedor') || ''} onChange={e => set('proveedor', e.target.value)} placeholder="Proveedor" />
          <select className="select" style={{ maxWidth: 150 }} value={params.get('incidencia') || ''} onChange={e => set('incidencia', e.target.value)}><option value="">Incidencias</option><option value="true">Con incidencia</option><option value="false">Sin incidencia</option></select>
        </div>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <select className="select" style={{ maxWidth: 180 }} value={params.get('sort_by') || 'ultima_actualizacion'} onChange={e => set('sort_by', e.target.value)}><option value="ultima_actualizacion">Última actualización</option><option value="fecha">Fecha</option><option value="importe">Importe</option><option value="prioridad">Prioridad</option><option value="dias_parado">Días parado</option></select>
          <select className="select" style={{ maxWidth: 120 }} value={params.get('sort_dir') || 'desc'} onChange={e => set('sort_dir', e.target.value)}><option value="desc">Desc</option><option value="asc">Asc</option></select>
          <select className="select" style={{ maxWidth: 140 }} value={params.get('page_size') || '50'} onChange={e => set('page_size', e.target.value)}><option value="25">25 filas</option><option value="50">50 filas</option><option value="100">100 filas</option><option value="200">200 filas</option></select>
          <label className="check"><input type="checkbox" checked={(params.get('ocultar_cerrados') ?? 'true') === 'true'} onChange={e => set('ocultar_cerrados', String(e.target.checked))}/> Ocultar cerrados</label>
          <label className="check"><input type="checkbox" checked={params.get('include_archivados') === 'true'} onChange={e => set('include_archivados', e.target.checked ? 'true' : '')}/> Ver archivados</label>
          <label className="check"><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)}/> Vista compacta</label>
          <button className="btn secondary" onClick={reload}><RefreshCw size={16}/>Actualizar</button>
          <button className="btn secondary" onClick={reset}><RotateCcw size={16}/>Limpiar</button>
          <a className="btn secondary" href={exportUrl('vista_actual', paramsForExport)}><Download size={16}/>Exportar vista</a>
        </div>
        <details className="column-panel">
          <summary><Columns3 size={15}/> Columnas visibles</summary>
          <div className="column-grid">{[
            ['numero','Nº'],['cliente','Cliente'],['obra','Obra'],['gestor','Gestor'],['estado','Estado'],['importe','Importe'],['fechas','Fechas'],['proveedor','Proveedor'],['pedido','Pedido proveedor'],['responsable','Responsable'],['accion','Acción'],['dias','Días parado'],['prioridad','Prioridad'],['incidencia','Incidencia'],['ultima','Última act.']
          ].map(([key,label]) => <label key={key} className="check"><input type="checkbox" checked={has(key)} onChange={() => toggleColumn(key)}/> {label}</label>)}</div>
        </details>
      </div>
      {data && <div className="summary-strip"><span><strong>{data.total}</strong> presupuestos</span><span><strong>{euro(data.importe_total)}</strong> importe filtrado</span><span>Página {data.page} de {data.total_pages}</span></div>}
      {error && <div className="error">{error}</div>}
      {loading ? <SkeletonTable rows={6} /> : <PresupuestosTable rows={rows} has={has} compact={compact} />}
      {data && <div className="pager"><button className="btn secondary" disabled={data.page <= 1} onClick={() => set('page', String(data.page - 1))}>Anterior</button><button className="btn secondary" disabled={data.page >= data.total_pages} onClick={() => set('page', String(data.page + 1))}>Siguiente</button></div>}
    </>
  )
}

export function PresupuestosTable({ rows, has, compact = false }: { rows: Presupuesto[]; has?: (key: string) => boolean; compact?: boolean }) {
  const show = has || (() => true)
  return <div className={`table-wrap ${compact ? 'compact-table' : ''}`} style={{ marginTop: 16 }}><table>
    <thead><tr>
      {show('numero') && <th>Nº presupuesto</th>}{show('cliente') && <th>Cliente</th>}{show('obra') && <th>Obra / referencia</th>}{show('gestor') && <th>Gestor</th>}{show('estado') && <th>Estado</th>}{show('importe') && <th>Importe</th>}{show('fechas') && <th>Fechas</th>}{show('proveedor') && <th>Proveedor</th>}{show('pedido') && <th>Pedido proveedor</th>}{show('responsable') && <th>Responsable</th>}{show('accion') && <th>Siguiente acción</th>}{show('dias') && <th>Días parado</th>}{show('prioridad') && <th>Prioridad</th>}{show('incidencia') && <th>Incidencia</th>}{show('ultima') && <th>Última actualización</th>}
    </tr></thead>
    <tbody>{rows.map(p => <tr key={p.id} className={p.archivado ? 'row-muted' : ''}>
      {show('numero') && <td><Link to={`/presupuestos/${p.id}`}><strong>{p.numero_presupuesto}</strong></Link>{p.archivado && <div className="muted">Archivado</div>}</td>}
      {show('cliente') && <td>{p.cliente}</td>}
      {show('obra') && <td>{p.obra_referencia}</td>}
      {show('gestor') && <td>{p.gestor}</td>}
      {show('estado') && <td><StateBadge value={p.estado}/></td>}
      {show('importe') && <td className="money">{euro(p.importe)}</td>}
      {show('fechas') && <td><small>Presu: {fmtDate(p.fecha_presupuesto)}<br/>Envío: {fmtDate(p.fecha_envio_cliente)}<br/>Acept.: {fmtDate(p.fecha_aceptacion)}</small></td>}
      {show('proveedor') && <td>{p.proveedor || '—'}</td>}
      {show('pedido') && <td><small>{p.pedido_proveedor_realizado ? 'Sí' : 'No'}<br/>{p.numero_pedido_proveedor || '—'}<br/>{fmtDate(p.fecha_pedido_proveedor)} · Plazo {fmtDate(p.plazo_proveedor)}</small></td>}
      {show('responsable') && <td>{p.responsable_actual || '—'}</td>}
      {show('accion') && <td><strong>{p.siguiente_accion || '—'}</strong><br/><small>Vence: {fmtDate(p.fecha_limite_siguiente_accion)}</small></td>}
      {show('dias') && <td>{p.dias_parado}</td>}
      {show('prioridad') && <td><PriorityBadge value={p.prioridad_calculada}/></td>}
      {show('incidencia') && <td>{p.incidencia ? 'Sí' : 'No'}</td>}
      {show('ultima') && <td>{fmtDate(p.fecha_ultima_actualizacion)}</td>}
    </tr>)}</tbody>
  </table></div>
}
