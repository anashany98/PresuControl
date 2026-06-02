import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, UserPlus } from 'lucide-react'
import { AuthShell } from './Login'
import { useAuth } from '../utils/auth'
import { registerSchema, type RegisterFormData } from '../utils/formSchemas'

export function Registro() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const {
    register: regField,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { nombre: '', email: '', password: '', password_confirm: '' },
  })

  if (user) return <Navigate to="/" replace />

  async function onSubmit(data: RegisterFormData) {
    try {
      await register(data.nombre, data.email, data.password)
      navigate('/')
    } catch (err) {
      setError('root', { message: err instanceof Error ? err.message : String(err) })
    }
  }

  return <AuthShell title="Crear registro" subtitle="Todos los usuarios tienen el mismo acceso. Sin roles ni permisos por usuario en esta versión.">
    <form onSubmit={handleSubmit(onSubmit)} className="auth-form" noValidate>
      {errors.root && <div className="error">{errors.root.message}</div>}
      <label>
        Nombre
        <input className="input" autoComplete="name" {...regField('nombre')} />
        {errors.nombre && <span className="field-error">{errors.nombre.message}</span>}
      </label>
      <label>
        Email
        <input className="input" type="email" autoComplete="email" {...regField('email')} />
        {errors.email && <span className="field-error">{errors.email.message}</span>}
      </label>
      <label>
        Contraseña
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          {...regField('password')}
        />
        {errors.password && <span className="field-error">{errors.password.message}</span>}
      </label>
      <label>
        Repetir contraseña
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          {...regField('password_confirm')}
        />
        {errors.password_confirm && <span className="field-error">{errors.password_confirm.message}</span>}
      </label>
      <button className="btn" type="submit" disabled={isSubmitting}>
        {isSubmitting
          ? <><Loader2 size={16} className="spin" /> Creando...</>
          : <><UserPlus size={16} /> Crear cuenta</>}
      </button>
      <p className="muted">¿Ya tienes cuenta? <Link to="/login"><strong>Entrar</strong></Link></p>
    </form>
  </AuthShell>
}
