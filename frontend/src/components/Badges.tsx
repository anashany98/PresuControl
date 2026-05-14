import { AlertTriangle, CheckCircle2, Clock3, Flame, Circle } from 'lucide-react'

export function PriorityBadge({ value }: { value?: string }) {
  const key = (value || 'Verde').toLowerCase().replace('í', 'i')
  const Icon = value === 'Crítico' ? Flame : value === 'Rojo' ? AlertTriangle : value === 'Naranja' ? Clock3 : value === 'Amarillo' ? Circle : CheckCircle2
  return <span className={`badge ${key}`}><Icon size={13} />{value || 'Verde'}</span>
}

export function StateBadge({ value }: { value: string }) {
  let cls = 'state'
  if (value.includes('Aceptado') || value.includes('Pedido proveedor')) cls += ' accepted'
  if (value.includes('Entregado') || value.includes('Plazo')) cls += ' done'
  if (value.includes('Bloqueado') || value.includes('Cancelado')) cls += ' blocked'
  return <span className={`badge ${cls}`}>{value}</span>
}
