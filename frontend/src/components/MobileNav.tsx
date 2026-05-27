import { NavLink } from 'react-router-dom'
import { X, type LucideIcon } from 'lucide-react'
import type { NavSection } from './Sidebar'

interface BottomTab {
  to: string
  icon: LucideIcon
  label: string
  counter?: string
}

interface Props {
  bottomTabs: BottomTab[]
  counters: Record<string, number>
}

export function BottomTabs({ bottomTabs, counters }: Props) {
  return (
    <nav className="bottom-tabs">
      {bottomTabs.map(({ to, icon: Icon, label, counter }) => {
        const value = counter ? counters[counter] : undefined
        return (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `bottom-tab${isActive ? ' active' : ''}`}
          >
            <Icon size={20} />
            <span>{label}</span>
            {value != null && value !== 0 && (
              <span className="nav-badge">{value}</span>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

interface DrawerProps {
  open: boolean
  sections: NavSection[]
  counters: Record<string, number>
  onClose: () => void
}

export function MobileDrawer({ open, sections, counters, onClose }: DrawerProps) {
  if (!open) return null

  return (
    <>
      <div className="mobile-overlay" onClick={onClose} />
      <div className="mobile-drawer">
        <div className="mobile-drawer-header">
          <span className="sidebar-brand" style={{ border: 0, margin: 0, padding: 0 }}>
            📊 PresuControl
          </span>
          <button className="btn secondary small" onClick={onClose} aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>
        <nav className="mobile-nav">
          {sections.map(section => (
            <div key={section.label} className="mobile-nav-section">
              <span className="nav-section-label">{section.label}</span>
              {section.links.map(({ to, label, icon: Icon, counter }) => {
                const value = counter ? counters[counter] : undefined
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      `nav-link${isActive ? ' active' : ''}`
                    }
                    onClick={onClose}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon size={18} />
                      {label}
                    </span>
                    {value != null && value !== 0 && (
                      <span className="nav-badge" style={{ marginLeft: 'auto' }}>
                        {value}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
      </div>
    </>
  )
}
