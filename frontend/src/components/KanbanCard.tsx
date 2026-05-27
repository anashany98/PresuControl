import { Link } from 'react-router-dom'
import type { Presupuesto } from '../utils/api'
import { euro } from '../utils/api'
import { PRIORITY_COLOR } from '../utils/tokens'
import { getPedidoSummary } from '../utils/pedidoSummary'

interface KanbanCardProps {
  presupuesto: Presupuesto
  isFocused?: boolean
  previousColumn?: string
  nextColumn?: string
  onMove: (presupuesto: Presupuesto, targetStatus: string) => void
  onPedidoClick: (presupuesto: Presupuesto) => void
  onFocus?: () => void
  saving?: boolean
}

function getPedidoIcon(estado: string, fechaPrevista: string | null | undefined): string {
  if (estado === 'completado') return '✅'
  if (estado === 'parcial') return '🔵'
  // pendiente
  if (!fechaPrevista) return '⚠️'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const prevDate = new Date(fechaPrevista)
  prevDate.setHours(0, 0, 0, 0)
  if (prevDate < today) return '🔴'
  return '🟡'
}

function truncate(str: string, maxLen: number): string {
  if (!str) return ''
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
}

function DateUrgency({ dateStr }: { dateStr: string }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  const diffMs = target.getTime() - today.getTime()
  const diffDays = Math.ceil(diffMs / 86400000)

  if (diffDays < 0) {
    return <span className="text-danger font-medium">vence {diffDays}d</span>
  }
  if (diffDays <= 3) {
    return <span className="text-warning font-medium">{formatShortDate(dateStr)}</span>
  }
  return <span className="text-ink-muted">{formatShortDate(dateStr)}</span>
}

function PedidoList({ presupuesto, onPedidoClick }: {
  presupuesto: Presupuesto
  onPedidoClick: (p: Presupuesto) => void
}) {
  const summary = getPedidoSummary(presupuesto)
  const pedidos = summary.pedidos

  if (pedidos.length === 0) return null
  if (pedidos.length >= 4) {
    const warnings = summary.pedidos.filter(p => p.vencido || p.fechaPrevistaFaltante).length
    return (
      <div className="flex items-center justify-between">
        <span className="text-xs">
          📦 {pedidos.length} pedidos
          {summary.completados > 0 && <span className="text-success"> {summary.completados}✅</span>}
          {warnings > 0 && <span className="text-warning"> {warnings}⚠️</span>}
        </span>
        <button
          type="button"
          className="text-xs text-brand hover:underline"
          onClick={(e) => { e.stopPropagation(); onPedidoClick(presupuesto) }}
        >
          Ver todos
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {pedidos.map((pedido) => (
        <div key={pedido.id} className="flex items-center gap-1 text-xs">
          <span>{getPedidoIcon(pedido.estado_entrega, pedido.fecha_entrega_prevista)}</span>
          <span className="truncate">{truncate(pedido.proveedor, 20)}</span>
          <span className="text-ink-muted">
            {pedido.estado_entrega === 'completado' ? 'completado' :
             pedido.estado_entrega === 'parcial' ? 'parcial' :
             pedido.fechaPrevistaFaltante ? 'sin plazo' : 'pendiente'}
          </span>
        </div>
      ))}
    </div>
  )
}

export function KanbanCard({
  presupuesto,
  isFocused,
  previousColumn,
  nextColumn,
  onMove,
  onPedidoClick,
  onFocus,
  saving,
}: KanbanCardProps) {
  const pri = (presupuesto.prioridad_calculada || 'Verde').toLowerCase()
  const barColor = PRIORITY_COLOR[presupuesto.prioridad_calculada] || '#d1d5db'

  return (
    <div
      className={`bg-white border border-border rounded-lg overflow-hidden transition-all duration-150 hover:bg-surface-hover hover:shadow-soft ${isFocused ? 'ring-2 ring-brand-200' : ''} ${saving ? 'opacity-60' : ''}`}
      style={{ position: 'relative' }}
      draggable
      role="listitem"
      aria-label={`Presupuesto ${presupuesto.numero_presupuesto} — ${presupuesto.cliente}`}
      aria-grabbed={false}
      tabIndex={0}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(presupuesto.id))}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => onFocus?.()}
      onFocus={() => onFocus?.()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          window.location.href = `/presupuestos/${presupuesto.id}`
        }
      }}
    >
      {saving && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-lg">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div className="flex">
        {/* Priority bar */}
        <div className="w-1 flex-shrink-0 rounded-l-lg" style={{ backgroundColor: barColor }} />

        {/* Content */}
        <div className="flex-1 min-w-0 pl-2 pr-3 pt-2 pb-2">
          {/* Header row: numero + version + amount */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Link
                to={`/presupuestos/${presupuesto.id}`}
                className="font-mono text-brand font-semibold text-sm hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
                draggable={false}
              >
                {presupuesto.numero_presupuesto}
              </Link>
              <span className="text-xs text-ink-muted flex-shrink-0">v{presupuesto.version}</span>
            </div>
            <span className="font-semibold text-sm flex-shrink-0">{euro(presupuesto.importe)}</span>
          </div>

          {/* Client */}
          <div className="font-semibold text-sm truncate mb-0.5">
            {String(presupuesto.cliente || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </div>

          {/* Obra */}
          {presupuesto.obra_referencia && (
            <div className="text-xs text-ink-muted truncate mb-1">
              {String(presupuesto.obra_referencia || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
            </div>
          )}

          {/* Date urgency */}
          {presupuesto.fecha_limite_siguiente_accion && (
            <div className="text-xs mb-2">
              ⚠️ <DateUrgency dateStr={presupuesto.fecha_limite_siguiente_accion} />
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-border mb-2" />

          {/* Pedidos section */}
          <PedidoList presupuesto={presupuesto} onPedidoClick={onPedidoClick} />

          {/* Footer action buttons */}
          <div className="flex gap-2 mt-2 pt-2 border-t border-border">
            {previousColumn && (
              <button
                type="button"
                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
                onClick={(e) => { e.stopPropagation(); onMove(presupuesto, previousColumn) }}
                title={`Mover a ${previousColumn}`}
                aria-label={`Mover a ${previousColumn}`}
              >
                ◀ {previousColumn.slice(0, 10)}
              </button>
            )}
            <Link
              to={`/presupuestos/${presupuesto.id}`}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Ver detalle de ${presupuesto.numero_presupuesto}`}
              draggable={false}
            >
              Detalle
            </Link>
            {presupuesto.pedidos && presupuesto.pedidos.length > 0 && (
              <button
                type="button"
                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
                onClick={(e) => { e.stopPropagation(); onPedidoClick(presupuesto) }}
                aria-label={`Ver pedidos de ${presupuesto.numero_presupuesto}`}
              >
                📦 Pedidos
              </button>
            )}
            {nextColumn && (
              <button
                type="button"
                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
                onClick={(e) => { e.stopPropagation(); onMove(presupuesto, nextColumn) }}
                title={`Mover a ${nextColumn}`}
                aria-label={`Mover a ${nextColumn}`}
              >
                {nextColumn.slice(0, 10)} ▶
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}