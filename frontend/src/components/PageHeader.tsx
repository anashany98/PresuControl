import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="page-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div>{actions}</div></div>
}
