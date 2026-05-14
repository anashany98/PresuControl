import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import './styles.css'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Presupuestos } from './pages/Presupuestos'
import { NuevoPresupuesto } from './pages/NuevoPresupuesto'
import { DetallePresupuesto } from './pages/DetallePresupuesto'
import { Riesgo } from './pages/Riesgo'
import { Kanban } from './pages/Kanban'
import { Calendario } from './pages/Calendario'
import { Informes } from './pages/Informes'
import { Importar } from './pages/Importar'
import { Configuracion } from './pages/Configuracion'
import { Avisos } from './pages/Avisos'
import { Login } from './pages/Login'
import { Registro } from './pages/Registro'
import { Hoy } from './pages/Hoy'
import { AceptadosSinPedido } from './pages/AceptadosSinPedido'
import { DineroRiesgo } from './pages/DineroRiesgo'
import { MiMesa } from './pages/MiMesa'
import { Logs } from './pages/Logs'
import { Usuarios } from './pages/Usuarios'
import { Buscar } from './pages/Buscar'
import { PasswordRequest, PasswordReset } from './pages/PasswordReset'
import { Notificaciones } from './pages/Notificaciones'
import { AuthProvider, useAuth } from './utils/auth'

function ProtectedLayout() {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-page"><div className="card">Cargando sesión...</div></div>
  if (!user) return <Navigate to="/login" replace />
  return <Layout />
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/registro', element: <Registro /> },
  { path: '/forgot-password', element: <PasswordRequest /> },
  { path: '/reset-password', element: <PasswordReset /> },
  { path: '/', element: <ProtectedLayout />, children: [
    { index: true, element: <Dashboard /> },
    { path: 'hoy', element: <Hoy /> },
    { path: 'mi-mesa', element: <MiMesa /> },
    { path: 'aceptados-sin-pedido', element: <AceptadosSinPedido /> },
    { path: 'dinero-riesgo', element: <DineroRiesgo /> },
    { path: 'buscar', element: <Buscar /> },
    { path: 'presupuestos', element: <Presupuestos /> },
    { path: 'nuevo', element: <NuevoPresupuesto /> },
    { path: 'presupuestos/:id', element: <DetallePresupuesto /> },
    { path: 'riesgo', element: <Riesgo /> },
    { path: 'kanban', element: <Kanban /> },
    { path: 'calendario', element: <Calendario /> },
    { path: 'informes', element: <Informes /> },
    { path: 'importar', element: <Importar /> },
    { path: 'avisos', element: <Avisos /> },
    { path: 'logs', element: <Logs /> },
    { path: 'notificaciones', element: <Notificaciones /> },
    { path: 'usuarios', element: <Usuarios /> },
    { path: 'configuracion', element: <Configuracion /> },
  ]},
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider><RouterProvider router={router} /></AuthProvider>
  </React.StrictMode>
)
