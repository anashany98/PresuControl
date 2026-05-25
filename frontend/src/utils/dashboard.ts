import type { Presupuesto } from './api'

export interface AlertaDashboard {
  tipo: 'critico' | 'warning' | null
  mensaje: string
  count: number
}

export interface KpiDashboard {
  key: string
  value: number
  sublabel?: string
  trend?: number
  trendUp?: boolean
  tone?: 'danger' | 'warning' | 'success' | 'purple' | 'default'
}

export interface TendenciaMensual {
  mes: string
  nuevos: number
  cerrados: number
  importe: number
}

export interface DashboardPayload {
  alerta: AlertaDashboard
  kpis: KpiDashboard[]
  tendencias: TendenciaMensual[]
  resumen_texto: string
  cards: Record<string, number>
  sections: Record<string, Presupuesto[]>
  excepciones_pedidos: Presupuesto[]
  kpi_riesgo: number
}