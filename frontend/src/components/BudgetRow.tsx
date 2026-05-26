import { Link } from 'react-router-dom'
import { type Presupuesto } from '../utils/api'
import { PRIORITY_COLOR } from '../utils/tokens'
import { euro } from '../utils/api'
import { PedidoSummaryBadge } from './PedidoSummary'

interface BudgetRowProps {
  item: Presupuesto
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
  })
}

function getDaysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

export function BudgetRow({ item }: BudgetRowProps) {
  const borderColor = PRIORITY_COLOR[item.prioridad_calculada] || '#d1d5db'
  const daysUntil = item.fecha_limite_siguiente_accion
    ? getDaysUntil(item.fecha_limite_siguiente_accion)
    : null

  let dateLabel: string
  let dateClass = 'text-xs text-ink-muted'

  if (daysUntil !== null) {
    if (daysUntil < 0) {
      dateLabel = `vence ${Math.abs(daysUntil)}d`
      dateClass = 'text-xs text-danger font-medium'
    } else if (daysUntil <= 3) {
      dateLabel = formatDateShort(item.fecha_limite_siguiente_accion!)
      dateClass = 'text-xs text-warning font-medium'
    } else {
      dateLabel = formatDateShort(item.fecha_limite_siguiente_accion!)
      dateClass = 'text-xs text-ink-muted'
    }
  } else {
    dateLabel = ''
  }

  return (
    <Link
      to={`/presupuestos/${item.id}`}
      className="block bg-white border border-border rounded-lg px-3 py-2 hover:bg-surface-hover hover:shadow-soft transition-all duration-150"
    >
      <div className="flex justify-between items-center">
        {/* Left side: number + client */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="w-1 h-8 rounded-full flex-shrink-0"
            style={{ backgroundColor: borderColor }}
          />
          <div className="min-w-0 flex-1">
            <span className="font-mono text-xs text-brand font-semibold block">
              {item.numero_presupuesto}
            </span>
            <span className="font-semibold text-sm text-ink truncate block">
              {item.cliente}
            </span>
          </div>
        </div>

        {/* Right side: amount + date + menu */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-semibold text-ink tabular-nums">
            {euro(item.importe)}
          </span>
          {dateLabel && (
            <span className={dateClass}>{dateLabel}</span>
          )}
          <Link
            to={`/kanban?focus=${item.id}`}
            className="text-ink-muted hover:text-ink p-1 text-xs"
            onClick={e => e.stopPropagation()}
            title="Ver en Kanban"
          >
            🗂
          </Link>
        </div>
      </div>

      {/* Bottom row: obra_referencia + pedidos */}
      <div className="flex justify-between items-center mt-1 pl-3 gap-2">
        <span className="text-xs text-ink-muted truncate">
          {item.obra_referencia || 'Sin obra'}
        </span>
        {(item.pedidos?.length || 0) > 0 && (
          <div className="flex-shrink-0">
            <PedidoSummaryBadge presupuesto={item} variant="mini" />
          </div>
        )}
      </div>
      {/* Pedidos detail row */}
      {(item.pedidos?.length || 0) > 0 && (
        <div className="pl-3 mt-0.5">
          {item.pedidos!.filter(p => p.estado_entrega !== 'completado').slice(0, 2).map((p, i) => (
            <span key={i} className="text-xs text-ink-muted mr-3">
              📦 {p.proveedor?.slice(0, 15)}{p.proveedor && p.proveedor.length > 15 ? '…' : ''}
              {!p.fecha_entrega_prevista && ' · ⚠️ sin fecha'}
              {p.fecha_entrega_prevista && ' · ' + new Date(p.fecha_entrega_prevista).toLocaleDateString('es-ES', {day:'2-digit', month:'2-digit'})}
            </span>
          ))}
          {item.pedidos!.filter(p => p.estado_entrega !== 'completado').length > 2 && (
            <span className="text-xs text-ink-muted">+{item.pedidos!.filter(p => p.estado_entrega !== 'completado').length - 2} más</span>
          )}
        </div>
      )}
    </Link>
  )
}

interface BudgetRowListProps {
  items: Presupuesto[]
  maxItems?: number
}

export function BudgetRowList({ items, maxItems = 10 }: BudgetRowListProps) {
  const displayItems = items.slice(0, maxItems)

  if (displayItems.length === 0) return null

  return (
    <div className="flex flex-col gap-1">
      {displayItems.map(item => <BudgetRow key={item.id} item={item} />)}
      {items.length > maxItems && (
        <div className="text-xs text-ink-muted text-center py-1">
          +{items.length - maxItems} más
        </div>
      )}
    </div>
  )
}