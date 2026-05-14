export const API_URL = import.meta.env.VITE_API_URL || '/api'

export const ESTADOS = [
  'Pendiente de enviar',
  'Enviado al cliente',
  'Aceptado - pendiente pedido proveedor',
  'Pedido proveedor realizado',
  'Plazo proveedor confirmado',
  'En preparación / fabricación',
  'Entregado / cerrado',
  'Cancelado / rechazado',
  'Bloqueado / incidencia',
] as const

export type Prioridad = 'Verde' | 'Amarillo' | 'Naranja' | 'Rojo' | 'Crítico'

export type Presupuesto = {
  id: number
  numero_presupuesto: string
  cliente: string
  obra_referencia: string
  gestor: string
  fecha_presupuesto: string
  fecha_envio_cliente?: string | null
  fecha_aceptacion?: string | null
  importe: number
  estado: string
  proveedor?: string | null
  pedido_proveedor_realizado: boolean
  numero_pedido_proveedor?: string | null
  fecha_pedido_proveedor?: string | null
  plazo_proveedor?: string | null
  fecha_prevista_entrega?: string | null
  responsable_actual?: string | null
  siguiente_accion?: string | null
  fecha_limite_siguiente_accion?: string | null
  incidencia: boolean
  descripcion_incidencia?: string | null
  observaciones?: string | null
  motivo_cancelacion_rechazo?: string | null
  fecha_cancelacion_rechazo?: string | null
  archivado?: boolean
  archivado_en?: string | null
  archivado_por?: string | null
  motivo_archivado?: string | null
  prioridad_calculada: Prioridad
  dias_parado: number
  fecha_ultima_actualizacion: string
  creado_en: string
  actualizado_en: string
  version: number
}


export type PaginatedPresupuestos = {
  items: Presupuesto[]
  total: number
  page: number
  page_size: number
  total_pages: number
  importe_total: number
}

export type UserAdmin = {
  id: number
  nombre: string
  email: string
  activo: boolean
  aprobado: boolean
  puede_gestionar_sistema: boolean
  aprobado_en?: string | null
  aprobado_por?: string | null
  creado_en: string
}

export type EmailLog = {
  id: number
  presupuesto_id?: number | null
  tipo: string
  fingerprint: string
  sent_to?: string | null
  status: string
  error?: string | null
  escalation_level: number
  creado_en: string
}

export type ActivityLog = {
  id: number
  presupuesto_id: number
  campo: string
  valor_anterior?: string | null
  valor_nuevo?: string | null
  descripcion: string
  nombre_opcional?: string | null
  usuario_nombre?: string | null
  usuario_email?: string | null
  creado_en: string
}

export type Settings = {
  estados: string[]
  gestores: string[]
  proveedores: string[]
  tipos_incidencia: string[]
  dias_critico_aceptado_sin_pedido: number
  dias_vencido_seguimiento_comercial: number
  dias_aviso_pedido_sin_plazo: number
  email_avisos_activo: boolean
  emails_destino_avisos: string[]
  enviar_email_criticos_inmediato: boolean
  asunto_email_avisos: string
  avisos_automaticos_activos: boolean
  resumen_diario_automatico_activo: boolean
  hora_resumen_diario: string
  intervalo_revision_avisos_minutos: number
  escalado_automatico_activo: boolean
  emails_escalado_avisos: string[]
  horas_escalado_nivel_1: number
  horas_escalado_nivel_2: number
  horas_escalado_nivel_3: number
  dias_sin_actualizar_aviso: number
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('presucontrol_token')
  const headers: Record<string, string> = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  })
  if (!res.ok) {
    const isAuthPublicPath = path === '/auth/me' || path.startsWith('/auth/login') || path.startsWith('/auth/register') || path.startsWith('/auth/password/')
    if (res.status === 401 && !isAuthPublicPath) {
      localStorage.removeItem('presucontrol_token')
      localStorage.removeItem('presucontrol_user')
      window.location.href = '/login'
    }
    let message = `Error ${res.status}`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') message = body.detail
      else if (body.detail?.errors) message = body.detail.errors.join(' ')
      else message = JSON.stringify(body.detail || body)
    } catch {}
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: request,
  post<T>(path: string, body?: unknown) { return request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body || {}) }) },
  patch<T>(path: string, body: unknown) { return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }) },
  put<T>(path: string, body: unknown) { return request<T>(path, { method: 'PUT', body: JSON.stringify(body) }) },
  delete<T>(path: string) { return request<T>(path, { method: 'DELETE' }) },
}

export function euro(value?: number | null) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value || 0)
}

export function fmtDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-ES').format(new Date(value))
}

export function isoDate(value?: string | null) {
  if (!value) return ''
  return value.slice(0, 10)
}

export type SidebarCounters = { hoy: number; aceptados_sin_pedido: number; riesgo: number; incidencias: number; usuarios_pendientes: number; dinero_riesgo: number; notificaciones_sin_leer: number }

export type KanbanPayload = {
  action: string
  expected_version: number
  fecha_envio_cliente?: string
  fecha_aceptacion?: string
  proveedor?: string
  numero_pedido_proveedor?: string
  fecha_pedido_proveedor?: string
  plazo_proveedor?: string
  fecha_prevista_entrega?: string
  responsable_actual?: string
  siguiente_accion?: string
  fecha_limite_siguiente_accion?: string
  descripcion_incidencia?: string
  motivo_cancelacion_rechazo?: string
  fecha_cancelacion_rechazo?: string
}

export type SearchResult = {
  total_presupuestos: number
  total_comentarios: number
  total_historial: number
  total_pages: number
  presupuestos: Presupuesto[]
  comentarios: Array<{ id: number; comentario: string; presupuesto_id: number; numero_presupuesto: string; cliente: string; creado_en: string }>
  historial: Array<{ id: number; descripcion: string; presupuesto_id: number; numero_presupuesto: string; cliente: string; creado_en: string }>
}

export function exportUrl(mode = 'all', params = new URLSearchParams()) {
  params.set('mode', mode)
  return `${API_URL}/export?${params.toString()}`
}
