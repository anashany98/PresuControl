// BOOT-TIME FALLBACK. The canonical source of truth is `backend/app/schemas.py`
// (consolidated in A-01). The frontend hook `useMetadataOptions()` fetches the
// same list at runtime from `/api/v1/metadata/options` and overrides this on
// load. These constants exist only so the UI renders the first paint before
// the metadata call returns (or if the call fails). Drift here was the cause
// of the production Kanban showing zero data (bug af71529).
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
export type Estado = typeof ESTADOS[number]

// Same story as ESTADOS: boot-time fallback mirrored from
// `backend/app/schemas.py:PRIORIDADES`.
export const PRIORIDADES = [
  'Verde',
  'Amarillo',
  'Naranja',
  'Rojo',
  'Crítico',
] as const
export type Prioridad = typeof PRIORIDADES[number]

export const API_URL = import.meta.env.VITE_API_URL || '/api/v1'
export const AUTH_TOKEN_KEY = 'presucontrol_token'

// Cookie is HttpOnly; JS cannot read or write it directly.
// Server sets it on login, server clears it on logout via POST /auth/logout.
// localStorage/sessionStorage no longer used for JWT.

export function clearAuthToken() {
  // Clears any residual localStorage keys (not the HttpOnly cookie).
  // The actual cookie is cleared by the server via /auth/logout.
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem('presucontrol_user')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
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
      if (typeof body.detail === 'string') {
        message = body.detail
      } else if (body.detail && typeof body.detail === 'object') {
        const parts: string[] = []
        if (Array.isArray(body.detail.errors) && body.detail.errors.length) {
          parts.push(...body.detail.errors)
        }
        if (Array.isArray(body.detail.warnings) && body.detail.warnings.length) {
          parts.push(...body.detail.warnings.map((w: string) => `⚠ ${w}`))
        }
        if (parts.length) {
          message = parts.join('. ')
        } else {
          message = JSON.stringify(body.detail)
        }
      } else if (body.detail) {
        message = JSON.stringify(body.detail)
      } else {
        message = JSON.stringify(body)
      }
    } catch { /* empty */ }
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

export function euro(value?: number | null | undefined): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value || 0)
}

export function fmtDate(value: unknown): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-ES').format(new Date(value as string))
}

export function isoDate(value?: string | null | undefined): string {
  if (!value) return ''
  return (value as string).slice(0, 10)
}

export type KanbanColumnData = {
  items: Presupuesto[]
  total: number
}

export type KanbanBoardData = {
  columns: Record<string, KanbanColumnData>
  flow: Record<string, string[]>
  wip_limits: Record<string, number>
}

export type KanbanMove = {
  presupuestoId: number
  fromEstado: string
  toEstado: string
  prevVersion: number
  newVersion: number
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

// Dummy auth-token getter: the HttpOnly cookie cannot be read by JS.
// Returns null; callers send it in Authorization header and backend uses the cookie.
export function getAuthToken(): string | null {
  return null
}

// === Settings (configuration panel) ===
export type Settings = {
  // ListEditor fields
  estado_choices?: string[]
  estados?: string[]
  gestores_emails?: Record<string, string>
  gestores?: string[]
  gestores_all?: string[]
  proveedores?: string[]
  tipos_incidencia?: string[]
  emails_destino_avisos: string[]
  emails_escalado_avisos: string[]
  escalado_automatico_activo: boolean
  // Timing fields
  dias_critico_aceptado_sin_pedido: number
  dias_vencido_seguimiento_comercial: number
  dias_aviso_pedido_sin_plazo: number
  dias_sin_actualizar_aviso: number
  intervalo_revision_avisos_minutos: number
  horas_escalado_nivel_1: number
  horas_escalado_nivel_2: number
  horas_escalado_nivel_3: number
  hora_resumen_diario: string
  // Email/automation toggles
  email_avisos_activo: boolean
  enviar_email_criticos_inmediato: boolean
  avisos_automaticos_activos: boolean
  resumen_diario_automatico_activo: boolean
  asunto_email_avisos?: string
  // SMTP fields
  smtp_host?: string
  smtp_port?: number
  smtp_user?: string
  smtp_password?: string
  smtp_from?: string
  smtp_tls: boolean
  smtp_configured: boolean
  // Server info (read-only from backend)
  timezone?: string
  public_url?: string
  [key: string]: string | string[] | boolean | number | Record<string, string> | undefined
}

export type EmailLog = {
  id: number
  tipo: string
  status: string
  sent_to: string
  escalation_level?: string | null
  created_at: string
  presupuesto_id?: number | null
  numero_presupuesto?: string | null
  error?: string | null
  // alias used by the frontend
  creado_en?: string
}

export type ActivityLog = {
  id: number
  usuario_email?: string | null
  usuario_nombre?: string | null
  nombre_opcional?: string | null
  accion: string
  descripcion?: string | null
  campo?: string | null
  presupuesto_id?: number | null
  numero_presupuesto?: string | null
  creado_en: string
}

// === Paginated presupuestos ===
export type PaginatedPresupuestos = {
  items: Presupuesto[]
  total: number
  page: number
  page_size: number
  total_pages: number
  importe_total?: number
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

// === Tipos del backend para Presupuesto ===
export type Presupuesto = {
  id: number
  numero_presupuesto: string
  cliente: string
  obra_referencia?: string | null
  gestor?: string | null
  fecha_presupuesto?: string | null
  fecha_envio_cliente?: string | null
  fecha_aceptacion?: string | null
  fecha_cancelacion_rechazo?: string | null
  fecha_limite_siguiente_accion?: string | null
  importe: number
  estado: string
  proveedor?: string | null
  numero_pedido_cliente?: string | null
  numero_pedido_proveedor?: string | null
  fecha_pedido_proveedor?: string | null
  plazo_proveedor?: string | null
  fecha_prevista_entrega?: string | null
  fecha_estimacion_termino?: string | null
  fecha_entrega_cliente?: string | null
  fecha_recepcion_mercancia?: string | null
  plazo_confeccion?: string | null
  fecha_medicion?: string | null
  responsable_actual?: string | null
  siguiente_accion?: string | null
  descripcion_incidencia?: string | null
  motivo_cancelacion_rechazo?: string | null
  observaciones?: string | null
  etiquetas?: string | null
  incidencia: boolean
  archivado: boolean
  codigo_cliente_factusol?: string | null
  pedido_proveedor_realizado: boolean
  prioridad_calculada?: string | null
  dias_parado?: number | null
  version: number
  creado_por?: string | null
  creado_en: string
  actualizado_en: string
  // Fase 0 additions (may not always be present)
  pedidos?: Array<{
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
  }>
  fecha_ultima_actualizacion?: string | null
  prioridad_operativa?: OperationalPriority | null
  accion_recomendada?: RecommendedAction | null
  motivos?: string[]
  faltantes?: string[]
}

// === Metadata options para formularios (gestores, proveedores) ===
export type MetadataOptions = {
  gestores: string[]
  proveedores: string[]
  estados?: string[]
  gestores_emails?: Record<string, string>
  tipos_incidencia?: string[]
  emails_destino_avisos?: string[]
  emails_escalado_avisos?: string[]
  escalado_automatico_activo?: boolean
  dias_critico_aceptado_sin_pedido?: number
  dias_vencido_seguimiento_comercial?: number
  dias_aviso_pedido_sin_plazo?: number
  dias_sin_actualizar_aviso?: number
  intervalo_revision_avisos_minutos?: number
  horas_escalado_nivel_1?: number
  horas_escalado_nivel_2?: number
  horas_escalado_nivel_3?: number
  hora_resumen_diario?: string
  // Allow extra fields from various endpoints
  [key: string]: string | string[] | number | boolean | Record<string, string> | undefined
}

// === Admin user list (panel de usuarios) ===
export type UserAdmin = {
  id: number
  email: string
  nombre: string
  rol?: string
  activo: boolean
  aprobado: boolean
  puede_gestionar_sistema: boolean
  creado_en: string
  ultimo_acceso?: string | null
  ultimo_login?: string | null
  presupuestos_count?: number
}

// === Operational priority y recommended action (Kanban/Mi trabajo) ===
export type OperationalPriority = 'urgente' | 'hoy' | 'semana' | 'sin_fecha'

export type RecommendedAction = {
  tipo: string
  label: string
  target_tab?: string
  presupuesto_id?: number
  reason?: string
}

export type RecommendedActionType = RecommendedAction
