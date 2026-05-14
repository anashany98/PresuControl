import { type FormEvent, type ReactNode, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Gauge } from 'lucide-react'
import { useAuth } from '../utils/auth'

export function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (user) return <Navigate to="/" replace />
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null)
    try { await login(email, password); navigate('/') }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  return <AuthShell title="Entrar en PresuControl" subtitle="Control interno de presupuestos aceptados y pedidos proveedor.">
    <form onSubmit={submit} className="auth-form">
      {error && <div className="error">{error}</div>}
      <label>Email<input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Contraseña<input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button className="btn" type="submit">Entrar</button>
      <p className="muted">¿No tienes cuenta? <Link to="/registro"><strong>Crear registro</strong></Link></p>
      <p className="muted"><Link to="/forgot-password"><strong>He olvidado mi contraseña</strong></Link></p>
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
