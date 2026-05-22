import { NavLink, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, UserCheck } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { isSystemAdmin, useAuth } from '../utils/auth'

interface Props {
  notifCount: number
  onMenuClick: () => void
}

export function Topbar({ notifCount, onMenuClick }: Props) {
  const [q, setQ] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const isAdmin = isSystemAdmin(user)
  const hasUnread = notifCount > 0

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          className="btn secondary small"
          onClick={onMenuClick}
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>
        <div className="sidebar-brand" style={{ margin: 0, padding: 0, border: 0 }}>
          📊 <span style={{ color: 'var(--color-primary)' }}>PresuControl</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Search */}
        <form className="search-global" onSubmit={submit}>
          <Search size={16} />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar presupuestos…"
            aria-label="Buscar presupuestos"
            title="Pulsa / para buscar"
          />
          {q && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setQ('')}
              aria-label="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </form>

        {/* Notifications */}
        <button
          className="btn secondary small"
          style={{ position: 'relative' }}
          onClick={() => navigate('/notificaciones')}
          aria-label="Notificaciones"
        >
          <Bell size={18} />
          {hasUnread && (
            <span className="nav-badge" style={{ position: 'absolute', top: -4, right: -4 }}>
              {notifCount}
            </span>
          )}
        </button>

        {/* User menu */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn secondary small"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label="Menú de usuario"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <span
              style={{
                width: 28, height: 28,
                borderRadius: '50%',
                background: 'var(--color-primary)',
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
              }}
            >
              {user?.nombre?.charAt(0) || 'U'}
            </span>
            <ChevronDown size={14} style={{ transition: 'transform 0.2s ease' }} />
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
