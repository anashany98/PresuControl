import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import './styles.css'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider, useAuth } from './utils/auth'
import { ToastProvider } from './utils/toast'

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
const Hoy = lazy(() => import('./pages/Hoy').then(m => ({ default: m.Hoy })))
const AceptadosSinPedido = lazy(() => import('./pages/AceptadosSinPedido').then(m => ({ default: m.AceptadosSinPedido })))
const DineroRiesgo = lazy(() => import('./pages/DineroRiesgo').then(m => ({ default: m.DineroRiesgo })))
const MiMesa = lazy(() => import('./pages/MiMesa').then(m => ({ default: m.MiMesa })))
const Logs = lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })))
const Usuarios = lazy(() => import('./pages/Usuarios').then(m => ({ default: m.Usuarios })))
const Buscar = lazy(() => import('./pages/Buscar').then(m => ({ default: m.Buscar })))
const PasswordRequest = lazy(() => import('./pages/PasswordReset').then(m => ({ default: m.PasswordRequest })))
const PasswordReset = lazy(() => import('./pages/PasswordReset').then(m => ({ default: m.PasswordReset })))
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

const router = createBrowserRouter([
  { path: '/login', element: <Suspense fallback={<PageLoader />}><Login /></Suspense> },
  { path: '/registro', element: <Suspense fallback={<PageLoader />}><Registro /></Suspense> },
  { path: '/forgot-password', element: <Suspense fallback={<PageLoader />}><PasswordRequest /></Suspense> },
  { path: '/reset-password', element: <Suspense fallback={<PageLoader />}><PasswordReset /></Suspense> },
  { path: '/', element: <ProtectedLayout />, children: [
    { index: true, element: <Suspense fallback={<PageLoader />}><Dashboard /></Suspense> },
    { path: 'hoy', element: <Suspense fallback={<PageLoader />}><Hoy /></Suspense> },
    { path: 'mi-mesa', element: <Suspense fallback={<PageLoader />}><MiMesa /></Suspense> },
    { path: 'aceptados-sin-pedido', element: <Suspense fallback={<PageLoader />}><AceptadosSinPedido /></Suspense> },
    { path: 'dinero-riesgo', element: <Suspense fallback={<PageLoader />}><DineroRiesgo /></Suspense> },
    { path: 'buscar', element: <Suspense fallback={<PageLoader />}><Buscar /></Suspense> },
    { path: 'presupuestos', element: <Suspense fallback={<PageLoader />}><Presupuestos /></Suspense> },
    { path: 'nuevo', element: <Suspense fallback={<PageLoader />}><NuevoPresupuesto /></Suspense> },
    { path: 'presupuestos/:id', element: <Suspense fallback={<PageLoader />}><DetallePresupuesto /></Suspense> },
    { path: 'riesgo', element: <Suspense fallback={<PageLoader />}><Riesgo /></Suspense> },
    { path: 'kanban', element: <Suspense fallback={<PageLoader />}><Kanban /></Suspense> },
    { path: 'calendario', element: <Suspense fallback={<PageLoader />}><Calendario /></Suspense> },
    { path: 'informes', element: <Suspense fallback={<PageLoader />}><Informes /></Suspense> },
    { path: 'reportes', element: <Suspense fallback={<PageLoader />}><Reportes /></Suspense> },
    { path: 'importar', element: <Suspense fallback={<PageLoader />}><Importar /></Suspense> },
    { path: 'avisos', element: <Suspense fallback={<PageLoader />}><Avisos /></Suspense> },
    { path: 'logs', element: <Suspense fallback={<PageLoader />}><Logs /></Suspense> },
    { path: 'notificaciones', element: <Suspense fallback={<PageLoader />}><Notificaciones /></Suspense> },
    { path: 'usuarios', element: <Suspense fallback={<PageLoader />}><Usuarios /></Suspense> },
    { path: 'configuracion', element: <Suspense fallback={<PageLoader />}><Configuracion /></Suspense> },
  ]},
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider><ToastProvider><RouterProvider router={router} /></ToastProvider></AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
