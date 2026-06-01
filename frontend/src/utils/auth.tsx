import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { api, clearAuthToken } from './api'

export type UserRole = 'admin_sistema' | 'gestion'
export type User = { id: number; nombre: string; email: string; activo: boolean; aprobado: boolean; puede_gestionar_sistema: boolean; rol: UserRole; creado_en: string }

export function isSystemAdmin(user: User | null | undefined) {
  return Boolean(user && (user.rol === 'admin_sistema' || user.puede_gestionar_sistema))
}
type AuthContextValue = {
  user: User | null
  token: null  // no longer stored in JS; cookie holds it
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (nombre: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function loadMe() {
      try {
        const me = await api.get<User>('/auth/me')
        if (!alive) return
        setUser(me)
      } catch {
        if (!alive) return
        setUser(null)
      } finally { if (alive) setLoading(false) }
    }
    loadMe()
    return () => { alive = false }
  }, [])

  async function login(email: string, password: string) {
    const res = await api.post<{ access_token: string; user: User }>('/auth/login', { email, password })
    setUser(res.user)
  }

  async function register(nombre: string, email: string, password: string) {
    const res = await api.post<{ access_token?: string; user?: User; detail?: string }>('/auth/register', { nombre, email, password })
    if (!res.access_token || !res.user) throw new Error(res.detail || 'Registro enviado. La cuenta queda pendiente de aceptación.')
    setUser(res.user)
  }

  async function logout() {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    clearAuthToken()
    setUser(null)
  }

  const value = useMemo(() => ({ user, token: null, loading, login, register, logout }), [user, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}