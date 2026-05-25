import { useState, useMemo } from 'react'
import { AlertTriangle, ArrowRight, Calendar, CheckCircle2, ChevronRight, Clock3, RefreshCw } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { SkeletonTable } from '../components/Skeleton'
import { api, euro, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'
import { useToast } from '../utils/toast'
import { PRIORITY_COLOR } from '../utils/tokens'
import { PedidoSummaryBadge } from '../components/PedidoSummary'

type MiMesaResponse = {
  usuario: { id?: number; nombre?: string; email?: string }
  items: Presupuesto[]
  resumen: { total: number; vencidos: number; criticos: number; incidencias: number; aceptados_sin_pedido: number }
}

type TabKey = 'todas' | 'vencidas' | 'hoy' | 'semana' | 'sin_accion'

interface Tab {
  key: TabKey
  label: string
  count: number
  icon: React.ComponentType<{ size?: number; className?: string }>
}

function getDaysDiff(fecha: string | null | undefined): number {
  if (!fecha) return NaN
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(fecha)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function WorkCard({ item, onGoKanban }: { item: Presupuesto; onGoKanban: (id: number) => void }) {
  const daysDiff = getDaysDiff(item.fecha_limite_siguiente_accion)
  const isPast = daysDiff < 0 && !isNaN(daysDiff)
  const isToday = daysDiff === 0
  const barColor = PRIORITY_COLOR[item.prioridad_calculada] || '#d1d5db'

  return (
    <div className="bg-white border border-border rounded-lg overflow-hidden hover:bg-surface-hover hover:shadow-soft transition-all duration-150">
      <div className="flex">
        <div className="w-1 flex-shrink-0 rounded-l-lg" style={{ backgroundColor: barColor }} />
        <div className="flex-1 min-w-0 pl-2 pr-3 py-2">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <Link to={`/presupuestos/${item.id}`} className="font-mono text-xs text-brand font-semibold hover:underline">
                {item.numero_presupuesto}
              </Link>
              <span className="font-semibold text-sm text-ink ml-2">{item.cliente}</span>
            </div>
            <span className="font-semibold text-sm flex-shrink-0">{euro(item.importe)}</span>
          </div>
          {item.obra_referencia && (
            <div className="text-xs text-ink-muted truncate mb-1">{item.obra_referencia}</div>
          )}
          <div className="flex items-center gap-3 text-xs">
            {item.fecha_limite_siguiente_accion ? (
              <span className={`font-medium ${isPast ? 'text-danger' : isToday ? 'text-warning' : 'text-ink-muted'}`}>
                {isPast ? `Vence ${daysDiff}d` : isToday ? 'HOY' : new Date(item.fecha_limite_siguiente_accion).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
              </span>
            ) : (
              <span className="text-ink-muted">Sin fecha</span>
            )}
            <span className="text-ink-muted truncate">{item.estado.split(' - ')[0]}</span>
            <span className="text-ink-muted">{item.gestor?.split(' ')[0]}</span>
            <PedidoSummaryBadge presupuesto={item} variant="mini" />
          </div>
          <div className="flex gap-2 mt-2 pt-2 border-t border-border">
            <Link to={`/presupuestos/${item.id}`} className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1">
              Detalle
            </Link>
            <button
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
              onClick={() => onGoKanban(item.id)}
            >
              Kanban <ArrowRight size={10} className="inline" />
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
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>('todas')

  const goKanban = (id: number) => navigate(`/kanban?focus=${id}`)

  const categorized = useMemo(() => {
    if (!data?.items) return { vencidas: [] as Presupuesto[], hoy: [] as Presupuesto[], semana: [] as Presupuesto[], sin_accion: [] as Presupuesto[] }
    const vencidas: Presupuesto[] = []
    const hoy: Presupuesto[] = []
    const semana: Presupuesto[] = []
    const sin_accion: Presupuesto[] = []

    for (const p of data.items) {
      if (!p.fecha_limite_siguiente_accion) {
        sin_accion.push(p)
      } else {
        const diff = getDaysDiff(p.fecha_limite_siguiente_accion)
        if (diff < 0) vencidas.push(p)
        else if (diff === 0) hoy.push(p)
        else if (diff <= 7) semana.push(p)
        else hoy.push(p) // future items with action go to "hoy" bucket
      }
    }
    return { vencidas, hoy, semana, sin_accion }
  }, [data])

  const tabs: Tab[] = [
    { key: 'todas', label: 'Todas', count: data?.resumen?.total || 0, icon: Clock3 },
    { key: 'vencidas', label: 'Vencidas', count: categorized.vencidas.length, icon: AlertTriangle },
    { key: 'hoy', label: 'Hoy', count: categorized.hoy.length, icon: CheckCircle2 },
    { key: 'semana', label: 'Semana', count: categorized.semana.length, icon: Calendar },
    { key: 'sin_accion', label: 'Sin acción', count: categorized.sin_accion.length, icon: Clock3 },
  ]

  const tabItems: Record<TabKey, Presupuesto[]> = {
    todas: data?.items || [],
    vencidas: categorized.vencidas,
    hoy: categorized.hoy,
    semana: categorized.semana,
    sin_accion: categorized.sin_accion,
  }

  const displayItems = tabItems[activeTab] || []
  const r = data?.resumen

  return <>
    <PageHeader
      title="Mi trabajo"
      subtitle={data?.usuario?.nombre ? `Tareas asignadas a ${data.usuario.nombre}` : 'Tareas pendientes'}
      actions={<button className="btn secondary" onClick={reload}><RefreshCw size={16} /> Actualizar</button>}
    />

    {/* KPIs Row */}
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
      <KpiBadge label="Total" value={r?.total || 0} tone="default" />
      <KpiBadge label="Vencidas" value={r?.vencidos || 0} tone={r?.vencidos ? 'danger' : 'default'} />
      <KpiBadge label="Críticas" value={r?.criticos || 0} tone={r?.criticos ? 'danger' : 'default'} />
      <KpiBadge label="Sin pedido" value={r?.aceptados_sin_pedido || 0} tone={r?.aceptados_sin_pedido ? 'warning' : 'default'} />
      <KpiBadge label="Incidencias" value={r?.incidencias || 0} tone={r?.incidencias ? 'danger' : 'default'} />
    </div>

    {error && <div className="error">{error}</div>}
    {loading ? <SkeletonTable rows={6} /> : <>
      {/* Tabs */}
      <div className="border-b border-border overflow-x-auto mb-4">
        <div className="flex min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors duration-150 ${
                activeTab === tab.key
                  ? 'border-brand text-ink font-semibold'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <tab.icon size={14} />
              <span>{tab.label}</span>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 text-xs font-medium rounded-full px-1.5 bg-muted text-ink">
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      {displayItems.length === 0 ? (
        <div className="text-center py-12 text-ink-muted">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-success" />
          {activeTab === 'todas' ? (
            <>
              <p className="font-medium text-ink">No tienes tareas asignadas</p>
              <p className="text-xs mt-1">Como administrador, usa el Dashboard y Kanban para ver todos los presupuestos.</p>
            </>
          ) : activeTab === 'vencidas' ? 'No hay tareas vencidas. ¡Buen trabajo!' :
           activeTab === 'hoy' ? 'Nada pendiente para hoy.' :
           activeTab === 'semana' ? 'Nada esta semana.' :
           'Todas las tareas tienen fecha.'}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {displayItems.map(item => (
            <WorkCard key={item.id} item={item} onGoKanban={goKanban} />
          ))}
        </div>
      )}
    </>}
  </>
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
