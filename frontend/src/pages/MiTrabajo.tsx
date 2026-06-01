import { useMemo } from 'react'
import { AlertTriangle, ArrowRight, Calendar, CheckCircle2, Clock3, PackagePlus, RefreshCw } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { SkeletonTable } from '../components/Skeleton'
import { api, euro, type OperationalPriority, type Presupuesto, type RecommendedActionType } from '../utils/api'
import { useData } from '../utils/useData'
import { PRIORITY_COLOR } from '../utils/tokens'
import { PedidoSummaryBadge } from '../components/PedidoSummary'
import { mergeOperationalContext, operationalPriorityLabel } from '../utils/workflow'

type MiMesaResponse = {
  usuario: { id?: number; nombre?: string; email?: string }
  items: Presupuesto[]
  resumen: {
    total: number
    vencidos: number
    criticos: number
    incidencias: number
    aceptados_sin_pedido: number
    urgentes?: number
    hoy?: number
    semana?: number
    sin_fecha?: number
  }
}

const sectionOrder: OperationalPriority[] = ['urgente', 'hoy', 'semana', 'sin_fecha']

function getDaysDiff(fecha: string | null | undefined): number {
  if (!fecha) return NaN
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(fecha)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function actionHref(item: Presupuesto) {
  const action = mergeOperationalContext(item).accion_recomendada
  const tab = action.target_tab || (action.tipo === 'crear_pedido' || action.tipo === 'confirmar_plazo' ? 'pedidos' : 'datos')
  return `/presupuestos/${item.id}?tab=${tab}&action=${action.tipo}`
}

function actionIcon(action: RecommendedActionType) {
  const t = action.tipo
  if (t === 'crear_pedido') return <PackagePlus size={14} />
  if (t === 'confirmar_plazo' || t === 'actualizar_fecha') return <Calendar size={14} />
  if (t === 'resolver_incidencia') return <AlertTriangle size={14} />
  return <ArrowRight size={14} />
}

function WorkCard({ item, onGoKanban }: { item: Presupuesto; onGoKanban: (id: number) => void }) {
  const operational = mergeOperationalContext(item)
  const daysDiff = getDaysDiff(item.fecha_limite_siguiente_accion)
  const isPast = daysDiff < 0 && !isNaN(daysDiff)
  const isToday = daysDiff === 0
  const barColor = PRIORITY_COLOR[item.prioridad_calculada ?? ''] || '#d1d5db'
  const action = operational.accion_recomendada

  return (
    <div className="work-card">
      <div className="flex">
        <div className="work-card-priority" style={{ backgroundColor: barColor }} />
        <div className="flex-1 min-w-0 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to={`/presupuestos/${item.id}`} className="font-mono text-xs text-brand font-semibold hover:underline">
                {item.numero_presupuesto}
              </Link>
              <div className="font-semibold text-sm text-ink leading-snug truncate">{item.cliente}</div>
            </div>
            <span className="font-semibold text-sm flex-shrink-0">{euro(item.importe)}</span>
          </div>
          {item.obra_referencia && (
            <div className="text-xs text-ink-muted truncate mt-1">{item.obra_referencia}</div>
          )}
          <div className="work-card-meta">
            <span className="work-status-chip">{item.estado}</span>
            {item.fecha_limite_siguiente_accion ? (
              <span className={`font-medium ${isPast ? 'text-danger' : isToday ? 'text-warning' : 'text-ink-muted'}`}>
                {isPast ? `Vencido hace ${Math.abs(daysDiff)}d` : isToday ? 'Vence hoy' : new Date(item.fecha_limite_siguiente_accion).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
              </span>
            ) : (
              <span className="text-ink-muted">Sin fecha</span>
            )}
            <span className="text-ink-muted truncate">{item.siguiente_accion || 'Sin siguiente acción'}</span>
          </div>
          <div className="work-chip-row">
            {operational.motivos.slice(0, 3).map(motivo => (
              <span key={motivo} className={`work-chip ${operational.prioridad_operativa === 'urgente' ? 'work-chip-danger' : ''}`}>{motivo}</span>
            ))}
            {operational.faltantes.slice(0, 3).map(faltante => (
              <span key={faltante} className="work-chip work-chip-muted">Falta {faltante}</span>
            ))}
          </div>
          <div className="work-pedido-row">
            <PedidoSummaryBadge presupuesto={item} variant="mini" />
          </div>
          <div className="work-card-actions">
            <Link to={actionHref(item)} className="btn primary small">
              {actionIcon(action)}
              {action.label}
            </Link>
            <button
              className="btn secondary small"
              onClick={() => onGoKanban(item.id)}
            >
              Kanban <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MiTrabajo() {
  const { data, loading, error, reload } = useData<MiMesaResponse>(() => api.get('/mi-mesa'), [])
  const navigate = useNavigate()

  const goKanban = (id: number) => navigate(`/kanban?focus=${id}`)

  const grouped = useMemo(() => {
    const empty: Record<OperationalPriority, Presupuesto[]> = { urgente: [], hoy: [], semana: [], sin_fecha: [] }
    for (const item of data?.items || []) {
      empty[mergeOperationalContext(item).prioridad_operativa].push(item)
    }
    return empty
  }, [data])

  const r = data?.resumen

  return <>
    <PageHeader
      title="Mi trabajo"
      subtitle={data?.usuario?.nombre ? `Tareas asignadas a ${data.usuario.nombre}` : 'Tareas pendientes'}
      actions={<button className="btn secondary" onClick={reload}><RefreshCw size={16} /> Actualizar</button>}
    />

    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
      <KpiBadge label="Total" value={r?.total || 0} tone="default" />
      <KpiBadge label="Urgentes" value={r?.urgentes ?? grouped.urgente.length} tone={(r?.urgentes ?? grouped.urgente.length) ? 'danger' : 'default'} />
      <KpiBadge label="Hoy" value={r?.hoy ?? grouped.hoy.length} tone={(r?.hoy ?? grouped.hoy.length) ? 'warning' : 'default'} />
      <KpiBadge label="Sin pedido" value={r?.aceptados_sin_pedido || 0} tone={r?.aceptados_sin_pedido ? 'warning' : 'default'} />
      <KpiBadge label="Sin fecha" value={r?.sin_fecha ?? grouped.sin_fecha.length} tone={(r?.sin_fecha ?? grouped.sin_fecha.length) ? 'warning' : 'default'} />
    </div>

    {error && <div className="error">{error}</div>}
    {loading ? <SkeletonTable rows={6} /> : <>
      {(data?.items || []).length === 0 ? (
        <div className="text-center py-12 text-ink-muted">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-success" />
          <p className="font-medium text-ink">No tienes tareas asignadas</p>
          <p className="text-xs mt-1">Como administrador, usa el Dashboard y Kanban para ver todos los presupuestos.</p>
        </div>
      ) : (
        <div className="work-board">
          {sectionOrder.map(priority => (
            <section key={priority} className={`work-section work-section-${priority}`}>
              <div className="work-section-header">
                <div>
                  <h2>{operationalPriorityLabel(priority)}</h2>
                  <span>{sectionSubtitle(priority)}</span>
                </div>
                <strong>{grouped[priority].length}</strong>
              </div>
              {grouped[priority].length === 0 ? (
                <div className="work-empty"><Clock3 size={16} /> Sin presupuestos en este bloque</div>
              ) : (
                <div className="work-section-list">
                  {grouped[priority].map(item => (
                    <WorkCard key={item.id} item={item} onGoKanban={goKanban} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>}
  </>
}

function sectionSubtitle(priority: OperationalPriority) {
  if (priority === 'urgente') return 'Riesgo real o bloqueo que puede olvidarse'
  if (priority === 'hoy') return 'Acciones con vencimiento hoy'
  if (priority === 'semana') return 'Seguimiento previsto a corto plazo'
  return 'Falta una fecha o una acción clara'
}

function KpiBadge({ label, value, tone }: { label: string; value: number; tone: 'danger' | 'warning' | 'default' }) {
  return (
    <div className={`card p-3 text-center ${tone === 'danger' ? 'border-l-2 border-l-danger' : tone === 'warning' ? 'border-l-2 border-l-warning' : ''}`}>
      <div className={`text-2xl font-black ${tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-ink'}`}>
        {value}
      </div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  )
}
