import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ESTADOS } from '../utils/api'

interface EstadoChartProps {
  data: { estado: string; count: number; color: string }[]
}

function shortName(full: string): string {
  if (full.length <= 25) return full
  const parts = full.split(' - ')
  if (parts.length > 1) {
    const abbrev = parts.map(p => p.slice(0, Math.floor(25 / parts.length) - 1)).join(' - ')
    return abbrev.length > 25 ? full.slice(0, 22) + '...' : abbrev
  }
  return full.slice(0, 22) + '...'
}

export function EstadoChart({ data }: EstadoChartProps) {
  if (!data || data.length === 0) {
    return <div className="text-xs text-ink-muted py-8 text-center">Sin datos</div>
  }

  const total = data.reduce((s, d) => s + d.count, 0)

  // Sort by ESTADOS order
  const sorted = [...data].sort((a, b) => {
    const ai = ESTADOS.findIndex(e => e.split(' - ')[0] === a.estado)
    const bi = ESTADOS.findIndex(e => e.split(' - ')[0] === b.estado)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  const chartData = sorted.map(d => ({ ...d, short: shortName(d.estado) }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 28)}>
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="short"
          width={130}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            const pct = total > 0 ? ((d.count / total) * 100).toFixed(1) : '0'
            return (
              <div className="bg-surface-panel border border-border rounded-lg px-3 py-2 text-xs shadow-sm">
                <p className="font-semibold text-ink mb-1">{d.estado}</p>
                <p className="text-ink">
                  <span className="font-mono font-semibold">{d.count}</span> presupuestos
                  {' '}<span className="text-ink-muted">({pct}%)</span>
                </p>
              </div>
            )
          }}
        />
        <Bar dataKey="count" radius={[0, 3, 3, 0]} animationDuration={500}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}