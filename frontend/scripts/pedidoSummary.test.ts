import assert from 'node:assert/strict'
import {
  getPedidoExceptionScore,
  getPedidoReadableChips,
  getPedidoSummary,
  getPedidoWarningLabels,
} from '../src/utils/pedidoSummary.ts'
import { getOperationalContext } from '../src/utils/workflow.ts'
import type { Presupuesto } from '../src/utils/api'

function presupuesto(overrides: Partial<Presupuesto>): Presupuesto {
  return {
    id: 1,
    numero_presupuesto: 'P-1',
    cliente: 'Cliente',
    obra_referencia: 'Obra',
    gestor: 'Gestor',
    fecha_presupuesto: '2026-05-01',
    importe: 10000,
    estado: 'Pedido proveedor realizado',
    pedido_proveedor_realizado: true,
    incidencia: false,
    prioridad_calculada: 'Verde',
    dias_parado: 0,
    fecha_ultima_actualizacion: '2026-05-19T00:00:00Z',
    creado_en: '2026-05-01T00:00:00Z',
    actualizado_en: '2026-05-19T00:00:00Z',
    version: 1,
    ...overrides,
  }
}

const summary = getPedidoSummary(presupuesto({
  pedidos: [
    {
      id: 1,
      presupuesto_id: 1,
      proveedor: 'Proveedor A',
      numero_pedido: 'PA-1',
      importe: 2500,
      estado_entrega: 'pendiente',
      fecha_entrega_prevista: '2026-05-18',
      creado_en: '2026-05-01T00:00:00Z',
      actualizado_en: '2026-05-01T00:00:00Z',
    },
    {
      id: 2,
      presupuesto_id: 1,
      proveedor: 'Proveedor B',
      numero_pedido: 'PB-1',
      importe: null,
      estado_entrega: 'parcial',
      fecha_entrega_prevista: null,
      creado_en: '2026-05-01T00:00:00Z',
      actualizado_en: '2026-05-01T00:00:00Z',
    },
    {
      id: 3,
      presupuesto_id: 1,
      proveedor: 'Proveedor C',
      numero_pedido: 'PC-1',
      importe: 1000,
      estado_entrega: 'completado',
      fecha_entrega_prevista: '2026-05-10',
      creado_en: '2026-05-01T00:00:00Z',
      actualizado_en: '2026-05-01T00:00:00Z',
    },
  ],
}), new Date('2026-05-19T12:00:00Z'))

assert.equal(summary.totalPedidos, 3)
assert.equal(summary.pendientes, 1)
assert.equal(summary.parciales, 1)
assert.equal(summary.completados, 1)
assert.equal(summary.importePedidosConocido, 3500)
assert.equal(summary.hayImportesIncompletos, true)
assert.equal(summary.hayFechasPrevistasFaltantes, true)
assert.equal(summary.hayPedidosVencidos, true)
assert.equal(summary.tieneExcepciones, true)
assert.ok(getPedidoExceptionScore(summary) > 0)
assert.deepEqual(getPedidoReadableChips(summary), [
  '3 pedidos',
  '1 pendiente',
  '1 parcial',
  '1 completado',
  '1 vencido',
  '1 sin fecha',
  '1 sin importe',
])
assert.deepEqual(getPedidoWarningLabels(summary), ['1 vencido', '1 sin fecha', '1 sin importe'])

const legacy = getPedidoSummary(presupuesto({
  pedidos: [],
  proveedor: 'Legacy SL',
  numero_pedido_proveedor: 'LEG-1',
  fecha_pedido_proveedor: '2026-05-02',
  fecha_prevista_entrega: '2026-05-30',
}), new Date('2026-05-19T12:00:00Z'))

assert.equal(legacy.totalPedidos, 1)
assert.equal(legacy.pedidos[0].proveedor, 'Legacy SL')
assert.equal(legacy.pendientes, 1)

const acceptedWithoutOrder = getOperationalContext(presupuesto({
  estado: 'Aceptado - pendiente pedido proveedor',
  fecha_aceptacion: '2026-05-10',
  fecha_limite_siguiente_accion: '2026-05-18',
  pedidos: [],
}), new Date('2026-05-19T12:00:00Z'))

assert.equal(acceptedWithoutOrder.prioridad_operativa, 'urgente')
assert.ok(acceptedWithoutOrder.motivos.includes('Aceptado sin pedido proveedor'))
assert.equal(acceptedWithoutOrder.accion_recomendada.tipo, 'crear_pedido')
assert.ok(acceptedWithoutOrder.faltantes.includes('pedido proveedor'))

const noDeadline = getOperationalContext(presupuesto({
  fecha_limite_siguiente_accion: null,
  siguiente_accion: '',
  prioridad_calculada: 'Verde',
  pedidos: [],
}), new Date('2026-05-19T12:00:00Z'))

assert.equal(noDeadline.prioridad_operativa, 'sin_fecha')
assert.equal(noDeadline.accion_recomendada.tipo, 'actualizar_fecha')

console.log('pedidoSummary tests passed')
