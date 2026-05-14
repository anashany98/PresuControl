import type { LucideIcon } from 'lucide-react'

export function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: LucideIcon; tone?: string }) {
  return (
    <div className="card stat">
      <div>
        <div className="value" style={tone ? { color: tone } : undefined}>{value}</div>
        <div className="label">{label}</div>
      </div>
      <div className="icon"><Icon size={20} /></div>
    </div>
  )
}
