import { useMemo, useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Columns3, Download, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PriorityBadge, StateBadge } from '../components/Badges'
import { SkeletonTable } from '../components/Skeleton'
import { OptionInput } from '../components/OptionInput'
import { ESTADOS, api, euro, exportUrl, fmtDate, getAuthToken, API_URL, type PaginatedPresupuestos, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'
import { useMetadataOptions } from '../utils/useMetadataOptions'
import { PedidoSummaryBadge } from '../components/PedidoSummary'

const PRIORIDADES = ['Verde','Amarillo','Naranja','Rojo','Crítico']
const defaultColumns = ['numero','cliente','gestor','estado','importe','pedido','accion','prioridad','ultima']
const quickFilters = [
  { key: 'mis_urgentes', label: 'Mis urgentes' },
  { key: 'sin_pedido', label: 'Sin pedido' },
  { key: 'pedidos_vencidos', label: 'Pedidos vencidos' },
  { key: 'sin_proxima_accion', label: 'Sin próxima acción' },
] as const

export function Presupuestos() {
  const [params, setParams] = useSearchParams({ page: '1', page_size: '50', ocultar_cerrados: 'true' })
  const [visible, setVisible] = useState<string[]>(defaultColumns)
  const [compact, setCompact] = useState(false)
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  // Load user preferences from API (fallback to localStorage)
  useEffect(() => {
    api.get<Record<string, any>>('/usuarios/me/preferencias')
      .then(prefs => {
        if (prefs.presupuestosColumns) setVisible(prefs.presupuestosColumns)
        if (prefs.presupuestosCompact != null) setCompact(prefs.presupuestosCompact)
      })
      .catch(() => {
        // Fallback to localStorage
        try {
          const saved = localStorage.getItem('presupuestosColumns')
          if (saved) setVisible(JSON.parse(saved))
          setCompact(localStorage.getItem('presupuestosCompact') === 'true')
        } catch {}
      })
      .finally(() => setPrefsLoaded(true))
  }, [])

  // Save to API + localStorage on change (skip initial load)
  useEffect(() => {
    if (!prefsLoaded) return
    const prefs = { presupuestosColumns: visible, presupuestosCompact: compact }
    api.patch('/usuarios/me/preferencias', prefs).catch(() => {})
    localStorage.setItem('presupuestosColumns', JSON.stringify(visible))
    localStorage.setItem('presupuestosCompact', String(compact))
  }, [visible, compact, prefsLoaded])
  const metadataOptions = useMetadataOptions()
  const query = params.toString()
  const { data, loading, error, reload } = useData<PaginatedPresupuestos>(() => api.get(`/presupuestos-page?${query}`), [query])
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (!['page','page_size'].includes(key)) next.set('page', '1')
    setParams(next)
  }
  const reset = () => setParams({ page: '1', page_size: '50', ocultar_cerrados: 'true' })
  const applyQuickFilter = (key: typeof quickFilters[number]['key']) => {
    const next = new URLSearchParams(params)
    next.set('page', '1')
    next.set('ocultar_cerrados', 'true')
    next.delete('estado')
    next.delete('prioridad')
    next.delete('filtro_rapido')
    if (key === 'mis_urgentes') {
      next.set('prioridad', 'Crítico')
      next.set('sort_by', 'prioridad')
      next.set('sort_dir', 'desc')
    } else if (key === 'sin_pedido') {
      next.set('filtro_rapido', 'sin_pedido')
      next.set('sort_by', 'ultima_actualizacion')
      next.set('sort_dir', 'desc')
    } else if (key === 'pedidos_vencidos') {
      next.set('filtro_rapido', 'pedidos_vencidos')
      next.set('sort_by', 'prioridad')
      next.set('sort_dir', 'desc')
    } else {
      next.set('filtro_rapido', 'sin_proxima_accion')
      next.set('sort_by', 'ultima_actualizacion')
      next.set('sort_dir', 'desc')
    }
    setParams(next)
  }
  const toggleColumn = (key: string) => setVisible(cols => cols.includes(key) ? cols.filter(c => c !== key) : [...cols, key])
  const rows = data?.items || []
  const has = (key: string) => visible.includes(key)
  const paramsForExport = useMemo(() => new URLSearchParams(params), [params])
  return (
    <>
      <PageHeader title="Presupuestos" subtitle="Tabla paginada con filtros, columnas configurables y exportación." actions={<Link className="btn" to="/nuevo"><Plus size={17}/>Nuevo</Link>} />
      <div className="card">
        <div className="quick-filter-bar">
          {quickFilters.map(filter => {
            const active = filter.key === 'mis_urgentes'
              ? params.get('prioridad') === 'Crítico'
              : params.get('filtro_rapido') === filter.key
            return (
              <button
                key={filter.key}
                className={`quick-filter ${active ? 'active' : ''}`}
                onClick={() => applyQuickFilter(filter.key)}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
        <div className="toolbar">
          <input className="input" style={{ maxWidth: 310 }} value={params.get('search') || ''} onChange={e => set('search', e.target.value)} placeholder="Buscar por nº, cliente, obra, gestor..." />
          <select className="select" style={{ maxWidth: 260 }} value={params.get('estado') || ''} onChange={e => set('estado', e.target.value)}><option value="">Todos los estados</option>{ESTADOS.map(e => <option key={e}>{e}</option>)}</select>
          <select className="select" style={{ maxWidth: 170 }} value={params.get('prioridad') || ''} onChange={e => set('prioridad', e.target.value)}><option value="">Todas prioridades</option>{PRIORIDADES.map(e => <option key={e}>{e}</option>)}</select>
          <OptionInput className="input" style={{ maxWidth: 160 }} options={metadataOptions.gestores} value={params.get('gestor') || ''} onChange={e => set('gestor', e.target.value)} placeholder="Gestor" />
          <OptionInput className="input" style={{ maxWidth: 170 }} options={metadataOptions.proveedores} value={params.get('proveedor') || ''} onChange={e => set('proveedor', e.target.value)} placeholder="Proveedor" />
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
          <button className="btn secondary" onClick={async () => {
    const token = getAuthToken()
    if (!token) return
    const url = exportUrl('vista_actual', paramsForExport)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const blob = await res.blob()
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `presucontrol_vista_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(downloadUrl)
}}><Download size={16}/>Exportar vista</button>
        </div>
        <details className="column-panel">
          <summary><Columns3 size={15}/> Columnas visibles</summary>
          <div className="column-grid">{[
            ['numero','Nº'],['cliente','Cliente'],['obra','Obra'],['gestor','Gestor'],['estado','Estado'],['importe','Importe'],['fechas','Fechas'],['proveedor','Proveedor'],['np_cliente','Nº ped. cliente'],['codigo_cliente','Cod. FactuSOL'],['nuevas_fechas','Fechas nuevas'],['pedido','Pedido proveedor'],['responsable','Responsable'],['accion','Acción'],['dias','Días parado'],['prioridad','Prioridad'],['incidencia','Incidencia'],['ultima','Última act.']
          ].map(([key,label]) => <label key={key} className="check"><input type="checkbox" checked={has(key)} onChange={() => toggleColumn(key)}/> {label}</label>)}</div>
        </details>
      </div>
      {data && <div className="summary-strip"><span><strong>{data.total}</strong> presupuestos</span><span><strong>{euro(data.importe_total)}</strong> importe filtrado</span><span>Página {data.page} de {data.total_pages}</span></div>}
      {error && <div className="error">{error}</div>}
      {loading ? <SkeletonTable rows={6} /> : <PresupuestosTable rows={rows} has={has} compact={compact} sortBy={params.get('sort_by') || ''} sortDir={params.get('sort_dir') || 'desc'} onSort={(key) => {
        const cur = params.get('sort_by') || ''
        const dir = params.get('sort_dir') || 'desc'
        if (cur === key) set('sort_dir', dir === 'asc' ? 'desc' : 'asc')
        else { set('sort_by', key); set('sort_dir', 'asc') }
      }} />}
      {data && <div className="pager"><button className="btn secondary" disabled={data.page <= 1} onClick={() => set('page', String(data.page - 1))}>Anterior</button><button className="btn secondary" disabled={data.page >= data.total_pages} onClick={() => set('page', String(data.page + 1))}>Siguiente</button></div>}
    </>
  )
}

export function PresupuestosTable({ rows, has, compact = false, sortBy, sortDir, onSort }: { rows: Presupuesto[]; has?: (key: string) => boolean; compact?: boolean; sortBy?: string; sortDir?: string; onSort?: (key: string) => void }) {
  const show = has || (() => true)
  const navigate = useNavigate()
  const [focusIdx, setFocusIdx] = useState(-1)
  const tableRef = useRef<HTMLDivElement>(null)
  const sortArrow = (key: string) => sortBy === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
  const sortable = (key: string) => onSort ? { onClick: () => onSort(key), style: { cursor: 'pointer', userSelect: 'none' } as React.CSSProperties } : {}

  useEffect(() => {
    const wrap = tableRef.current
    const thead = wrap?.querySelector('thead') as HTMLElement | null
    if (!wrap || !thead) return

    // Create a fixed header clone
    const clone = document.createElement('div')
    clone.className = 'fixed-header-clone'
    clone.style.cssText = 'position:fixed;top:60px;z-index:10;background:var(--panel-strong);display:none;overflow:hidden;border-bottom:1px solid var(--border)'
    clone.innerHTML = '<table style="width:100%;border-collapse:collapse"><thead>' + thead.innerHTML + '</thead></table>'
    document.body.appendChild(clone)

    function onScroll() {
      const rect = wrap!.getBoundingClientRect()
      const shouldFix = rect.top < 60 && rect.bottom > 120
      clone.style.display = shouldFix ? 'block' : 'none'
      if (shouldFix) {
        clone.style.left = rect.left + 'px'
        clone.style.width = rect.width + 'px'
        const origCells = thead!.querySelectorAll('th')
        const cloneCells = clone.querySelectorAll('th')
        origCells.forEach((th, i) => {
          if (cloneCells[i]) cloneCells[i].style.width = th.getBoundingClientRect().width + 'px'
        })
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); clone.remove() }
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, rows.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, -1)) }
      else if (e.key === 'Enter' && focusIdx >= 0) { navigate(`/presupuestos/${rows[focusIdx].id}`) }
    }
    if (focusIdx >= 0) { document.addEventListener('keydown', handleKey); return () => document.removeEventListener('keydown', handleKey) }
  }, [focusIdx, rows, navigate])

  return <div className={`table-wrap ${compact ? 'compact-table' : ''}`} style={{ marginTop: 16 }} onClick={() => setFocusIdx(-1)} ref={tableRef}><table>
    <thead><tr>
      {show('numero') && <th>Nº presupuesto</th>}{show('cliente') && <th {...sortable('cliente')}>Cliente{sortArrow('cliente')}</th>}{show('obra') && <th>Obra / referencia</th>}{show('gestor') && <th>Gestor</th>}{show('estado') && <th>Estado</th>}{show('importe') && <th {...sortable('importe')}>Importe{sortArrow('importe')}</th>}{show('fechas') && <th {...sortable('fecha')}>Fechas{sortArrow('fecha')}</th>}{show('proveedor') && <th>Proveedor</th>}{show('np_cliente') && <th>Nº ped. cliente</th>}{show('codigo_cliente') && <th>Cod. FactuSOL</th>}{show('nuevas_fechas') && <th>Fechas nuevas</th>}{show('pedido') && <th>Pedido proveedor</th>}{show('responsable') && <th>Gestor</th>}{show('accion') && <th>Siguiente acción</th>}{show('dias') && <th {...sortable('dias_parado')}>Días parado{sortArrow('dias_parado')}</th>}{show('prioridad') && <th {...sortable('prioridad')}>Prioridad{sortArrow('prioridad')}</th>}{show('incidencia') && <th>Incidencia</th>}{show('ultima') && <th {...sortable('ultima_actualizacion')}>Última actualización{sortArrow('ultima_actualizacion')}</th>}
      <th style={{ width: 40 }}></th>
    </tr></thead>
    <tbody>{rows.map((p, idx) => <tr key={p.id} className={`${p.archivado ? 'row-muted' : ''} ${idx === focusIdx ? 'ring-2 ring-brand-200' : ''} group`}>
      {show('numero') && <td><Link to={`/presupuestos/${p.id}`}><strong>{p.numero_presupuesto}</strong></Link>{p.archivado && <div className="muted">Archivado</div>}</td>}
      {show('cliente') && <td>{p.cliente}</td>}
      {show('obra') && <td>{p.obra_referencia}</td>}
      {show('gestor') && <td>{p.gestor}</td>}
      {show('estado') && <td><StateBadge value={p.estado}/></td>}
      {show('importe') && <td className="money">{euro(p.importe)}</td>}
      {show('fechas') && <td><small>Presu: {fmtDate(p.fecha_presupuesto)}<br/>Envío: {fmtDate(p.fecha_envio_cliente)}<br/>Acept.: {fmtDate(p.fecha_aceptacion)}</small></td>}
      {show('proveedor') && <td>{p.proveedor || '—'}</td>}
      {show('np_cliente') && <td><span className="font-mono text-xs">{p.numero_pedido_cliente || '—'}</span></td>}
      {show('codigo_cliente') && <td><span className="font-mono text-xs">{p.codigo_cliente_factusol || '—'}</span></td>}
      {show('nuevas_fechas') && <td><small>Med: {fmtDate(p.fecha_medicion)}<br/>Rec: {fmtDate(p.fecha_recepcion_mercancia)}<br/>Conf: {fmtDate(p.plazo_confeccion)}<br/>Ent: {fmtDate(p.fecha_entrega_cliente)}</small></td>}
      {show('pedido') && <td><PedidoSummaryBadge presupuesto={p} variant="table" /></td>}
      {show('responsable') && <td>{p.gestor || '—'}</td>}
      {show('accion') && <td><strong>{p.siguiente_accion || '—'}</strong><br/><small>Vence: {fmtDate(p.fecha_limite_siguiente_accion)}</small></td>}
      {show('dias') && <td>{p.dias_parado}</td>}
      {show('prioridad') && <td><PriorityBadge value={p.prioridad_calculada}/></td>}
      {show('incidencia') && <td>{p.incidencia ? 'Sí' : 'No'}</td>}
      {show('ultima') && <td>{fmtDate(p.fecha_ultima_actualizacion)}</td>}
      <td className="opacity-0 group-hover:opacity-100 transition-opacity">
        <Link to={`/kanban?focus=${p.id}`} className="text-xs text-brand hover:underline whitespace-nowrap" onClick={e => e.stopPropagation()}>Kanban →</Link>
      </td>
    </tr>)}</tbody>
  </table></div>
}
