import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'

export type User = { id: number; nombre: string; email: string; activo: boolean; aprobado: boolean; puede_gestionar_sistema: boolean; creado_en: string }
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
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('presucontrol_token'))
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('presucontrol_user')
    return raw ? JSON.parse(raw) : null
  })
  const [loading, setLoading] = useState(Boolean(token))

  useEffect(() => {
    let alive = true
    async function loadMe() {
      if (!token) { setLoading(false); return }
      try {
        const me = await api.get<User>('/auth/me')
        if (!alive) return
        setUser(me)
        localStorage.setItem('presucontrol_user', JSON.stringify(me))
      } catch {
        if (!alive) return
        localStorage.removeItem('presucontrol_token')
        localStorage.removeItem('presucontrol_user')
        setToken(null); setUser(null)
      } finally { if (alive) setLoading(false) }
    }
    loadMe()
    return () => { alive = false }
  }, [token])

  async function login(email: string, password: string) {
    const res = await api.post<{ access_token: string; user: User }>('/auth/login', { email, password })
    localStorage.setItem('presucontrol_token', res.access_token)
    localStorage.setItem('presucontrol_user', JSON.stringify(res.user))
    setToken(res.access_token); setUser(res.user)
  }

  async function register(nombre: string, email: string, password: string) {
    const res = await api.post<{ access_token?: string; user?: User; detail?: string }>('/auth/register', { nombre, email, password })
    if (!res.access_token || !res.user) throw new Error(res.detail || 'Registro enviado. La cuenta queda pendiente de aceptación.')
    localStorage.setItem('presucontrol_token', res.access_token)
    localStorage.setItem('presucontrol_user', JSON.stringify(res.user))
    setToken(res.access_token); setUser(res.user)
  }

  function logout() {
    localStorage.removeItem('presucontrol_token')
    localStorage.removeItem('presucontrol_user')
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
