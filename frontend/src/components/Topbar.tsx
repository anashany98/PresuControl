import { NavLink, useNavigate } from 'react-router-dom'
import { Activity, Bell, ChevronDown, Gauge, LogOut, Menu, Moon, Search, Settings, UserCheck, X } from 'lucide-react'
import { type FormEvent, useRef, useState, useEffect } from 'react'
import { isSystemAdmin, useAuth } from '../utils/auth'
import type { NavSection } from './Sidebar'

interface Props {
  sections: NavSection[]
  counters: Record<string, number>
  onMenuClick: () => void
  onNotifClick?: () => void
  onActivityClick?: () => void
  isAdmin?: boolean
}

function NavDropdown({ section, counters }: { section: NavSection; counters: Record<string, number> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function onEnter() {
    clearTimeout(timeoutRef.current)
    setOpen(true)
  }
  function onLeave() {
    timeoutRef.current = setTimeout(() => setOpen(false), 200)
  }

  return (
    <div
      ref={ref}
      className="topbar-nav-group"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <button
        className="topbar-nav-dropdown-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {section.label} <ChevronDown size={12} className={`chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="topbar-nav-dropdown">
          {section.links.map(({ to, label, icon: Icon, counter }) => {
            const value = counter ? counters[counter] : undefined
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `topbar-nav-link${isActive ? ' active' : ''}`
                }
                title={label}
                onClick={() => setOpen(false)}
              >
                <Icon size={16} />
                <span>{label}</span>
                {value != null && value !== 0 && (
                  <span className="nav-badge">{value}</span>
                )}
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Topbar({ sections, counters, onMenuClick, onNotifClick, onActivityClick, isAdmin }: Props) {
  const [q, setQ] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setUserMenuOpen(false) }
    if (userMenuOpen) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [userMenuOpen])
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const hasUnread = (counters.notificaciones_sin_leer || 0) > 0

  function submit(e: FormEvent) {
    e.preventDefault()
    if (q.trim()) navigate(`/buscar?q=${encodeURIComponent(q.trim())}`)
  }

  function signOut() {
    logout()
    navigate('/login')
  }

  return (
    <header className="topbar">
      {/* ── Left: brand + nav dropdowns ── */}
      <div className="topbar-left">
        <button
          className="btn secondary small mobile-menu-btn"
          onClick={onMenuClick}
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>

        <NavLink to="/" className="topbar-brand">
          <Gauge size={22} />
          <span>PresuControl</span>
        </NavLink>

        {/* Desktop nav dropdowns */}
        <nav className="topbar-nav">
          {sections.map(section => (
            <NavDropdown key={section.label} section={section} counters={counters} />
          ))}
        </nav>
      </div>

      {/* ── Right: search + notifications + user ── */}
      <div className="topbar-right">
        <form className="topbar-search" onSubmit={submit}>
          <Search size={16} />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar…"
            aria-label="Buscar presupuestos"
          />
          {q && (
            <button type="button" className="search-clear" onClick={() => setQ('')} aria-label="Limpiar">
              <X size={14} />
            </button>
          )}
        </form>

        <button
          className="btn secondary small"
          style={{ position: 'relative' }}
          onClick={() => onNotifClick ? onNotifClick() : navigate('/notificaciones')}
          aria-label="Notificaciones"
        >
          <Bell size={18} />
          {hasUnread && (
            <span className="nav-badge" style={{ position: 'absolute', top: -4, right: -4 }}>
              {counters.notificaciones_sin_leer || 0}
            </span>
          )}
        </button>

        {isAdmin && (
          <button className="btn secondary small" onClick={onActivityClick} aria-label="Actividad" title="Actividad reciente">
            <Activity size={18} />
          </button>
        )}

        <div className="user-menu-container">
          <button
            className="btn secondary small"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label="Menú de usuario"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <span
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--color-primary)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
              }}
            >
              {user?.nombre?.charAt(0) || 'U'}
            </span>
            <ChevronDown size={14} />
          </button>

          {userMenuOpen && (
            <div className="user-dropdown">
              <div className="user-dropdown-info">
                <strong>{user?.nombre}</strong>
                <span>{user?.email}</span>
              </div>
              <hr className="dropdown-divider" />
              <NavLink to="/configuracion" className="dropdown-item" onClick={() => setUserMenuOpen(false)}>
                <Settings size={14} /> Configuración
              </NavLink>
              {isAdmin && (
                <NavLink to="/usuarios" className="dropdown-item" onClick={() => setUserMenuOpen(false)}>
                  <UserCheck size={14} /> Usuarios
                </NavLink>
              )}
              <hr className="dropdown-divider" />
              <button className="dropdown-item" onClick={() => { document.documentElement.classList.toggle('dark'); localStorage.setItem('darkMode', document.documentElement.classList.contains('dark') ? '1' : '0'); setUserMenuOpen(false) }}>
                <Moon size={14} /> Modo oscuro
              </button>
              <hr className="dropdown-divider" />
              <button className="dropdown-item danger" onClick={signOut}>
                <LogOut size={14} /> Salir
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
