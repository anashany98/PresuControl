import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, Bell, CalendarDays, CheckSquare, ChevronDown, ClipboardList, ClipboardClock, Euro, FilePlus2, Gauge, LayoutDashboard, LogOut, Menu, Search, Settings, ShieldAlert, Table2, UploadCloud, UserCheck, X } from 'lucide-react'
import { type FormEvent, useState, useEffect } from 'react'
import { isSystemAdmin, useAuth } from '../utils/auth'
import { api, type SidebarCounters } from '../utils/api'
import { useData } from '../utils/useData'
import { KeyboardShortcutsModal, useKeyboardShortcuts } from './KeyboardShortcuts'

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
    ],
  },
  {
    label: 'Sistema',
    adminOnly: true,
    links: [
      { to: '/usuarios', label: 'Usuarios', icon: UserCheck, counter: 'usuarios_pendientes' },
      { to: '/configuracion', label: 'Configuración', icon: Settings },
      { to: '/logs', label: 'Logs', icon: ClipboardList },
    ],
  },
]

const BOTTOM_TABS = ['/', '/presupuestos', '/kanban', '/calendario', '/hoy']

function SidebarLink({ to, icon: Icon, label, counter, onClick, ...rest }: { to: string; icon: any; label: string; counter?: string | number; onClick?: () => void; [key: string]: any }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} onClick={onClick} {...rest}>
      <Icon size={18} />
      <span>{label}</span>
      {counter != null && counter !== 0 && <span className="nav-badge">{counter}</span>}
    </NavLink>
  )
}

function BottomTab({ to, icon: Icon, label, counter }: { to: string; icon: any; label: string; counter?: string | number }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `bottom-tab${isActive ? ' active' : ''}`} style={{ position: 'relative' }}>
      <Icon size={20} />
      <span>{label}</span>
      {counter != null && counter !== 0 && <span className="nav-badge">{counter}</span>}
    </NavLink>
  )
}

export function Layout() {
  const [q, setQ] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const navigate = useNavigate()
  const counters = useData<SidebarCounters>(() => api.get('/sidebar-counters'), [])
  const { user, logout } = useAuth()
  const { open: kbOpen, setOpen: setKbOpen } = useKeyboardShortcuts()

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '/') { e.preventDefault(); document.querySelector<HTMLInputElement>('.search-global input')?.focus() }
      if (e.key === 'n') { e.preventDefault(); navigate('/nuevo') }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [navigate])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (q.trim()) navigate(`/buscar?q=${encodeURIComponent(q.trim())}`)
    setSidebarOpen(false)
  }

  function signOut() { logout(); navigate('/login') }

  const isAdmin = isSystemAdmin(user)
  const visibleSections = sections.filter(s => !s.adminOnly || isAdmin)
  const notifCount = counters.data?.notificaciones_sin_leer || 0
  const hasUnread = notifCount > 0

  return (
    <div className="app-layout">
      {/* ============ SIDEBAR (desktop) ============ */}
      <aside className={`sidebar${sidebarOpen ? ' mobile-open' : ''}${sidebarCollapsed ? ' collapsed' : ''}`} style={{ position: 'relative' }}>
        <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}>◀</button>
        <div className="sidebar-brand">
          <Gauge size={22} />
          PresuControl
        </div>
        <nav className="sidebar-nav">
          {visibleSections.map(section => (
            <div key={section.label}>
              <div className="sidebar-section-title">{section.label}</div>
              {section.links.map(({ to, label, icon: Icon, counter }) => {
                const value = counter ? (counters.data as any)?.[counter] : undefined
                return <SidebarLink key={to} to={to} icon={Icon} label={label} counter={value} onClick={() => setSidebarOpen(false)} title={label} />
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ============ MOBILE OVERLAY ============ */}
      {sidebarOpen && <div className="mobile-nav-overlay open" onClick={() => setSidebarOpen(false)} />}

      {/* ============ MAIN CONTENT ============ */}
      <div className="main-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* TOPBAR (desktop: hidden, mobile: visible) */}
        <header className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', background: 'var(--panel-strong)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="mobile-menu-btn btn secondary small" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
              <Menu size={20} />
            </button>
            <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Gauge size={20} />
              <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--color-primary)' }}>PresuControl</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <form className="search-global" onSubmit={submit} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '4px 10px', gap: 6, maxWidth: 200 }}>
              <Search size={14} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar..." style={{ border: 0, background: 'transparent', outline: 'none', fontSize: 'var(--text-sm)', width: '100%' }} title="Pulsa / para buscar" aria-label="Buscar presupuestos" />
              {q && <button type="button" onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} aria-label="Limpiar busqueda">&times;</button>}
            </form>
            <div style={{ position: 'relative' }}>
              <button
                className="btn secondary small"
                style={{ position: 'relative' }}
                onClick={() => navigate('/notificaciones')}
                aria-label="Notificaciones"
              >
                <Bell size={18} />
                {hasUnread && <span className="nav-badge" style={{ position: 'absolute', top: -4, right: -4 }}>{notifCount}</span>}
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <button
                className="user-menu-btn btn secondary small"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-label="Menu de usuario"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                  {user?.nombre?.charAt(0) || 'U'}
                </span>
                <ChevronDown size={14} />
              </button>
              {userMenuOpen && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--panel-strong)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow)', minWidth: 200, zIndex: 100, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>{user?.nombre}</strong>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{user?.email}</span>
                  </div>
                  <NavLink to="/configuracion" className="sidebar-link" onClick={() => setUserMenuOpen(false)}><Settings size={14} /> Configuracion</NavLink>
                  {isAdmin && <NavLink to="/usuarios" className="sidebar-link" onClick={() => setUserMenuOpen(false)}><UserCheck size={14} /> Usuarios</NavLink>}
                  <button className="sidebar-link" onClick={signOut} style={{ width: '100%', textAlign: 'left', border: 0, background: 'none', cursor: 'pointer', color: 'var(--danger)', borderTop: '1px solid var(--border)' }}>
                    <LogOut size={14} /> Salir
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main style={{ flex: 1, padding: '24px 0 80px' }}>
          <Outlet />
        </main>
      </div>

      {/* ============ BOTTOM TAB BAR (mobile) ============ */}
      <nav className="bottom-tabs">
        {BOTTOM_TABS.map(to => {
          const link = sections.flatMap(s => s.links).find(l => l.to === to)
          if (!link) return null
          const value = link.counter ? (counters.data as any)?.[link.counter] : undefined
          return <BottomTab key={to} to={to} icon={link.icon} label={link.label} counter={value} />
        })}
      </nav>

      {/* ============ KEYBOARD SHORTCUTS MODAL ============ */}
      <KeyboardShortcutsModal open={kbOpen} onClose={() => setKbOpen(false)} />
    </div>
  )
}
