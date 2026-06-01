import { AlertTriangle, CheckCircle2, Clock3, Flame, Zap } from 'lucide-react'

export function PriorityBadge({ value }: { value: unknown }) {
  const str = String(value ?? 'Verde')
  const key = str.toLowerCase().replace('í', 'i')
  const Icon = str === 'Crítico' ? Flame : str === 'Rojo' ? AlertTriangle : str === 'Naranja' ? Clock3 : str === 'Amarillo' ? Zap : CheckCircle2
  const animClass = str === 'Crítico' ? 'badge-pulse' : ''
  return <span className={`badge ${key} ${animClass}`}><Icon size={13} />{str}</span>
}

export function StateBadge({ value }: { value: unknown }) {
  const str = String(value ?? '')
  let cls = 'state'
  if (str.includes('Aceptado') || str.includes('Pedido proveedor')) cls += ' accepted'
  if (str.includes('Entregado') || str.includes('Plazo')) cls += ' done'
  if (str.includes('Bloqueado') || str.includes('Cancelado')) cls += ' blocked'
  return <span className={`badge ${cls}`}>{str}</span>
}
