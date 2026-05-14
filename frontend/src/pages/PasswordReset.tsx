import { type FormEvent, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthShell } from './Login'
import { api } from '../utils/api'

export function PasswordRequest() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setMessage(null)
    try { const res = await api.post<{ message: string }>('/auth/password/request', { email }); setMessage(res.message || 'Solicitud enviada.') }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  return <AuthShell title="Recuperar contraseña" subtitle="Recibirás un enlace de recuperación si tu cuenta existe y está aprobada.">
    <form className="auth-form" onSubmit={submit}>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      <label>Email<input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <button className="btn" type="submit">Enviar enlace</button>
      <p className="muted"><Link to="/login"><strong>Volver al login</strong></Link></p>
    </form>
  </AuthShell>
}

export function PasswordReset() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setMessage(null)
    try { await api.post('/auth/password/reset', { token, password }); setMessage('Contraseña actualizada. Ya puedes entrar.') }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  return <AuthShell title="Cambiar contraseña" subtitle="Introduce una nueva contraseña para tu cuenta.">
    <form className="auth-form" onSubmit={submit}>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      {!token && <div className="error">Falta token de recuperación.</div>}
      <label>Nueva contraseña<input className="input" type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button className="btn" type="submit" disabled={!token}>Cambiar contraseña</button>
      <p className="muted"><Link to="/login"><strong>Volver al login</strong></Link></p>
    </form>
  </AuthShell>
}
