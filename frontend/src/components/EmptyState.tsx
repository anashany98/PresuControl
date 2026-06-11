import { type LucideIcon } from 'lucide-react'

type EmptyStateAction = {
  label: string
  to?: string
  onClick?: () => void
  primary?: boolean
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  actions?: EmptyStateAction[]
}) {
  return (
    <div className="empty-state">
      {Icon && (
        <div className="empty-state-icon">
          <Icon size={28} />
        </div>
      )}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {actions && actions.length > 0 && (
        <div className="empty-state-actions">
          {actions.map((a, i) =>
            a.to ? (
              <a key={i} href={a.to} className={a.primary ? 'btn' : 'btn secondary'}>
                {a.label}
              </a>
            ) : (
              <button key={i} className={a.primary ? 'btn' : 'btn secondary'} onClick={a.onClick}>
                {a.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
