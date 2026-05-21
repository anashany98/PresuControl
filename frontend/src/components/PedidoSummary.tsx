import type { MouseEventHandler } from 'react'
import { AlertTriangle } from 'lucide-react'
import { euro, type Presupuesto } from '../utils/api'
import { getPedidoStatusLabel, getPedidoSummary, getPedidoWarningLabels, type PedidoSummary } from '../utils/pedidoSummary'

type Variant = 'compact' | 'table' | 'kanban' | 'detail' | 'mini'

type Props = {
  presupuesto: Presupuesto
  summary?: PedidoSummary
  variant?: Variant
  onClick?: MouseEventHandler<HTMLButtonElement>
  className?: string
}

export function PedidoSummaryBadge({ presupuesto, summary, variant = 'compact', onClick, className = '' }: Props) {
  const data = summary || getPedidoSummary(presupuesto)
  const warnings = getPedidoWarningLabels(data)
  const body = (
    <>
      <div className="pedido-summary-main">
        <span className="pedido-summary-total">{getPedidoStatusLabel(data)}</span>
        {data.totalPedidos > 0 && (
          <span className="pedido-summary-chips" aria-label="Estados de pedidos">
            <span className="pedido-chip pedido-chip-pending" title="Pendientes">{data.pendientes} pend.</span>
            <span className="pedido-chip pedido-chip-partial" title="Parciales">{data.parciales} parc.</span>
            <span className="pedido-chip pedido-chip-done" title="Completados">{data.completados} ok</span>
          </span>
        )}
      </div>
      {data.totalPedidos > 0 && variant !== 'mini' && (
        <div className="pedido-summary-money">
          Pedidos {euro(data.importePedidosConocido)} / Presu {euro(data.presupuestoImporte)}
          {!data.importeCompleto && <span className="pedido-money-note"> parcial</span>}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="pedido-alerts">
          {warnings.map(label => (
            <span key={label} className="pedido-alert-chip"><AlertTriangle size={11}/>{label}</span>
          ))}
        </div>
      )}
    </>
  )
  const classes = `pedido-summary pedido-summary-${variant} ${data.tieneExcepciones ? 'has-alerts' : ''} ${className}`.trim()

  if (onClick) {
    return (
      <button type="button" className={`${classes} pedido-summary-button`} onClick={onClick}>
        {body}
      </button>
    )
  }

  return <div className={classes}>{body}</div>
}
