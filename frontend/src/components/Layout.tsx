import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, Bell, CalendarDays, CheckSquare, ChevronDown, ClipboardList, ClipboardClock, Euro, FilePlus2, Gauge, LayoutDashboard, LogOut, Menu, Search, Settings, ShieldAlert, Table2, UploadCloud, UserCheck, X } from 'lucide-react'
import { type FormEvent, useState, useEffect } from 'react'
import { useAuth } from '../utils/auth'
import { api, euro, type SidebarCounters } from '../utils/api'
import { useData } from '../utils/useData'

const sections = [
  {
    label: 'Mi trabajo',
    links: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/hoy', label: 'Hoy', icon: CheckSquare, counter: 'hoy' },
      { to: '/mi-mesa', label: 'Mi mesa', icon: ClipboardClock },
    ],
  },
  {
    label: 'Presupuestos',
    links: [
      { to: '/presupuestos', label: 'Todos', icon: Table2 },
      { to: '/nuevo', label: 'Nuevo', icon: FilePlus2 },
      { to: '/kanban', label: 'Kanban', icon: ClipboardList },
    ],
  },
  {
    label: 'Seguimiento',
    links: [
      { to: '/aceptados-sin-pedido', label: 'Aceptados sin pedido', icon: ShieldAlert, counter: 'aceptados_sin_pedido' },
      { to: '/dinero-riesgo', label: 'Dinero en riesgo', icon: Euro, counter: 'dinero_riesgo' },
      { to: '/riesgo', label: 'Riesgo olvido', icon: ShieldAlert, counter: 'riesgo' },
      { to: '/calendario', label: 'Calendario', icon: CalendarDays },
    ],
  },
  {
    label: 'Gestión',
    links: [
      { to: '/informes', label: 'Informes', icon: BarChart3 },
      { to: '/reportes', label: 'Reportes', icon: BarChart3 },
      { to: '/importar', label: 'Importar', icon: UploadCloud },
      { to: '/avisos', label: 'Avisos', icon: Bell },
      { to: '/notificaciones', label: 'Notificaciones', icon: Bell, counter: 'notificaciones_sin_leer' },
      { to: '/logs', label: 'Logs', icon: ClipboardList },
    ],
  },
  {
    label: 'Sistema',
    adminOnly: true,
    links: [
      { to: '/usuarios', label: 'Usuarios', icon: UserCheck, counter: 'usuarios_pendientes' },
      { to: '/configuracion', label: 'Configuración', icon: Settings },
    ],
  },
]

export function Layout() {
  const [q, setQ] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const navigate = useNavigate()
  const counters = useData<SidebarCounters>(() => api.get('/sidebar-counters'), [])
  const { user, logout } = useAuth()

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('.search-global input')?.focus()
      }
      if (e.key === 'n' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        navigate('/nuevo')
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [navigate])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (q.trim()) navigate(`/buscar?q=${encodeURIComponent(q.trim())}`)
    setMobileOpen(false)
  }

  function signOut() {
    logout()
    navigate('/login')
  }

  const allLinks = sections.flatMap(s => s.links)

  return (
    <div className="app-shell">
      {/* Top Bar */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <div className="logo"><Gauge size={20} /></div>
            <span className="brand-name">PresuControl</span>
          </div>
        </div>

        <nav className="topnav">
          {allLinks.slice(0, 6).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `topnav-link${isActive ? ' active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="topbar-right">
          <form className="search-global" onSubmit={submit}>
            <Search size={16} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar..."
              title="Pulsa / para buscar"
            />
            {q && (
              <button type="button" className="search-clear" onClick={() => setQ('')}>
                ×
              </button>
            )}
          </form>

          <NavLink to="/notificaciones" className="topbar-icon-btn" title="Notificaciones">
            <Bell size={18} />
            {counters.data?.notificaciones_sin_leer ? (
              <span className="nav-dot" />
            ) : null}
          </NavLink>

          <div className="user-menu-container">
            <button
              className="user-menu-btn"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
            >
              <span className="user-avatar">{user?.nombre?.charAt(0) || 'U'}</span>
              <ChevronDown size={14} className={userMenuOpen ? 'rotated' : ''} />
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
                {user?.puede_gestionar_sistema && (
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

          <button
            className="mobile-menu-btn"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {mobileOpen && (
        <>
          <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />
          <aside className="mobile-drawer">
            <div className="mobile-drawer-header">
              <div className="brand">
                <div className="logo"><Gauge size={20} /></div>
                <span className="brand-name">PresuControl</span>
              </div>
              <button className="btn secondary small" onClick={() => setMobileOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <nav className="mobile-nav">
              {sections.map(section => {
                const visibleLinks = section.links.filter(l => !section.adminOnly || user?.puede_gestionar_sistema)
                if (visibleLinks.length === 0) return null
                return (
                  <div key={section.label} className="mobile-nav-section">
                    <span className="nav-section-label">{section.label}</span>
                    {visibleLinks.map(({ to, label, icon: Icon, counter }) => {
                      const value = counter ? (counters.data as any)?.[counter] : undefined
                      return (
                        <NavLink
                          key={to}
                          to={to}
                          end={to === '/'}
                          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                          onClick={() => setMobileOpen(false)}
                        >
                          <span className="nav-label">
                            <Icon size={16} />
                            <span>{label}</span>
                          </span>
                          {value ? <span className="nav-counter">{value}</span> : null}
                        </NavLink>
                      )
                    })}
                  </div>
                )
              })}
            </nav>
          </aside>
        </>
      )}

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}