import { NavLink } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

export interface NavSection {
  label: string
  adminOnly?: boolean
  links: NavLinkDef[]
}

export interface NavLinkDef {
  to: string
  label: string
  icon: LucideIcon
  counter?: string
}

interface Props {
  sections: NavSection[]
  counters: Record<string, number>
  collapsed: boolean
  onToggleCollapse: () => void
  onLinkClick: () => void
}

export function Sidebar({ sections, counters, collapsed, onToggleCollapse, onLinkClick }: Props) {
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} style={{ position: 'relative' }}>
      <button
        className="sidebar-toggle"
        onClick={onToggleCollapse}
        title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
      >
        ◀
      </button>

      <div className="sidebar-brand" aria-label="PresuControl">
        <span aria-hidden="true">📊</span>
        {!collapsed && <span>PresuControl</span>}
      </div>

      <nav className="sidebar-nav">
        {sections.map(section => (
          <div key={section.label}>
            {!collapsed && <div className="sidebar-section-title">{section.label}</div>}
            {section.links.map(({ to, label, icon: Icon, counter }) => {
              const value = counter ? counters[counter] : undefined
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `sidebar-link${isActive ? ' active' : ''}`
                  }
                  onClick={onLinkClick}
                  title={label}
                >
                  <Icon size={18} />
                  {!collapsed && <span>{label}</span>}
                  {!collapsed && value != null && value !== 0 && (
                    <span className="nav-badge">{value}</span>
                  )}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
