import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, Bell, CalendarDays, CheckSquare, ChevronDown, ChevronLeft, ClipboardList, ClipboardClock, Euro, FilePlus2, Gauge, LayoutDashboard, LogOut, Menu, Search, Settings, ShieldAlert, Table2, UploadCloud, UserCheck, X } from 'lucide-react'
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const toggleSection = (label: string) => setCollapsed(c => ({ ...c, [label]: !c[label] }))
  const navigate = useNavigate()
  const counters = useData<SidebarCounters>(() => api.get('/sidebar-counters'), [])
  const { user, logout } = useAuth()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (q.trim()) navigate(`/buscar?q=${encodeURIComponent(q.trim())}`)
    setMobileOpen(false)
  }
  function signOut() { logout(); navigate('/login') }
  function closeMobile() { setMobileOpen(false) }

  const sidebarContent = (
    <>
      <div className="brand">
        <div className="brand-left">
          <div className="logo"><Gauge size={20} /></div>
          <span className="brand-name">PresuControl</span>
        </div>
        {isMobile && (
          <button className="btn secondary small" onClick={closeMobile}><X size={18} /></button>
        )}
        {!isMobile && (
          <button className="btn secondary small nav-collapse-btn" onClick={() => setCollapsed(c => Object.keys(c).length ? {} : { 'Mi trabajo': true, 'Presupuestos': true, 'Seguimiento': true, 'Gestión': true, 'Sistema': true } as Record<string, boolean>)} title="Contraer"><ChevronDown size={14} /></button>
        )}
      </div>
      <nav className="nav">
        {sections.map(section => {
          const visibleLinks = section.links.filter(l => !section.adminOnly || user?.puede_gestionar_sistema)
          if (visibleLinks.length === 0) return null
          const isCollapsed = collapsed[section.label]
          return (
            <div key={section.label} className="nav-section">
              <button className="nav-section-header" onClick={() => toggleSection(section.label)}>
                <span className="nav-section-label">{section.label}</span>
                <ChevronDown size={13} className={`nav-chevron${isCollapsed ? ' collapsed' : ''}`} />
              </button>
              {!isCollapsed && visibleLinks.map(({ to, label, icon: Icon, counter }) => {
                const value = counter ? (counters.data as any)?.[counter] : undefined
                const counterText = counter === 'dinero_riesgo' && typeof value === 'number' ? euro(value) : value
                const hasNotificationDot = counter === 'notificaciones_sin_leer' && typeof value === 'number' && value > 0
                return (
                  <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={closeMobile}>
                    <span className="nav-label">
                      <Icon size={16} />
                      <span className="nav-link-label">{label}</span>
                      {hasNotificationDot && <span className="nav-dot" />}
                    </span>
                    {counterText ? <span className="nav-counter">{counterText}</span> : null}
                  </NavLink>
                )
              })}
            </div>
          )
        })}
      </nav>
      <div className="sidebar-user">
        <div className="sidebar-user-info">
          <strong>{user?.nombre}</strong>
          <span>{user?.email}</span>
        </div>
        {user?.puede_gestionar_sistema && <span className="badge admin-badge">Admin</span>}
        <button className="btn secondary small logout-btn" onClick={signOut}><LogOut size={14}/>Salir</button>
      </div>
    </>
  )

  return (
    <div className="app-shell">
      {isMobile && (
        <>
          <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}><Menu size={22} /></button>
          {mobileOpen && <div className="mobile-overlay" onClick={closeMobile} />}
          <aside className="sidebar mobile-sidebar">{sidebarContent}</aside>
        </>
      )}
      {!isMobile && <aside className="sidebar">{sidebarContent}</aside>}
      <main className="main">
        <div className="topbar">
          <form className="search-global" onSubmit={submit}>
            <Search size={18} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nº presupuesto, cliente, obra..." />
          </form>
        </div>
        <Outlet />
      </main>
    </div>
  )
}