import type { PedidoProveedor, Presupuesto } from './api'

export type PedidoSummaryItem = PedidoProveedor & {
  isLegacy?: boolean
  importeIncompleto: boolean
  fechaPrevistaFaltante: boolean
  vencido: boolean
}

export type PedidoSummary = {
  presupuestoId: number
  presupuestoImporte: number
  pedidos: PedidoSummaryItem[]
  totalPedidos: number
  pendientes: number
  parciales: number
  completados: number
  importePedidosConocido: number
  hayImportesIncompletos: boolean
  hayFechasPrevistasFaltantes: boolean
  hayPedidosVencidos: boolean
  pedidosSinImporte: number
  pedidosSinFecha: number
  pedidosVencidos: number
  importeCompleto: boolean
  ratioPedidosPresupuesto: number | null
  estadoDominante: 'pendiente' | 'parcial' | 'completado' | 'sin_pedidos'
  tieneExcepciones: boolean
}

function dateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return value.slice(0, 10)
}

function isNonCompleted(pedido: PedidoProveedor) {
  return pedido.estado_entrega !== 'completado'
}

function buildLegacyPedido(presupuesto: Presupuesto): PedidoProveedor | null {
  const hasLegacyPedido = Boolean(
    presupuesto.pedido_proveedor_realizado ||
    presupuesto.proveedor ||
    presupuesto.numero_pedido_proveedor ||
    presupuesto.fecha_pedido_proveedor ||
    presupuesto.fecha_prevista_entrega ||
    presupuesto.plazo_proveedor,
  )
  if (!hasLegacyPedido) return null

  const estado_entrega: PedidoProveedor['estado_entrega'] =
    presupuesto.estado === 'Entregado / cerrado' ? 'completado' : 'pendiente'

  return {
    id: -presupuesto.id,
    presupuesto_id: presupuesto.id,
    proveedor: presupuesto.proveedor || 'Proveedor sin informar',
    numero_pedido: presupuesto.numero_pedido_proveedor || null,
    fecha_pedido: presupuesto.fecha_pedido_proveedor || null,
    importe: null,
    estado_entrega,
    fecha_entrega_prevista: presupuesto.fecha_prevista_entrega || presupuesto.plazo_proveedor || null,
    fecha_entrega_real: null,
    observaciones: null,
    creado_en: presupuesto.creado_en,
    actualizado_en: presupuesto.actualizado_en,
  }
}

function getSourcePedidos(presupuesto: Presupuesto): PedidoProveedor[] {
  if (presupuesto.pedidos?.length) return presupuesto.pedidos
  const legacy = buildLegacyPedido(presupuesto)
  return legacy ? [legacy] : []
}

export function getPedidoSummary(presupuesto: Presupuesto, today = new Date()): PedidoSummary {
  const todayKey = dateKey(today)
  const source = getSourcePedidos(presupuesto)
  const pedidos = source.map(pedido => {
    const fechaPrevista = dateKey(pedido.fecha_entrega_prevista)
    const importeIncompleto = pedido.importe == null || Number.isNaN(Number(pedido.importe))
    const fechaPrevistaFaltante = isNonCompleted(pedido) && !fechaPrevista
    const vencido = Boolean(isNonCompleted(pedido) && fechaPrevista && todayKey && fechaPrevista < todayKey)
    return {
      ...pedido,
      isLegacy: pedido.id < 0,
      importeIncompleto,
      fechaPrevistaFaltante,
      vencido,
    }
  })

  const pendientes = pedidos.filter(p => p.estado_entrega === 'pendiente').length
  const parciales = pedidos.filter(p => p.estado_entrega === 'parcial').length
  const completados = pedidos.filter(p => p.estado_entrega === 'completado').length
  const pedidosSinImporte = pedidos.filter(p => p.importeIncompleto).length
  const pedidosSinFecha = pedidos.filter(p => p.fechaPrevistaFaltante).length
  const pedidosVencidos = pedidos.filter(p => p.vencido).length
  const importePedidosConocido = pedidos.reduce((sum, p) => sum + (p.importeIncompleto ? 0 : Number(p.importe)), 0)
  const presupuestoImporte = Number(presupuesto.importe || 0)
  const ratioPedidosPresupuesto = presupuestoImporte > 0 ? importePedidosConocido / presupuestoImporte : null
  const estadoDominante =
    pedidos.length === 0 ? 'sin_pedidos' :
    pendientes >= parciales && pendientes >= completados ? 'pendiente' :
    parciales >= completados ? 'parcial' : 'completado'

  return {
    presupuestoId: presupuesto.id,
    presupuestoImporte,
    pedidos,
    totalPedidos: pedidos.length,
    pendientes,
    parciales,
    completados,
    importePedidosConocido,
    hayImportesIncompletos: pedidosSinImporte > 0,
    hayFechasPrevistasFaltantes: pedidosSinFecha > 0,
    hayPedidosVencidos: pedidosVencidos > 0,
    pedidosSinImporte,
    pedidosSinFecha,
    pedidosVencidos,
    importeCompleto: pedidosSinImporte === 0,
    ratioPedidosPresupuesto,
    estadoDominante,
    tieneExcepciones: pedidosVencidos > 0 || pedidosSinFecha > 0 || pedidosSinImporte > 0,
  }
}

export function getPedidoExceptionScore(summary: PedidoSummary): number {
  if (summary.totalPedidos === 0) return 0
  const ratioScore = summary.ratioPedidosPresupuesto == null
    ? 0
    : Math.min(500, Math.round(summary.ratioPedidosPresupuesto * 100))
  return (
    summary.pedidosVencidos * 10000 +
    summary.pedidosSinFecha * 8000 +
    summary.pedidosSinImporte * 6000 +
    ratioScore +
    summary.totalPedidos
  )
}

export function getPedidoStatusLabel(summary: PedidoSummary): string {
  if (summary.totalPedidos === 0) return 'Sin pedidos'
  return `${summary.totalPedidos} pedido${summary.totalPedidos === 1 ? '' : 's'}`
}

export function getPedidoWarningLabels(summary: PedidoSummary): string[] {
  const labels: string[] = []
  if (summary.pedidosVencidos) labels.push(`${summary.pedidosVencidos} vencido${summary.pedidosVencidos === 1 ? '' : 's'}`)
  if (summary.pedidosSinFecha) labels.push(`${summary.pedidosSinFecha} sin fecha`)
  if (summary.pedidosSinImporte) labels.push(`${summary.pedidosSinImporte} sin importe`)
  return labels
}

export function getPedidoReadableChips(summary: PedidoSummary): string[] {
  if (summary.totalPedidos === 0) return ['Sin pedidos']
  const chips = [
    `${summary.totalPedidos} pedido${summary.totalPedidos === 1 ? '' : 's'}`,
  ]
  if (summary.pendientes) chips.push(`${summary.pendientes} pendiente${summary.pendientes === 1 ? '' : 's'}`)
  if (summary.parciales) chips.push(`${summary.parciales} parcial${summary.parciales === 1 ? '' : 'es'}`)
  if (summary.completados) chips.push(`${summary.completados} completado${summary.completados === 1 ? '' : 's'}`)
  chips.push(...getPedidoWarningLabels(summary))
  return chips
}
