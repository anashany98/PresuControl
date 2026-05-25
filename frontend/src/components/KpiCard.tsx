import { type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

interface KpiCardProps {
  label: string
  value: string | number
  sublabel?: string
  trend?: { value: number; isGood: boolean }
  tone?: 'danger' | 'warning' | 'success' | 'purple' | 'default'
  linkTo?: string
  icon?: LucideIcon
}

const toneBorderMap = {
  danger: 'border-l-danger',
  warning: 'border-l-warning',
  success: 'border-l-success',
  purple: 'border-l-purple-500',
  default: '',
} as const

const toneTextMap = {
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
  purple: 'text-purple-600',
  default: '',
} as const

export function KpiCard({ label, value, sublabel, trend, tone = 'default', linkTo, icon: Icon }: KpiCardProps) {
  const borderClass = toneBorderMap[tone]
  const textClass = toneTextMap[tone]
  const trendUp = trend ? trend.isGood : undefined

  const card = (
    <div
      className={`stat-card rounded-xl bg-surface-panel border border-border p-4 min-h-[100px] flex flex-col justify-between transition-all duration-150 hover:shadow-card hover:-translate-y-0.5 ${borderClass}`}
      style={tone !== 'default' ? { borderLeftWidth: '4px', borderLeftColor: tone === 'danger' ? '#dc2626' : tone === 'warning' ? '#f97316' : tone === 'success' ? '#22c55e' : '#8b5cf6' } : {}}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className={`value text-[30px] font-black tracking-tight leading-none ${textClass}`} style={tone !== 'default' && textClass === '' ? undefined : undefined}>{value}</div>
          <div className="label text-xs text-ink-muted mt-1">{label}</div>
          {sublabel && <div className="text-xs text-ink-muted mt-1">{sublabel}</div>}
        </div>
        {Icon && (
          <div className="text-ink-faint">
            <Icon size={18} />
          </div>
        )}
      </div>
      {trend !== undefined && (
        <div className={`text-xs font-semibold mt-1 ${trendUp ? 'text-success' : 'text-danger'}`}>
          {trendUp ? '↑' : '↓'} {Math.abs(trend.value)}%
        </div>
      )}
    </div>
  )

  if (linkTo) {
    return <Link to={linkTo} className="block no-underline">{card}</Link>
  }

  return card
}