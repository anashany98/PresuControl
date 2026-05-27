import { Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import {
  BarChart3, Bell, CalendarDays, CheckSquare,
  ClipboardList, Euro, FilePlus2,
  LayoutDashboard, Settings, ShieldAlert,
  Table2, UploadCloud, UserCheck,
} from 'lucide-react'
import { isSystemAdmin, useAuth } from '../utils/auth'
import { api, type SidebarCounters } from '../utils/api'
import { useData } from '../utils/useData'
import { KeyboardShortcutsModal, useKeyboardShortcuts } from './KeyboardShortcuts'
import { NotifPanel } from './NotifPanel'
import { ActivityPanel } from './ActivityPanel'
import { Topbar } from './Topbar'
import { BottomTabs, MobileDrawer } from './MobileNav'
import type { NavSection } from './Sidebar'

// ── Navigation configuration ──
const sections: NavSection[] = [
  {
    label: 'Mi trabajo',
    links: [
      { to: '/',              label: 'Dashboard',    icon: LayoutDashboard },
      { to: '/mi-trabajo',    label: 'Mi trabajo',   icon: CheckSquare,   counter: 'hoy' },
      { to: '/calendario',    label: 'Calendario',   icon: CalendarDays },
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
    label: 'Riesgo',
    links: [
      { to: '/aceptados-sin-pedido', label: 'Sin pedido',  icon: ShieldAlert, counter: 'aceptados_sin_pedido' },
      { to: '/dinero-riesgo',        label: 'Dinero riesgo', icon: Euro,       counter: 'dinero_riesgo' },
      { to: '/riesgo',               label: 'Riesgo olvido', icon: ShieldAlert, counter: 'riesgo' },
    ],
  },
  {
    label: 'Gestión',
    links: [
      { to: '/notificaciones', label: 'Notificaciones', icon: Bell, counter: 'notificaciones_sin_leer' },
    ],
  },
  {
    label: 'Sistema',
    adminOnly: true,
    links: [
      { to: '/informes',       label: 'Informes',       icon: BarChart3 },
      { to: '/importar',       label: 'Importar',       icon: UploadCloud },
      { to: '/avisos',         label: 'Avisos',         icon: Bell },
      { to: '/usuarios',       label: 'Usuarios',       icon: UserCheck,  counter: 'usuarios_pendientes' },
      { to: '/configuracion',  label: 'Configuración',  icon: Settings },
      { to: '/logs',           label: 'Logs',           icon: ClipboardList },
    ],
  },
]

const BOTTOM_TABS = ['/', '/mi-trabajo', '/presupuestos', '/kanban', '/calendario']

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()

  const counters = useData<SidebarCounters>(() => api.get('/sidebar-counters'), [])
  const { user } = useAuth()
  const { open: kbOpen, setOpen: setKbOpen } = useKeyboardShortcuts()

  const isAdmin = isSystemAdmin(user)
  const visibleSections = sections.filter(s => !s.adminOnly || isAdmin)

  const gKeyRef = useRef(false)
  const [notifPanel, setNotifPanel] = useState(false)
  const [activityPanel, setActivityPanel] = useState(false)

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // g + letter shortcuts (vim-style)
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        gKeyRef.current = true
        setTimeout(() => { gKeyRef.current = false }, 500)
        return
      }
      if (gKeyRef.current) {
        e.preventDefault()
        if (e.key === 'd') navigate('/')
        else if (e.key === 'k') navigate('/kanban')
        else if (e.key === 'p') navigate('/presupuestos')
        else if (e.key === 't') navigate('/mi-trabajo')
        gKeyRef.current = false
        return
      }

      // ? to show keyboard shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setKbOpen(true)
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('.topbar-search input')?.focus()
      }
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        navigate('/nuevo')
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [navigate])

  const bottomTabs = BOTTOM_TABS.map(to => {
    const link = visibleSections.flatMap(s => s.links).find(l => l.to === to)
    return link ? { to, icon: link.icon, label: link.label, counter: link.counter } : null
  }).filter(Boolean) as { to: string; icon: import('lucide-react').LucideIcon; label: string; counter?: string }[]

  return (
    <div className="app-layout" style={{ flexDirection: 'column' }}>
      <a href="#main-content" className="skip-link">Saltar al contenido principal</a>
      <Topbar
        sections={visibleSections}
        counters={(counters.data as SidebarCounters) || {}}
        onMenuClick={() => setSidebarOpen(true)}
        onNotifClick={() => setNotifPanel(!notifPanel)}
        isAdmin={isAdmin}
        onActivityClick={() => setActivityPanel(!activityPanel)}
      />

      {/* ── Page Content ── */}
      <main id="main-content" className="main-content" style={{ padding: '20px 24px 80px', flex: 1, width: '100%' }}>
        <Outlet />
      </main>

      {/* ── Mobile Bottom Tabs ── */}
      <BottomTabs
        bottomTabs={bottomTabs}
        counters={counters.data as SidebarCounters || {}}
      />

      {/* ── Mobile Drawer ── */}
      <MobileDrawer
        open={sidebarOpen}
        sections={visibleSections}
        counters={counters.data as SidebarCounters || {}}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ── Keyboard Shortcuts Modal ── */}
      <KeyboardShortcutsModal open={kbOpen} onClose={() => setKbOpen(false)} />

      {/* ── Notifications Slide-over ── */}
      <NotifPanel open={notifPanel} onClose={() => setNotifPanel(false)} />

      {/* ── Activity Panel ── */}
      <ActivityPanel open={activityPanel} onClose={() => setActivityPanel(false)} isAdmin={isAdmin} />
    </div>
  )
}