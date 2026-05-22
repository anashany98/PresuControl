import { Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  BarChart3, Bell, CalendarDays, CheckSquare,
  ClipboardClock, ClipboardList, Euro, FilePlus2,
  Gauge, LayoutDashboard, Settings, ShieldAlert,
  Table2, UploadCloud, UserCheck,
} from 'lucide-react'
import { isSystemAdmin, useAuth } from '../utils/auth'
import { api, type SidebarCounters } from '../utils/api'
import { useData } from '../utils/useData'
import { KeyboardShortcutsModal, useKeyboardShortcuts } from './KeyboardShortcuts'
import { Sidebar, type NavSection } from './Sidebar'
import { Topbar } from './Topbar'
import { BottomTabs, MobileDrawer } from './MobileNav'

// ── Navigation configuration ──
const sections: NavSection[] = [
  {
    label: 'Mi trabajo',
    links: [
      { to: '/',           label: 'Dashboard',    icon: LayoutDashboard },
      { to: '/hoy',        label: 'Hoy',           icon: CheckSquare,   counter: 'hoy' },
      { to: '/mi-mesa',    label: 'Mi mesa',       icon: ClipboardClock },
    ],
  },
  {
    label: 'Presupuestos',
    links: [
      { to: '/presupuestos', label: 'Todos',  icon: Table2 },
      { to: '/nuevo',        label: 'Nuevo',  icon: FilePlus2 },
      { to: '/kanban',       label: 'Kanban', icon: ClipboardList },
    ],
  },
  {
    label: 'Seguimiento',
    links: [
      { to: '/aceptados-sin-pedido', label: 'Aceptados sin pedido', icon: ShieldAlert,  counter: 'aceptados_sin_pedido' },
      { to: '/dinero-riesgo',        label: 'Dinero en riesgo',     icon: Euro,         counter: 'dinero_riesgo' },
      { to: '/riesgo',               label: 'Riesgo olvido',       icon: ShieldAlert,  counter: 'riesgo' },
      { to: '/calendario',           label: 'Calendario',          icon: CalendarDays },
    ],
  },
  {
    label: 'Gestión',
    links: [
      { to: '/informes',       label: 'Informes',       icon: BarChart3 },
      { to: '/reportes',       label: 'Reportes',       icon: BarChart3 },
      { to: '/importar',       label: 'Importar',       icon: UploadCloud },
      { to: '/avisos',         label: 'Avisos',         icon: Bell },
      { to: '/notificaciones', label: 'Notificaciones', icon: Bell, counter: 'notificaciones_sin_leer' },
    ],
  },
  {
    label: 'Sistema',
    adminOnly: true,
    links: [
      { to: '/usuarios',       label: 'Usuarios',       icon: UserCheck,  counter: 'usuarios_pendientes' },
      { to: '/configuracion',  label: 'Configuración',  icon: Settings },
      { to: '/logs',           label: 'Logs',           icon: ClipboardList },
    ],
  },
]

const BOTTOM_TABS = ['/', '/presupuestos', '/kanban', '/calendario', '/hoy']

export function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    return stored === 'true'
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()

  const counters = useData<SidebarCounters>(() => api.get('/sidebar-counters'), [])
  const { user } = useAuth()
  const { open: kbOpen, setOpen: setKbOpen } = useKeyboardShortcuts()

  const isAdmin = isSystemAdmin(user)
  const visibleSections = sections.filter(s => !s.adminOnly || isAdmin)
  const notifCount = counters.data?.notificaciones_sin_leer || 0

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('.search-global input')?.focus()
      }
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        navigate('/nuevo')
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [navigate])

  // Build bottom tab links from config
  const bottomTabs = BOTTOM_TABS.map(to => {
    const link = visibleSections.flatMap(s => s.links).find(l => l.to === to)
    return link ? { to, icon: link.icon, label: link.label, counter: link.counter } : null
  }).filter(Boolean) as { to: string; icon: any; label: string; counter?: string }[]

  return (
    <div className="app-layout">
      {/* ── Desktop Sidebar ── */}
      <Sidebar
        sections={visibleSections}
        counters={(counters.data as any) || {}}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLinkClick={() => setSidebarOpen(false)}
      />

      {/* ── Main Content Area ── */}
      <div className="main-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Topbar
          notifCount={notifCount}
          onMenuClick={() => setSidebarOpen(true)}
        />

        {/* ── Page Content ── */}
        <main style={{ flex: 1, padding: '24px 0 80px' }}>
          <Outlet />
        </main>
      </div>

      {/* ── Mobile Bottom Tabs ── */}
      <BottomTabs
        bottomTabs={bottomTabs}
        counters={(counters.data as any) || {}}
      />

      {/* ── Mobile Drawer ── */}
      <MobileDrawer
        open={sidebarOpen}
        sections={visibleSections}
        counters={(counters.data as any) || {}}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ── Keyboard Shortcuts Modal ── */}
      <KeyboardShortcutsModal open={kbOpen} onClose={() => setKbOpen(false)} />
    </div>
  )
}
