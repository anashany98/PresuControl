// ============================================================
// PresuControl V5 — Design Tokens (single source of truth)
// All color values reference CSS custom properties defined in styles.css
// Tailwind config mirrors these tokens for utility-class usage.
// ============================================================

export const COLOR = {
  // ── Presupuesto states ──
  borrador:    'var(--state-borrador)',
  pendiente:   'var(--state-pendiente)',
  enviado:     'var(--state-enviado)',
  aceptado:    'var(--state-aceptado)',
  pedido:      'var(--state-pedido)',
  plazo:       'var(--state-plazo)',
  fabricacion: 'var(--state-fabricacion)',
  entregado:   'var(--state-entregado)',
  cancelado:   'var(--state-cancelado)',
  incidencia:  'var(--state-incidencia)',

  // ── Pedido entrega states ──
  entregaPendiente:  'var(--state-pendiente)',
  entregaParcial:    'var(--state-enviado)',
  entregaCompletado: 'var(--state-aceptado)',

  // ── Semantic ──
  primary: 'var(--color-primary)',
  danger:  'var(--danger)',
  warning: 'var(--warning)',
  success: 'var(--green)',
  info:    'var(--blue)',

  // ── Surface / Text ──
  bg:     'var(--bg)',
  panel:  'var(--panel)',
  text:   'var(--text)',
  muted:  'var(--muted)',
  border: 'var(--border)',
} as const

// ── Priority → color (used in charts/badges) ──
export const PRIORITY_COLOR: Record<string, string> = {
  'Crítico':  '#dc2626',
  'Rojo':     '#ef4444',
  'Naranja':  '#f97316',
  'Amarillo': '#eab308',
  'Verde':    '#22c55e',
}

// ── Estado → display color (used in charts/badges) ──
export const ESTADO_COLOR: Record<string, string> = {
  'Borrador':                              '#a8a29e',
  'Pendiente de enviar':                   '#e5e7eb',
  'Enviado al cliente':                    '#3b82f6',
  'Aceptado - pendiente pedido proveedor': '#22c55e',
  'Pedido proveedor realizado':            '#8b5cf6',
  'Plazo proveedor confirmado':            '#06b6d4',
  'En preparación / fabricación':          '#ec4899',
  'Entregado / cerrado':                   '#6b7280',
  'Cancelado / rechazado':                 '#1c1917',
  'Bloqueado / incidencia':               '#ef4444',
}

// ── Entrega estado → color ──
export const ESTADO_ENTREGA_COLOR: Record<string, string> = {
  pendiente:  '#f59e0b',
  parcial:    '#3b82f6',
  completado: '#22c55e',
}
