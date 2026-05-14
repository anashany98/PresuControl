import { type FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AuthShell } from './Login'
import { useAuth } from '../utils/auth'

export function Registro() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (user) return <Navigate to="/" replace />
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null)
    try { await register(nombre, email, password); navigate('/') }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  return <AuthShell title="Crear registro" subtitle="Todos los usuarios tienen el mismo acceso. Sin roles ni permisos por usuario en esta versión.">
    <form onSubmit={submit} className="auth-form">
      {error && <div className="error">{error}</div>}
      <label>Nombre<input className="input" value={nombre} onChange={e => setNombre(e.target.value)} required /></label>
      <label>Email<input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Contraseña<input className="input" type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button className="btn" type="submit">Crear cuenta</button>
      <p className="muted">¿Ya tienes cuenta? <Link to="/login"><strong>Entrar</strong></Link></p>
    </form>
  </AuthShell>
}
