/**
 * TanStack Query hooks for PresuControl API.
 * Replaces manual useData/useEffect patterns with cached, auto-refetching queries.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type KanbanBoardData, type MetadataOptions, type PaginatedPresupuestos, type Presupuesto, type Settings, type SidebarCounters, type PedidoProveedor, type Proveedor, type UserAdmin, type SearchResult } from './api'

// ── Query key factory ─────────────────────────────────────────────

export const queryKeys = {
  presupuestos: {
    all: ['presupuestos'] as const,
    list: (params?: Record<string, unknown>) => ['presupuestos', 'list', params] as const,
    page: (params?: Record<string, unknown>) => ['presupuestos', 'page', params] as const,
    detail: (id: number) => ['presupuestos', 'detail', id] as const,
    kanban: (gestor?: string) => ['presupuestos', 'kanban', gestor] as const,
  },
  dashboard: ['dashboard'] as const,
  sidebar: ['sidebar'] as const,
  metadata: ['metadata'] as const,
  settings: ['settings'] as const,
  pedidos: {
    byPresupuesto: (id: number) => ['pedidos', id] as const,
  },
  proveedores: ['proveedores'] as const,
  usuarios: ['usuarios'] as const,
  search: (q: string) => ['search', q] as const,
  notificaciones: {
    count: ['notificaciones', 'count'] as const,
    list: ['notificaciones', 'list'] as const,
  },
}

// ── Presupuestos ──────────────────────────────────────────────────

export function usePresupuestosList(params?: Record<string, unknown>) {
  return useQuery<Presupuesto[]>({
    queryKey: queryKeys.presupuestos.list(params),
    queryFn: () => {
      const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
      return api.get(`/presupuestos${qs}`)
    },
  })
}

export function usePresupuestosPage(params?: Record<string, unknown>) {
  return useQuery<PaginatedPresupuestos>({
    queryKey: queryKeys.presupuestos.page(params),
    queryFn: () => {
      const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
      return api.get(`/presupuestos-page${qs}`)
    },
    placeholderData: (prev) => prev, // keep previous data while fetching next page
  })
}

export function usePresupuesto(id: number) {
  return useQuery<Presupuesto>({
    queryKey: queryKeys.presupuestos.detail(id),
    queryFn: () => api.get(`/presupuestos/${id}`),
    enabled: id > 0,
  })
}

export function useKanbanBoard(gestor?: string) {
  return useQuery<KanbanBoardData>({
    queryKey: queryKeys.presupuestos.kanban(gestor),
    queryFn: () => {
      const qs = gestor ? `?gestor=${encodeURIComponent(gestor)}` : ''
      return api.get(`/presupuestos/kanban${qs}`)
    },
    staleTime: 15_000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────

export function useCreatePresupuesto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<Presupuesto>('/presupuestos', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.presupuestos.all })
      qc.invalidateQueries({ queryKey: queryKeys.sidebar })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

export function useUpdatePresupuesto(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch<Presupuesto>(`/presupuestos/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.presupuestos.detail(id) })
      qc.invalidateQueries({ queryKey: queryKeys.presupuestos.all })
      qc.invalidateQueries({ queryKey: queryKeys.sidebar })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

export function useArchivarPresupuesto(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { expected_version: number; motivo_archivado?: string }) =>
      api.post<Presupuesto>(`/presupuestos/${id}/archivar`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.presupuestos.all })
      qc.invalidateQueries({ queryKey: queryKeys.sidebar })
    },
  })
}

export function useQuickAction(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<Presupuesto>(`/presupuestos/${id}/quick-action`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.presupuestos.all })
      qc.invalidateQueries({ queryKey: queryKeys.sidebar })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

// ── Pedidos ───────────────────────────────────────────────────────

export function usePedidos(presupuestoId: number) {
  return useQuery<PedidoProveedor[]>({
    queryKey: queryKeys.pedidos.byPresupuesto(presupuestoId),
    queryFn: () => api.getPedidos(presupuestoId),
    enabled: presupuestoId > 0,
  })
}

export function useCreatePedido(presupuestoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.createPedido(presupuestoId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pedidos.byPresupuesto(presupuestoId) })
      qc.invalidateQueries({ queryKey: queryKeys.presupuestos.detail(presupuestoId) })
    },
  })
}

export function useUpdatePedido(pedidoId: number, presupuestoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.updatePedido(pedidoId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pedidos.byPresupuesto(presupuestoId) })
    },
  })
}

export function useDeletePedido(pedidoId: number, presupuestoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.deletePedido(pedidoId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pedidos.byPresupuesto(presupuestoId) })
    },
  })
}

// ── Dashboard & Sidebar ───────────────────────────────────────────

export function useDashboard() {
  return useQuery<import('./dashboard').DashboardPayload>({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.get<import('./dashboard').DashboardPayload>('/dashboard'),
    staleTime: 30_000,
  })
}

export function useSidebarCounters() {
  return useQuery<SidebarCounters>({
    queryKey: queryKeys.sidebar,
    queryFn: () => api.get('/sidebar-counters'),
    staleTime: 60_000,
    refetchInterval: 120_000, // refresh every 2 min
  })
}

// ── Metadata ──────────────────────────────────────────────────────

export function useMetadataOptions() {
  return useQuery<MetadataOptions>({
    queryKey: queryKeys.metadata,
    queryFn: () => api.getMetadataOptions(),
    staleTime: 5 * 60_000, // 5min - rarely changes
  })
}

// ── Settings ──────────────────────────────────────────────────────

export function useSettings() {
  return useQuery<Settings>({
    queryKey: queryKeys.settings,
    queryFn: () => api.get('/settings'),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put<Settings>('/settings', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings })
    },
  })
}

// ── Proveedores ───────────────────────────────────────────────────

export function useProveedores() {
  return useQuery<Proveedor[]>({
    queryKey: queryKeys.proveedores,
    queryFn: () => api.getProveedores(),
    staleTime: 60_000,
  })
}

// ── Usuarios ──────────────────────────────────────────────────────

export function useUsuarios() {
  return useQuery<UserAdmin[]>({
    queryKey: queryKeys.usuarios,
    queryFn: () => api.get('/usuarios'),
  })
}

// ── Search ────────────────────────────────────────────────────────

export function useSearch(q: string) {
  return useQuery<SearchResult>({
    queryKey: queryKeys.search(q),
    queryFn: () => api.get(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  })
}

// ── Notificaciones ────────────────────────────────────────────────

export function useNotificacionesCount() {
  return useQuery<{ sin_leer: number }>({
    queryKey: queryKeys.notificaciones.count,
    queryFn: () => api.get('/notificaciones/sin-leer'),
    refetchInterval: 60_000,
  })
}
