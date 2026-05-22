import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { AUTH_TOKEN_KEY, api, clearAuthToken, storeAuthToken } from './api'

export type UserRole = 'admin_sistema' | 'gestion'
export type User = { id: number; nombre: string; email: string; activo: boolean; aprobado: boolean; puede_gestionar_sistema: boolean; rol: UserRole; creado_en: string }

export function isSystemAdmin(user: User | null | undefined) {
  return Boolean(user && (user.rol === 'admin_sistema' || user.puede_gestionar_sistema))
}
type AuthContextValue = {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (nombre: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(AUTH_TOKEN_KEY))
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(token))

  useEffect(() => {
    let alive = true
    async function loadMe() {
      if (!token) { setLoading(false); return }
      try {
        const me = await api.get<User>('/auth/me')
        if (!alive) return
        setUser(me)
      } catch {
        if (!alive) return
        clearAuthToken()
        setToken(null); setUser(null)
      } finally { if (alive) setLoading(false) }
    }
    loadMe()
    return () => { alive = false }
  }, [token])

  async function login(email: string, password: string) {
    const res = await api.post<{ access_token: string; user: User }>('/auth/login', { email, password })
    storeAuthToken(res.access_token)
    setToken(res.access_token); setUser(res.user)
  }

  async function register(nombre: string, email: string, password: string) {
    const res = await api.post<{ access_token?: string; user?: User; detail?: string }>('/auth/register', { nombre, email, password })
    if (!res.access_token || !res.user) throw new Error(res.detail || 'Registro enviado. La cuenta queda pendiente de aceptación.')
    storeAuthToken(res.access_token)
    setToken(res.access_token); setUser(res.user)
  }

  function logout() {
    clearAuthToken()
    setToken(null); setUser(null)
  }

  const value = useMemo(() => ({ user, token, loading, login, register, logout }), [user, token, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
