export const API_URL = import.meta.env.VITE_API_URL || '/api/v1'
export const AUTH_TOKEN_KEY = 'presucontrol_token'

export function getAuthToken() {
  const cookie = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${AUTH_TOKEN_KEY}=`))
  if (cookie) return cookie.split('=')[1]
  return sessionStorage.getItem(AUTH_TOKEN_KEY)
}

export function storeAuthToken(token: string) {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token)
  localStorage.removeItem(AUTH_TOKEN_KEY)
}

export function clearAuthToken() {
  document.cookie = `${AUTH_TOKEN_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; samesite=strict`
  sessionStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem('presucontrol_user')
}

export const ESTADOS = [
  'Borrador',
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
export type OperationalPriority = 'urgente' | 'hoy' | 'semana' | 'sin_fecha'
export type RecommendedActionType = 'crear_pedido' | 'confirmar_plazo' | 'actualizar_fecha' | 'resolver_incidencia' | 'abrir_detalle'
export type RecommendedAction = {
  tipo: RecommendedActionType
  label: string
  target_tab?: 'datos' | 'pedidos' | 'historial' | 'proveedores'
}

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
  numero_pedido_cliente?: string | null
  codigo_cliente_factusol?: string | null
  fecha_medicion?: string | null
  fecha_recepcion_mercancia?: string | null
  plazo_confeccion?: string | null
  fecha_entrega_cliente?: string | null
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
  pedidos?: PedidoProveedor[]
  proveedores_asociados?: PresupuestoProveedor[]
  prioridad_operativa?: OperationalPriority
  motivos?: string[]
  accion_recomendada?: RecommendedAction
  faltantes?: string[]
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
  rol: 'admin_sistema' | 'gestion'
  aprobado_en?: string | null
  aprobado_por?: string | null
  creado_en: string
  ultimo_login?: string | null
  presupuestos_count: number
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
  gestores_emails: Record<string, string>
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
  timezone: string
  public_url: string
  smtp_configured: boolean
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_password: string
  smtp_from: string
  smtp_tls: boolean
}

export type MetadataOptions = {
  gestores: string[]
  proveedores: string[]
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken()
  const headers: Record<string, string> = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  })
  if (!res.ok) {
    const isAuthPublicPath = path === '/auth/me' || path.startsWith('/auth/login') || path.startsWith('/auth/register')
    if (res.status === 401 && !isAuthPublicPath) {
      clearAuthToken()
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

  getMetadataOptions() { return request<MetadataOptions>('/metadata/options') },

  getPedidos(presupuestoId: number) {
    return request<PedidoProveedor[]>(`/presupuestos/${presupuestoId}/pedidos`)
  },
  createPedido(presupuestoId: number, data: Partial<PedidoProveedor>) {
    return request<PedidoProveedor>(`/presupuestos/${presupuestoId}/pedidos`, { method: 'POST', body: JSON.stringify(data) })
  },
  updatePedido(pedidoId: number, data: Partial<PedidoProveedor>) {
    return request<PedidoProveedor>(`/pedidos/${pedidoId}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  deletePedido(pedidoId: number) {
    return request<void>(`/pedidos/${pedidoId}`, { method: 'DELETE' })
  },

  getProveedores() { return request<Proveedor[]>(`/proveedores`) },
  getProveedoresPresupuesto(presupuestoId: number) { return request<PresupuestoProveedor[]>(`/presupuestos/${presupuestoId}/proveedores`) },
  addProveedorPresupuesto(presupuestoId: number, data: PresupuestoProveedorCreate) { return request<PresupuestoProveedor>(`/presupuestos/${presupuestoId}/proveedores`, { method: 'POST', body: JSON.stringify(data) }) },
  updateProveedorPresupuesto(presupuestoId: number, proveedorId: number, data: PresupuestoProveedorUpdate) { return request<PresupuestoProveedor>(`/presupuestos/${presupuestoId}/proveedores/${proveedorId}`, { method: 'PATCH', body: JSON.stringify(data) }) },
  removeProveedorPresupuesto(presupuestoId: number, proveedorId: number) { return request<void>(`/presupuestos/${presupuestoId}/proveedores/${proveedorId}`, { method: 'DELETE' }) },
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

export type SidebarCounters = { hoy: number; aceptados_sin_pedido: number; riesgo: number; incidencias: number; usuarios_pendientes: number; dinero_riesgo: number; notificaciones_sin_leer: number; pedidos_pendientes: number }

export type KanbanPayload = {
  action: string
  expected_version: number
  fecha_envio_cliente?: string
  fecha_aceptacion?: string
  proveedor?: string
  numero_pedido_cliente?: string
  codigo_cliente_factusol?: string
  fecha_medicion?: string
  fecha_recepcion_mercancia?: string
  plazo_confeccion?: string
  fecha_entrega_cliente?: string
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

export const ESTADO_ENTREGA_OPTIONS = ['pendiente', 'parcial', 'completado'] as const
export type EstadoEntrega = typeof ESTADO_ENTREGA_OPTIONS[number]

export type PedidoProveedor = {
  id: number
  presupuesto_id: number
  proveedor_id?: number | null
  proveedor: string
  proveedor_nombre_snapshot?: string | null
  numero_pedido?: string | null
  fecha_pedido?: string | null
  importe?: number | null
  estado_entrega: EstadoEntrega
  fecha_entrega_prevista?: string | null
  fecha_entrega_real?: string | null
  observaciones?: string | null
  creado_en: string
  actualizado_en: string
}

export type PedidoProveedorCreate = {
  presupuesto_id: number
  proveedor_id?: number | null
  proveedor: string
  proveedor_nombre_snapshot?: string | null
  numero_pedido?: string | null
  fecha_pedido?: string | null
  importe?: number | null
  estado_entrega?: EstadoEntrega
  fecha_entrega_prevista?: string | null
  fecha_entrega_real?: string | null
  observaciones?: string | null
}

export type PedidoProveedorUpdate = Partial<Omit<PedidoProveedorCreate, 'presupuesto_id'>>

export type Proveedor = {
  id: number
  nombre: string
  contacto?: string | null
  email?: string | null
  telefono?: string | null
  direccion?: string | null
  notas?: string | null
  evaluacion_promedio?: number | null
  total_evaluaciones: number
  activo: boolean
  creado_en: string
  actualizado_en: string
}

export type PresupuestoProveedor = {
  id: number
  presupuesto_id: number
  proveedor_id: number
  estado: 'contactado' | 'cotizacion_recibida' | 'descartado'
  importe_cotizado?: number | null
  fecha_cotizacion?: string | null
  notas?: string | null
  creado_en: string
  actualizado_en: string
  proveedor: Proveedor
}

export type ProveedorCreate = { nombre: string; contacto?: string; email?: string; telefono?: string; direccion?: string; notas?: string }
export type ProveedorUpdate = Partial<ProveedorCreate>
export type PresupuestoProveedorCreate = { proveedor_id: number; estado?: string; importe_cotizado?: number; fecha_cotizacion?: string; notas?: string }
export type PresupuestoProveedorUpdate = Partial<Omit<PresupuestoProveedorCreate, 'proveedor_id'>>
