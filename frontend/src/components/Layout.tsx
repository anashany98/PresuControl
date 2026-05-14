import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, Bell, CalendarDays, CheckSquare, ChevronDown, ClipboardList, ClipboardClock, Euro, FilePlus2, Gauge, LayoutDashboard, LogOut, Search, Settings, ShieldAlert, Table2, UploadCloud, UserCheck } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useAuth } from '../utils/auth'
import { api, euro, type SidebarCounters } from '../utils/api'
import { useData } from '../utils/useData'

const sections = [
  {
    label: 'Mi trabajo',
    links: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/hoy', label: 'Hoy hay que hacer', icon: CheckSquare, counter: 'hoy' },
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
      { to: '/riesgo', label: 'Riesgo de olvido', icon: ShieldAlert, counter: 'riesgo' },
      { to: '/calendario', label: 'Calendario', icon: CalendarDays },
    ],
  },
  {
    label: 'Gestión',
    links: [
      { to: '/informes', label: 'Informes', icon: BarChart3 },
      { to: '/importar', label: 'Importar', icon: UploadCloud },
      { to: '/avisos', label: 'Avisos', icon: Bell },
      { to: '/logs', label: 'Logs', icon: ClipboardList },
      { to: '/notificaciones', label: 'Notificaciones', icon: Bell, counter: 'notificaciones_sin_leer' },
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
  const toggleSection = (label: string) => setCollapsed(c => ({ ...c, [label]: !c[label] }))
  const navigate = useNavigate()
  const counters = useData<SidebarCounters>(() => api.get('/sidebar-counters'), [])
  const { user, logout } = useAuth()
  function submit(e: FormEvent) {
    e.preventDefault()
    if (q.trim()) navigate(`/buscar?q=${encodeURIComponent(q.trim())}`)
  }
  function signOut() { logout(); navigate('/login') }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo"><Gauge size={22} /></div>
          <div><h1>PresuControl</h1><p>Control interno FactuSOL</p></div>
          <button className="btn secondary small nav-collapse-btn" onClick={() => setCollapsed(c => Object.keys(c).length ? {} : { 'Mi trabajo': true, 'Presupuestos': true, 'Seguimiento': true, 'Gestión': true, 'Sistema': true } as Record<string, boolean>)} title="Contraer menú"><ChevronDown size={14}/></button>
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
                  <ChevronDown size={14} className={`nav-chevron${isCollapsed ? ' collapsed' : ''}`} />
                </button>
                {!isCollapsed && visibleLinks.map(({ to, label, icon: Icon, counter }) => {
                  const value = counter ? (counters.data as any)?.[counter] : undefined
                  const counterText = counter === 'dinero_riesgo' && typeof value === 'number' ? euro(value) : value
                  return <NavLink key={to} to={to} end={to === '/'}><span className="nav-label"><Icon size={17} />{label}</span>{counterText ? <span className="nav-counter">{counterText}</span> : null}</NavLink>
                })}
              </div>
            )
          })}
        </nav>
        <div className="sidebar-user">
          <strong>{user?.nombre}</strong>
          <span>{user?.email}</span>
          {user?.puede_gestionar_sistema && <span className="badge" style={{fontSize:'10px'}}>Admin</span>}
          <button className="btn secondary small" onClick={signOut}><LogOut size={14}/>Salir</button>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <form className="search-global" onSubmit={submit}>
            <Search size={18} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nº presupuesto, cliente, obra, proveedor, estado..." />
          </form>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
