import { type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Gauge, Loader2, LogIn } from 'lucide-react'
import { isSystemAdmin, useAuth } from '../utils/auth'
import { loginSchema, type LoginFormData } from '../utils/formSchemas'

export function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (user) return <Navigate to={isSystemAdmin(user) ? '/' : '/mi-trabajo'} replace />

  async function onSubmit(data: LoginFormData) {
    try {
      await login(data.email, data.password)
      navigate('/')
    } catch (err) {
      setError('root', { message: err instanceof Error ? err.message : String(err) })
    }
  }

  return <AuthShell title="Entrar en PresuControl" subtitle="Control interno de presupuestos aceptados y pedidos proveedor.">
    <form onSubmit={handleSubmit(onSubmit)} className="auth-form" noValidate>
      {errors.root && <div className="error">{errors.root.message}</div>}
      <label>
        Email
        <input
          className="input"
          type="email"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && <span className="field-error">{errors.email.message}</span>}
      </label>
      <label>
        Contraseña
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          aria-label="Contraseña"
          {...register('password')}
        />
        {errors.password && <span className="field-error">{errors.password.message}</span>}
      </label>
      <button className="btn" type="submit" disabled={isSubmitting}>
        {isSubmitting
          ? <><Loader2 size={16} className="spin" /> Entrando...</>
          : <><LogIn size={16} /> Entrar</>}
      </button>
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
