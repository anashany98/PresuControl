import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { TendenciaMensual } from '../utils/dashboard'

interface TrendChartProps {
  data: TendenciaMensual[]
}

const MONTH_NAMES: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

function shortMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return MONTH_NAMES[m] || m
}

function fullMonthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return `${months[parseInt(m, 10) - 1]} ${y}`
}

function formatEUR(v: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

export function TrendChart({ data }: TrendChartProps) {
  if (!data || data.length === 0) {
    return <div className="text-xs text-ink-muted py-8 text-center">Sin datos de tendencia</div>
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorNuevos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#d47043" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#d47043" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="colorCerrados" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis
          dataKey="mes"
          tickFormatter={shortMonth}
          tick={{ fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length || label == null) return null
            const nuevos = payload.find(p => p.dataKey === 'nuevos')
            const cerrados = payload.find(p => p.dataKey === 'cerrados')
            return (
              <div className="bg-surface-panel border border-border rounded-lg px-3 py-2 text-xs shadow-sm">
                <p className="font-semibold text-ink mb-1">{fullMonthLabel(String(label))}</p>
                {nuevos && (
                  <p className="text-orange">
                    Nuevos: <span className="font-mono font-semibold">{nuevos.value}</span>
                    {' '} <span className="text-ink-muted">({formatEUR(nuevos.payload?.importe || 0)})</span>
                  </p>
                )}
                {cerrados && (
                  <p className="text-green">
                    Cerrados: <span className="font-mono font-semibold">{cerrados.value}</span>
                  </p>
                )}
              </div>
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="nuevos"
          stroke="#b85a2e"
          strokeWidth={1.5}
          fill="url(#colorNuevos)"
          fillOpacity={1}
          dot={false}
          activeDot={{ r: 3, fill: '#d47043', strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="cerrados"
          stroke="#16a34a"
          strokeWidth={1.5}
          fill="url(#colorCerrados)"
          fillOpacity={1}
          dot={false}
          activeDot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}