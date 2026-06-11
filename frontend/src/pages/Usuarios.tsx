import { useState, useMemo } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, KeyRound, RefreshCw, Search, ShieldCheck, ShieldOff, Trash2, UserPlus, UserX, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '../components/PageHeader'
import { api, fmtDate, type UserAdmin } from '../utils/api'
import { useUsuarios, queryKeys } from '../utils/useQueries'
import { useToast } from '../utils/toast'

const PAGE_SIZE = 10

type ConfirmModal = { type: 'deactivate' | 'reset'; userId: number; userName: string } | null

export function Usuarios() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useUsuarios()
  const reload = () => queryClient.invalidateQueries({ queryKey: queryKeys.usuarios })
  const [search, setSearch] = useState('')
  const [filterRol, setFilterRol] = useState<'all' | 'admin' | 'gestion'>('all')
  const [filterEstado, setFilterEstado] = useState<'all' | 'activo' | 'pendiente' | 'inactivo'>('all')
  const [page, setPage] = useState(1)
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null)
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

  const filtered = useMemo(() => {
    if (!data) return []
    return data.filter(u => {
      const matchSearch = !search ||
        u.nombre.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      const matchRol = filterRol === 'all' ||
        (filterRol === 'admin' && u.rol === 'admin_sistema') ||
        (filterRol === 'gestion' && u.rol === 'gestion')
      const estado = u.aprobado ? (u.activo ? 'activo' : 'inactivo') : 'pendiente'
      const matchEstado = filterEstado === 'all' || filterEstado === estado
      return matchSearch && matchRol && matchEstado
    })
  }, [data, search, filterRol, filterEstado])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function getEstadoBadge(u: UserAdmin) {
    if (!u.aprobado) return <span className="badge warning">Pendiente</span>
    if (!u.activo) return <span className="badge danger">Inactivo</span>
    return <span className="badge success">Activo</span>
  }

  function getRolBadge(u: UserAdmin) {
    return <span className={`badge ${u.rol === 'admin_sistema' ? 'primary' : 'state'}`}>
      {u.rol === 'admin_sistema' ? 'Admin' : 'Gestor'}
    </span>
  }

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
      setConfirmModal(null)
      reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error deactivating user') }
  }

  async function toggleGestion(id: number, value: boolean) {
    try {
      await api.post(`/usuarios/${id}/toggle-gestion`, { puede_gestionar_sistema: value })
      toast.success(value ? 'Admin concedido' : 'Admin revocado')
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
      setResetError('La contrasena debe tener al menos 12 caracteres.')
      return
    }
    if (password !== resetPasswordConfirm.trim()) {
      setResetError('Las contrasenas no coinciden.')
      return
    }
    try {
      await api.post(`/usuarios/${resetUserId}/reset-password`, { password })
      toast.success('Contrasena cambiada')
      closeResetPassword()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error resetting password') }
  }

  async function createUser() {
    setCreateError(null)
    if (!newNombre.trim() || !newEmail.trim() || newPassword.length < 8) {
      setCreateError('Todos los campos son obligatorios. La contrasena debe tener al menos 8 caracteres.')
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
    <PageHeader
      title="Usuarios"
      subtitle="Gestiona cuentas, permisos y acceso al sistema."
      actions={<><button className="btn primary small" onClick={() => { setCreateError(null); setShowCreate(true) }}><UserPlus size={16}/>Crear usuario</button><button className="btn secondary" onClick={reload} aria-label="Actualizar usuarios"><RefreshCw size={16}/>Actualizar</button></>}
    />
    {error && <div className="error">{(error as Error).message}</div>}
    {isLoading ? (
      <div className="card">Cargando usuarios...</div>
    ) : (
      <>
        {/* Search + Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="search-wrap" style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Search size={16} className="search-icon" />
            <input
              className="input"
              style={{ paddingLeft: 36 }}
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <select className="input" style={{ width: 'auto' }} value={filterRol} onChange={e => { setFilterRol(e.target.value as typeof filterRol); setPage(1) }}>
            <option value="all">Todos los roles</option>
            <option value="admin">Admin</option>
            <option value="gestion">Gestor</option>
          </select>
          <select className="input" style={{ width: 'auto' }} value={filterEstado} onChange={e => { setFilterEstado(e.target.value as typeof filterEstado); setPage(1) }}>
            <option value="all">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="pendiente">Pendiente</option>
            <option value="inactivo">Inactivo</option>
          </select>
          <span className="muted" style={{ alignSelf: 'center', fontSize: '0.8125rem' }}>
            {filtered.length} usuario{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Ultimo login</th>
                <th>Presupuestos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  No hay usuarios que coincidan con los filtros
                </td></tr>
              ) : paginated.map(u => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.nombre}</strong>
                    <br/><span className="muted" style={{ fontSize: '0.8125rem' }}>{u.email}</span>
                  </td>
                  <td>{getRolBadge(u)}</td>
                  <td>{getEstadoBadge(u)}</td>
                  <td className="mono">{fmtDate(u.ultimo_login ?? null)}</td>
                  <td>
                    <span className="badge state">{u.presupuestos_count}</span>
                  </td>
                  <td>
                    <div className="toolbar" style={{ margin: 0 }}>
                      {!u.aprobado ? (
                        <button className="btn secondary small" onClick={() => accept(u.id)}>
                          <CheckCircle2 size={14}/>Aprobar
                        </button>
                      ) : null}
                      {u.puede_gestionar_sistema ? (
                        <button className="btn secondary small" onClick={() => toggleGestion(u.id, false)}>
                          <ShieldOff size={14}/>Quitar admin
                        </button>
                      ) : (
                        <button className="btn secondary small" onClick={() => toggleGestion(u.id, true)}>
                          <ShieldCheck size={14}/>Hacer admin
                        </button>
                      )}
                      <button className="btn secondary small" onClick={() => openResetPassword(u.id)}>
                        <KeyRound size={14}/>Reset clave
                      </button>
                      {u.activo ? (
                        <button className="btn danger small" onClick={() => setConfirmModal({ type: 'deactivate', userId: u.id, userName: u.nombre })}>
                          <UserX size={14}/>Desactivar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex gap-2 items-center justify-center mt-4">
            <button className="btn secondary small" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={16}/>Anterior
            </button>
            <span className="muted" style={{ fontSize: '0.875rem' }}>
              Pagina {page} de {totalPages}
            </span>
            <button className="btn secondary small" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              Siguiente<ChevronRight size={16}/>
            </button>
          </div>
        )}
      </>
    )}

    {/* Confirm Deactivate Modal */}
    {confirmModal?.type === 'deactivate' && (
      <div className="modal-backdrop">
        <div className="modal card" style={{ maxWidth: 400 }}>
          <div className="modal-header">
            <h3>Desactivar usuario</h3>
            <button className="btn secondary small" onClick={() => setConfirmModal(null)} aria-label="Cerrar">
              <X size={16}/>
            </button>
          </div>
          <p style={{ margin: '1rem 0', color: 'var(--text)' }}>
            ¿Estas seguro de desactivar a <strong>{confirmModal.userName}</strong>? El usuario no podra iniciar sesion hasta que lo reactives.
          </p>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setConfirmModal(null)}>Cancelar</button>
            <button className="btn danger" onClick={() => deactivate(confirmModal.userId)}>
              <Trash2 size={14}/>Desactivar
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Confirm Reset Modal */}
    {confirmModal?.type === 'reset' && (
      <div className="modal-backdrop">
        <div className="modal card" style={{ maxWidth: 400 }}>
          <div className="modal-header">
            <h3>Resetear contrasena</h3>
            <button className="btn secondary small" onClick={() => setConfirmModal(null)} aria-label="Cerrar">
              <X size={16}/>
            </button>
          </div>
          <p style={{ margin: '1rem 0', color: 'var(--text)' }}>
            ¿Estas seguro de resetear la contrasena de <strong>{confirmModal.userName}</strong>? Se enviara un email con la nueva contrasena.
          </p>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setConfirmModal(null)}>Cancelar</button>
            <button className="btn" onClick={() => { setConfirmModal(null); openResetPassword(confirmModal.userId) }}>
              <KeyRound size={14}/>Resetear
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Reset Password Modal */}
    {resetUserId !== null && (
      <div className="modal-backdrop">
        <div className="modal card">
          <div className="modal-header">
            <h3>Resetear contrasena</h3>
            <button className="btn secondary small" onClick={closeResetPassword} aria-label="Cerrar"><X size={16}/></button>
          </div>
          <div className="form-grid two">
            <div className="field">
              <label>Nueva contrasena temporal</label>
              <input className="input" type="password" value={resetPasswordValue} minLength={12} onChange={e => setResetPasswordValue(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Confirmar contrasena</label>
              <input className="input" type="password" value={resetPasswordConfirm} minLength={12} onChange={e => setResetPasswordConfirm(e.target.value)} />
            </div>
          </div>
          {resetError && <div className="error">{resetError}</div>}
          <div className="modal-actions">
            <button className="btn secondary" onClick={generateTempPassword}>Generar temporal</button>
            <button className="btn secondary" onClick={closeResetPassword}>Cancelar</button>
            <button className="btn" onClick={submitResetPassword}>Cambiar contrasena</button>
          </div>
        </div>
      </div>
    )}

    {/* Create User Modal */}
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
              <input className="input" value={newNombre} onChange={e => setNewNombre(e.target.value)} autoFocus placeholder="Ana Garcia" />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="ana@empresa.com" />
            </div>
            <div className="field">
              <label>Contrasena (min. 8 caracteres)</label>
              <input className="input" type="password" value={newPassword} minLength={8} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div className="field">
              <label>Rol</label>
              <select className="input" value={newRol} onChange={e => setNewRol(e.target.value as 'admin_sistema' | 'gestion')}>
                <option value="gestion">Gestor — solo ve sus presupuestos</option>
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