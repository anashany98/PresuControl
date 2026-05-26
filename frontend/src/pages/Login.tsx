import { type FormEvent, type ReactNode, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Gauge, Loader2, LogIn } from 'lucide-react'
import { isSystemAdmin, useAuth } from '../utils/auth'

export function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  if (user) return <Navigate to={isSystemAdmin(user) ? '/' : '/mi-trabajo'} replace />
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setLoading(true)
    try { await login(email, password); navigate('/') }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setLoading(false) }
  }
  return <AuthShell title="Entrar en PresuControl" subtitle="Control interno de presupuestos aceptados y pedidos proveedor.">
    <form onSubmit={submit} className="auth-form">
      {error && <div className="error">{error}</div>}
      <label>Email<input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Contraseña<input className="input" type={showPw ? "text" : "password"} aria-label="Contraseña" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button className="btn" type="submit" disabled={loading}>{loading ? <><Loader2 size={16} className="spin" /> Entrando...</> : <><LogIn size={16} /> Entrar</>}</button>
      <p className="muted">¿No tienes cuenta? <Link to="/registro"><strong>Crear registro</strong></Link></p>
    </form>
  </AuthShell>
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="auth-page">
    <div className="auth-card">
      <div className="brand auth-brand"><div className="logo"><Gauge size={22}/></div><div><h1>PresuControl</h1><p>FactuSOL · Control interno</p></div></div>
      <h2>{title}</h2><p className="muted">{subtitle}</p>{children}
    </div>
  </div>
}
