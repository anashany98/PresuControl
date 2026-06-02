import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import './styles.css'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider, isSystemAdmin, useAuth } from './utils/auth'
import { ToastProvider } from './utils/toast'
import { queryClient } from './utils/queryClient'

// Init dark mode
if (localStorage.getItem('darkMode') === '1') {
  document.documentElement.classList.add('dark')
}

// Lazy-loaded pages for code splitting (named exports → thenable wrapper)
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Presupuestos = lazy(() => import('./pages/Presupuestos').then(m => ({ default: m.Presupuestos })))
const NuevoPresupuesto = lazy(() => import('./pages/NuevoPresupuesto').then(m => ({ default: m.NuevoPresupuesto })))
const DetallePresupuesto = lazy(() => import('./pages/DetallePresupuesto').then(m => ({ default: m.DetallePresupuesto })))
const Riesgo = lazy(() => import('./pages/Riesgo').then(m => ({ default: m.Riesgo })))
const Kanban = lazy(() => import('./pages/Kanban').then(m => ({ default: m.Kanban })))
const Calendario = lazy(() => import('./pages/Calendario').then(m => ({ default: m.Calendario })))
const Informes = lazy(() => import('./pages/Informes').then(m => ({ default: m.Informes })))
const Reportes = lazy(() => import('./pages/Reportes').then(m => ({ default: m.Reportes })))
const Importar = lazy(() => import('./pages/Importar').then(m => ({ default: m.Importar })))
const Configuracion = lazy(() => import('./pages/Configuracion').then(m => ({ default: m.Configuracion })))
const Avisos = lazy(() => import('./pages/Avisos').then(m => ({ default: m.Avisos })))
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })))
const Registro = lazy(() => import('./pages/Registro').then(m => ({ default: m.Registro })))
const AceptadosSinPedido = lazy(() => import('./pages/AceptadosSinPedido').then(m => ({ default: m.AceptadosSinPedido })))
const DineroRiesgo = lazy(() => import('./pages/DineroRiesgo').then(m => ({ default: m.DineroRiesgo })))
const MiTrabajo = lazy(() => import('./pages/MiTrabajo').then(m => ({ default: m.MiTrabajo })))
const Logs = lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })))
const Usuarios = lazy(() => import('./pages/Usuarios').then(m => ({ default: m.Usuarios })))
const Buscar = lazy(() => import('./pages/Buscar').then(m => ({ default: m.Buscar })))
const Notificaciones = lazy(() => import('./pages/Notificaciones').then(m => ({ default: m.Notificaciones })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  )
}

function ProtectedLayout() {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-page"><div className="card">Cargando sesión...</div></div>
  if (!user) return <Navigate to="/login" replace />
  return <Layout />
}

function RequireRole({ allowed, children }: { allowed: Array<'admin_sistema' | 'gestion'>; children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-page"><div className="card">Cargando sesi?n...</div></div>
  if (!user) return <Navigate to="/login" replace />
  const role = isSystemAdmin(user) ? 'admin_sistema' : 'gestion'
  if (!allowed.includes(role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function HomeRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={isSystemAdmin(user) ? '/dashboard' : '/mi-trabajo'} replace />
}

const router = createBrowserRouter([
  { path: '/login', element: <Suspense fallback={<PageLoader />}><Login /></Suspense> },
  { path: '/registro', element: <Suspense fallback={<PageLoader />}><Registro /></Suspense> },
  { path: '/', element: <ProtectedLayout />, children: [
    { index: true, element: <Suspense fallback={<PageLoader />}><HomeRedirect /></Suspense> },
    { path: 'dashboard', element: <Suspense fallback={<PageLoader />}><Dashboard /></Suspense> },
    { path: 'hoy', element: <Suspense fallback={<PageLoader />}><MiTrabajo /></Suspense> },
    { path: 'mi-mesa', element: <Suspense fallback={<PageLoader />}><MiTrabajo /></Suspense> },
    { path: 'mi-trabajo', element: <Suspense fallback={<PageLoader />}><MiTrabajo /></Suspense> },
    { path: 'aceptados-sin-pedido', element: <Suspense fallback={<PageLoader />}><AceptadosSinPedido /></Suspense> },
    { path: 'dinero-riesgo', element: <Suspense fallback={<PageLoader />}><DineroRiesgo /></Suspense> },
    { path: 'buscar', element: <Suspense fallback={<PageLoader />}><Buscar /></Suspense> },
    { path: 'presupuestos', element: <Suspense fallback={<PageLoader />}><Presupuestos /></Suspense> },
    { path: 'nuevo', element: <Suspense fallback={<PageLoader />}><NuevoPresupuesto /></Suspense> },
    { path: 'presupuestos/:id', element: <Suspense fallback={<PageLoader />}><DetallePresupuesto /></Suspense> },
    { path: 'riesgo', element: <Suspense fallback={<PageLoader />}><Riesgo /></Suspense> },
    { path: 'kanban', element: <Suspense fallback={<PageLoader />}><Kanban /></Suspense> },
    { path: 'calendario', element: <Suspense fallback={<PageLoader />}><Calendario /></Suspense> },
    { path: 'informes', element: <RequireRole allowed={['admin_sistema']}><Suspense fallback={<PageLoader />}><Informes /></Suspense></RequireRole> },
    { path: 'reportes', element: <RequireRole allowed={['admin_sistema']}><Suspense fallback={<PageLoader />}><Reportes /></Suspense></RequireRole> },
    { path: 'importar', element: <RequireRole allowed={['admin_sistema']}><Suspense fallback={<PageLoader />}><Importar /></Suspense></RequireRole> },
    { path: 'avisos', element: <RequireRole allowed={['admin_sistema']}><Suspense fallback={<PageLoader />}><Avisos /></Suspense></RequireRole> },
    { path: 'logs', element: <RequireRole allowed={['admin_sistema']}><Suspense fallback={<PageLoader />}><Logs /></Suspense></RequireRole> },
    { path: 'notificaciones', element: <Suspense fallback={<PageLoader />}><Notificaciones /></Suspense> },
    { path: 'usuarios', element: <RequireRole allowed={['admin_sistema']}><Suspense fallback={<PageLoader />}><Usuarios /></Suspense></RequireRole> },
    { path: 'configuracion', element: <RequireRole allowed={['admin_sistema']}><Suspense fallback={<PageLoader />}><Configuracion /></Suspense></RequireRole> },
    { path: '*', element: <Navigate to="/" replace /> },
  ]},
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider><ToastProvider><RouterProvider router={router} /></ToastProvider></AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
