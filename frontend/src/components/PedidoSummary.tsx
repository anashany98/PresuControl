import type { MouseEventHandler } from 'react'
import { AlertTriangle } from 'lucide-react'
import { euro, type Presupuesto } from '../utils/api'
import { getPedidoReadableChips, getPedidoSummary, getPedidoWarningLabels, type PedidoSummary } from '../utils/pedidoSummary'

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
  const chips = getPedidoReadableChips(data)
  const body = (
    <>
      <div className="pedido-summary-main">
        <span className="pedido-summary-chips" aria-label="Resumen de pedidos">
          {chips.map(label => {
            const warning = warnings.includes(label)
            return (
            <span key={label} className={`pedido-chip ${warning ? 'pedido-chip-warning' : ''}`}>
              {warning && <AlertTriangle size={12}/>}
              <span>{label}</span>
            </span>
            )
          })}
        </span>
      </div>
      {data.totalPedidos > 0 && variant !== 'mini' && (
        <div className="pedido-summary-money">
          Pedidos {euro(data.importePedidosConocido)} / Presu {euro(data.presupuestoImporte)}
          {!data.importeCompleto && <span className="pedido-money-note"> parcial</span>}
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
