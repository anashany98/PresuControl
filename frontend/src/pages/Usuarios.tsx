import { useState } from 'react'
import { CheckCircle2, KeyRound, RefreshCw, ShieldCheck, ShieldOff, UserPlus, UserX, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { api, fmtDate, type UserAdmin } from '../utils/api'
import { useData } from '../utils/useData'
import { useToast } from '../utils/toast'

export function Usuarios() {
  const toast = useToast()
  const { data, loading, error, reload } = useData<UserAdmin[]>(() => api.get('/usuarios'), [])
  const [resetUserId, setResetUserId] = useState<number | null>(null)
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newNombre, setNewNombre] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRol, setNewRol] = useState<'admin_sistema' | 'gestion'>('gestion')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  async function accept(id: number) {
    try {
      await api.post(`/usuarios/${id}/aceptar`, {})
      toast.success('Usuario aprobado')
      reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error approving user') }
  }
  async function deactivate(id: number) {
    try {
      await api.post(`/usuarios/${id}/desactivar`, {})
      toast.success('Usuario desactivado')
      reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error deactivating user') }
  }
  async function toggleGestion(id: number, value: boolean) {
    try {
      await api.post(`/usuarios/${id}/toggle-gestion`, { puede_gestionar_sistema: value })
      toast.success(value ? 'Gestión concedida' : 'Gestión revocada')
      reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error toggling gestion') }
  }
  function openResetPassword(id: number) {
    setResetUserId(id)
    setResetPasswordValue('')
    setResetPasswordConfirm('')
    setResetError(null)
  }
  function closeResetPassword() {
    setResetUserId(null)
    setResetPasswordValue('')
    setResetPasswordConfirm('')
    setResetError(null)
  }
  function generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*'
    const bytes = new Uint32Array(16)
    window.crypto.getRandomValues(bytes)
    const password = Array.from(bytes, byte => chars[byte % chars.length]).join('')
    setResetPasswordValue(password)
    setResetPasswordConfirm(password)
    setResetError(null)
  }
  async function submitResetPassword() {
    if (resetUserId == null) return
    const password = resetPasswordValue.trim()
    if (password.length < 12) {
      setResetError('La contraseña debe tener al menos 12 caracteres.')
      return
    }
    if (password !== resetPasswordConfirm.trim()) {
      setResetError('Las contraseñas no coinciden.')
      return
    }
    try {
      await api.post(`/usuarios/${resetUserId}/reset-password`, { password })
      toast.success('Contraseña cambiada')
      closeResetPassword()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error resetting password') }
  }
  async function createUser() {
    setCreateError(null)
    if (!newNombre.trim() || !newEmail.trim() || newPassword.length < 8) {
      setCreateError('Todos los campos son obligatorios. La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setCreating(true)
    try {
      await api.post('/usuarios', { nombre: newNombre.trim(), email: newEmail.trim(), password: newPassword, rol: newRol })
      toast.success('Usuario creado correctamente')
      setShowCreate(false)
      setNewNombre('')
      setNewEmail('')
      setNewPassword('')
      setNewRol('gestion')
      reload()
    } catch (e) { setCreateError(e instanceof Error ? e.message : 'Error al crear usuario') }
    finally { setCreating(false) }
  }
  return <>
    <PageHeader title="Usuarios" subtitle="Registro y aceptación desde el panel. Solo usuarios con gestión del sistema pueden aprobar cuentas y cambiar configuración." actions={<><button className="btn primary small" onClick={() => { setCreateError(null); setShowCreate(true) }}><UserPlus size={16}/>Crear usuario</button><button className="btn secondary" onClick={reload} aria-label="Actualizar usuarios"><RefreshCw size={16}/>Actualizar</button></>} />
    {error && <div className="error">{error}</div>}
    {loading ? <div className="card">Cargando usuarios...</div> : <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Gestión sistema</th><th>Aprobación</th><th>Creado</th><th>Acciones</th></tr></thead><tbody>
      {data?.map(u => <tr key={u.id}><td><strong>{u.nombre}</strong></td><td>{u.email}</td><td><span className={`badge ${u.rol === 'admin_sistema' ? 'ok' : 'state'}`}>{u.rol === 'admin_sistema' ? 'Admin' : 'Gestión'}</span></td><td>{u.activo ? 'Activo' : 'Inactivo'}</td><td>{u.puede_gestionar_sistema ? <span className="badge ok">Sí</span> : <span className="badge state">No</span>}</td><td>{u.aprobado ? `Aprobado${u.aprobado_por ? ` por ${u.aprobado_por}` : ''}` : 'Pendiente'}</td><td>{fmtDate(u.creado_en)}</td><td><div className="toolbar" style={{ margin: 0 }}>
        {!u.aprobado || !u.activo ? <button className="btn secondary small" onClick={() => accept(u.id)}><CheckCircle2 size={14}/>Aceptar</button> : null}
        {u.puede_gestionar_sistema ? <button className="btn secondary small" onClick={() => toggleGestion(u.id, false)}><ShieldOff size={14}/>Quitar gestión</button> : <button className="btn secondary small" onClick={() => toggleGestion(u.id, true)}><ShieldCheck size={14}/>Dar gestión</button>}
        <button className="btn secondary small" onClick={() => openResetPassword(u.id)}><KeyRound size={14}/>Reset clave</button>
        {u.activo ? <button className="btn danger small" onClick={() => deactivate(u.id)}><UserX size={14}/>Desactivar</button> : null}
      </div></td></tr>)}
    </tbody></table></div>}
    {resetUserId !== null && (
      <div className="modal-backdrop">
        <div className="modal card">
          <div className="modal-header">
            <h3>Resetear contraseña</h3>
            <button className="btn secondary small" onClick={closeResetPassword} aria-label="Cerrar"><X size={16}/></button>
          </div>
          <div className="form-grid two">
            <div className="field">
              <label>Nueva contraseña temporal</label>
              <input className="input" type="password" value={resetPasswordValue} minLength={12} onChange={e => setResetPasswordValue(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Confirmar contraseña</label>
              <input className="input" type="password" value={resetPasswordConfirm} minLength={12} onChange={e => setResetPasswordConfirm(e.target.value)} />
            </div>
          </div>
          {resetError && <div className="error">{resetError}</div>}
          <div className="modal-actions">
            <button className="btn secondary" onClick={generateTempPassword}>Generar temporal</button>
            <button className="btn secondary" onClick={closeResetPassword}>Cancelar</button>
            <button className="btn" onClick={submitResetPassword}>Cambiar contraseña</button>
          </div>
        </div>
      </div>
    )}
    {showCreate && (
      <div className="modal-backdrop">
        <div className="modal card">
          <div className="modal-header">
            <h3>Crear usuario</h3>
            <button className="btn secondary small" onClick={() => setShowCreate(false)} aria-label="Cerrar"><X size={16}/></button>
          </div>
          <div className="form-grid two">
            <div className="field">
              <label>Nombre</label>
              <input className="input" value={newNombre} onChange={e => setNewNombre(e.target.value)} autoFocus placeholder="Ana García" />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="ana@empresa.com" />
            </div>
            <div className="field">
              <label>Contraseña (mín. 8 caracteres)</label>
              <input className="input" type="password" value={newPassword} minLength={8} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div className="field">
              <label>Rol</label>
              <select className="input" value={newRol} onChange={e => setNewRol(e.target.value as 'admin_sistema' | 'gestion')}>
                <option value="gestion">Gestión — solo ve sus presupuestos</option>
                <option value="admin_sistema">Admin sistema — ve todo</option>
              </select>
            </div>
          </div>
          {createError && <div className="error">{createError}</div>}
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
            <button className="btn" disabled={creating} onClick={createUser}>{creating ? 'Creando...' : 'Crear usuario'}</button>
          </div>
        </div>
      </div>
    )}
  </>
}
