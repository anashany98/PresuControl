import { CheckCircle2, KeyRound, RefreshCw, ShieldCheck, ShieldOff, UserX } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { api, fmtDate, type UserAdmin } from '../utils/api'
import { useData } from '../utils/useData'

export function Usuarios() {
  const { data, loading, error, reload } = useData<UserAdmin[]>(() => api.get('/usuarios'), [])
  async function accept(id: number) { await api.post(`/usuarios/${id}/aceptar`, {}); reload() }
  async function deactivate(id: number) { await api.post(`/usuarios/${id}/desactivar`, {}); reload() }
  async function toggleGestion(id: number, value: boolean) { await api.post(`/usuarios/${id}/toggle-gestion`, { puede_gestionar_sistema: value }); reload() }
  async function resetPassword(id: number) {
    const password = window.prompt('Nueva contraseña temporal para este usuario:')
    if (!password) return
    await api.post(`/usuarios/${id}/reset-password`, { password })
    alert('Contraseña cambiada.')
  }
  return <>
    <PageHeader title="Usuarios" subtitle="Registro y aceptación desde el panel. Solo usuarios con gestión del sistema pueden aprobar cuentas y cambiar configuración." actions={<button className="btn secondary" onClick={reload}><RefreshCw size={16}/>Actualizar</button>} />
    {error && <div className="error">{error}</div>}
    {loading ? <div className="card">Cargando usuarios...</div> : <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Email</th><th>Estado</th><th>Gestión sistema</th><th>Aprobación</th><th>Creado</th><th>Acciones</th></tr></thead><tbody>
      {data?.map(u => <tr key={u.id}><td><strong>{u.nombre}</strong></td><td>{u.email}</td><td>{u.activo ? 'Activo' : 'Inactivo'}</td><td>{u.puede_gestionar_sistema ? <span className="badge ok">Sí</span> : <span className="badge state">No</span>}</td><td>{u.aprobado ? `Aprobado${u.aprobado_por ? ` por ${u.aprobado_por}` : ''}` : 'Pendiente'}</td><td>{fmtDate(u.creado_en)}</td><td><div className="toolbar" style={{ margin: 0 }}>
        {!u.aprobado || !u.activo ? <button className="btn secondary small" onClick={() => accept(u.id)}><CheckCircle2 size={14}/>Aceptar</button> : null}
        {u.puede_gestionar_sistema ? <button className="btn secondary small" onClick={() => toggleGestion(u.id, false)}><ShieldOff size={14}/>Quitar gestión</button> : <button className="btn secondary small" onClick={() => toggleGestion(u.id, true)}><ShieldCheck size={14}/>Dar gestión</button>}
        <button className="btn secondary small" onClick={() => resetPassword(u.id)}><KeyRound size={14}/>Reset clave</button>
        {u.activo ? <button className="btn danger small" onClick={() => deactivate(u.id)}><UserX size={14}/>Desactivar</button> : null}
      </div></td></tr>)}
    </tbody></table></div>}
  </>
}
