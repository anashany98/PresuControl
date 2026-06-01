import type { OperationalPriority, Presupuesto, RecommendedAction } from './api'
import { getPedidoSummary } from './pedidoSummary.ts'

type DateInput = Date | string | null | undefined

const urgentPriorities = new Set(['Rojo', 'Crítico'])

function dateKey(value: DateInput): string | null {
  if (!value) return null
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return value.slice(0, 10)
}

function addUnique(values: string[], value: string) {
  if (value && !values.includes(value)) values.push(value)
}

function plusDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00`)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

export type OperationalContext = {
  prioridad_operativa: OperationalPriority
  motivos: string[]
  accion_recomendada: RecommendedAction
  faltantes: string[]
}

export function getOperationalContext(presupuesto: Presupuesto, today = new Date()): OperationalContext {
  const todayKey = dateKey(today)
  const weekLimit = todayKey ? plusDays(todayKey, 7) : null
  const deadline = dateKey(presupuesto.fecha_limite_siguiente_accion)
  const motivos: string[] = []
  const faltantes: string[] = []
  const summary = getPedidoSummary(presupuesto, today)
  let accion: RecommendedAction = { tipo: 'abrir_detalle', label: 'Abrir detalle', target_tab: 'datos' }

  function setAction(next: RecommendedAction, force = false) {
    if (force || accion.tipo === 'abrir_detalle') accion = next
  }

  const acceptedWithoutOrder = Boolean(
    (presupuesto.fecha_aceptacion && summary.totalPedidos === 0) ||
    presupuesto.estado === 'Aceptado - pendiente pedido proveedor',
  )

  if (presupuesto.incidencia) {
    addUnique(motivos, 'Incidencia abierta')
    setAction({ tipo: 'resolver_incidencia', label: 'Resolver incidencia', target_tab: 'datos' }, true)
  }

  if (acceptedWithoutOrder) {
    addUnique(motivos, 'Aceptado sin pedido proveedor')
    addUnique(faltantes, 'pedido proveedor')
    setAction({ tipo: 'crear_pedido', label: 'Crear pedido', target_tab: 'pedidos' }, true)
  }

  if (summary.totalPedidos > 0 && !presupuesto.plazo_proveedor && presupuesto.estado !== 'Entregado / cerrado') {
    addUnique(motivos, 'Plazo proveedor sin confirmar')
    addUnique(faltantes, 'plazo proveedor')
    setAction({ tipo: 'confirmar_plazo', label: 'Confirmar plazo', target_tab: 'pedidos' })
  }

  if (summary.hayPedidosVencidos) {
    addUnique(motivos, 'Pedido proveedor vencido')
    setAction({
      tipo: presupuesto.plazo_proveedor ? 'actualizar_fecha' : 'confirmar_plazo',
      label: presupuesto.plazo_proveedor ? 'Actualizar fecha' : 'Confirmar plazo',
      target_tab: 'pedidos',
    })
  }
  if (summary.hayFechasPrevistasFaltantes) {
    addUnique(motivos, 'Pedido sin fecha prevista')
    addUnique(faltantes, 'pedido sin fecha')
    setAction({ tipo: 'actualizar_fecha', label: 'Actualizar fecha', target_tab: 'pedidos' })
  }
  if (summary.hayImportesIncompletos) addUnique(faltantes, 'pedido sin importe')

  if (!deadline) {
    addUnique(motivos, 'Sin fecha de siguiente acción')
    addUnique(faltantes, 'fecha límite siguiente acción')
    if (!['crear_pedido', 'resolver_incidencia'].includes(accion.tipo)) {
      setAction({ tipo: 'actualizar_fecha', label: 'Actualizar fecha', target_tab: 'datos' }, true)
    }
  } else if (todayKey && deadline < todayKey) {
    addUnique(motivos, 'Fecha límite vencida')
    setAction({ tipo: 'actualizar_fecha', label: 'Actualizar fecha', target_tab: 'datos' })
  } else if (todayKey && deadline === todayKey) {
    addUnique(motivos, 'Vence hoy')
  }

  if (!presupuesto.siguiente_accion?.trim()) {
    addUnique(motivos, 'Sin siguiente acción')
    addUnique(faltantes, 'siguiente acción')
    if (!['crear_pedido', 'resolver_incidencia'].includes(accion.tipo)) {
      setAction({ tipo: 'actualizar_fecha', label: 'Actualizar fecha', target_tab: 'datos' }, true)
    }
  }

  let prioridad_operativa: OperationalPriority
  if (urgentPriorities.has(presupuesto.prioridad_calculada || '') || presupuesto.incidencia || acceptedWithoutOrder || summary.hayPedidosVencidos) {
    prioridad_operativa = 'urgente'
  } else if ((todayKey && deadline === todayKey) || presupuesto.prioridad_calculada === 'Naranja') {
    prioridad_operativa = 'hoy'
  } else if (todayKey && weekLimit && deadline && deadline > todayKey && deadline <= weekLimit) {
    prioridad_operativa = 'semana'
  } else if (!deadline || faltantes.length > 0) {
    prioridad_operativa = 'sin_fecha'
  } else {
    prioridad_operativa = 'semana'
  }

  return {
    prioridad_operativa,
    motivos: motivos.length ? motivos : ['Seguimiento pendiente'],
    accion_recomendada: accion,
    faltantes,
  }
}

export function mergeOperationalContext(presupuesto: Presupuesto, today = new Date()): OperationalContext {
  const fallback = getOperationalContext(presupuesto, today)
  return {
    prioridad_operativa: presupuesto.prioridad_operativa || fallback.prioridad_operativa,
    motivos: presupuesto.motivos?.length ? presupuesto.motivos : fallback.motivos,
    accion_recomendada: presupuesto.accion_recomendada || fallback.accion_recomendada,
    faltantes: presupuesto.faltantes || fallback.faltantes,
  }
}

export function operationalPriorityLabel(priority: OperationalPriority) {
  if (priority === 'urgente') return 'Urgente'
  if (priority === 'hoy') return 'Hoy'
  if (priority === 'semana') return 'Esta semana'
  return 'Sin fecha / sin acción'
}
