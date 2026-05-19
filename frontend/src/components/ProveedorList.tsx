import { useState, useEffect } from 'react'
import { api, euro, fmtDate, type PresupuestoProveedor, type Proveedor } from '../utils/api'
import { useToast } from '../utils/toast'
import { Plus, Trash2, Pencil, X } from 'lucide-react'

const ESTADO_OPCIONES = [
  { value: 'contactado', label: 'Contactado' },
  { value: 'cotizacion_recibida', label: 'Cotización recibida' },
  { value: 'descartado', label: 'Descartado' },
]

export function ProveedorList({ presupuestoId, presupuestoImporte }: { presupuestoId: number; presupuestoImporte: number }) {
  const toast = useToast()
  const [items, setItems] = useState<PresupuestoProveedor[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [allProveedores, setAllProveedores] = useState<Proveedor[]>([])
  const [selectedProveedor, setSelectedProveedor] = useState<number | ''>('')
  const [newEstado, setNewEstado] = useState('contactado')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string | number | undefined>>({})

  function load() {
    setLoading(true)
    api.getProveedoresPresupuesto(presupuestoId)
      .then(setItems)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [presupuestoId])

  function openAdd() {
    setShowAdd(true)
    setSelectedProveedor('')
    setNewEstado('contactado')
  }

  useEffect(() => {
    if (showAdd) {
      api.getProveedores().then(setAllProveedores).catch(() => {})
    }
  }, [showAdd])

  async function addProveedor() {
    if (!selectedProveedor) return
    try {
      await api.addProveedorPresupuesto(presupuestoId, { proveedor_id: Number(selectedProveedor), estado: newEstado })
      setShowAdd(false)
      toast.success('Proveedor añadido')
      load()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }

  async function updateItem(proveedorId: number, data: Record<string, string | number | undefined>) {
    try {
      await api.updateProveedorPresupuesto(presupuestoId, proveedorId, data)
      setEditingId(null)
      toast.success('Actualizado')
      load()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }

  async function removeItem(proveedorId: number) {
    if (!confirm('¿Eliminar este proveedor del presupuesto?')) return
    try {
      await api.removeProveedorPresupuesto(presupuestoId, proveedorId)
      toast.success('Eliminado')
      load()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }

  const cotizados = items.filter(i => i.estado === 'cotizacion_recibida')
  const contactados = items.filter(i => i.estado === 'contactado')
  const descartados = items.filter(i => i.estado === 'descartado')
  const mejorCotizacion = cotizados.reduce((min, p) => Math.min(min, p.importe_cotizado ?? Infinity), Infinity)
  const diferencia = mejorCotizacion < Infinity ? mejorCotizacion - presupuestoImporte : null

  return (
    <section className="card">
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Proveedores</h3>
        <button className="btn secondary small" onClick={openAdd}><Plus size={14}/>Añadir</button>
      </div>

      {cotizados.length > 0 && (
        <div className="flex gap-4" style={{ marginBottom: 16, padding: '8px 12px', background: '#f0f9ff', borderRadius: 6, fontSize: 13 }}>
          <span>Mejor cotización: <strong>{euro(mejorCotizacion)}</strong></span>
          {diferencia !== null && (
            <span style={{ color: diferencia <= 0 ? '#16a34a' : '#dc2626' }}>
              {diferencia <= 0 ? 'Ahorro' : 'Diferencia'}: {diferencia <= 0 ? '' : '+'}{euro(Math.abs(diferencia))} ({((Math.abs(diferencia) / presupuestoImporte) * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      )}

      {loading && <p className="muted">Cargando...</p>}
      {items.length === 0 && !loading && <p className="muted">Sin proveedores asociados.</p>}

      {cotizados.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Cotización recibida</h4>
          <table>
            <thead><tr><th>Proveedor</th><th>Importe</th><th>Fecha</th><th>Notas</th><th></th></tr></thead>
            <tbody>
              {cotizados.map(pp => (
                <tr key={pp.id}>
                  {editingId === pp.proveedor_id ? (
                    <>
                      <td><strong>{pp.proveedor.nombre}</strong></td>
                      <td><input className="input" type="number" step="0.01" defaultValue={pp.importe_cotizado ?? ''} onChange={e => setEditForm(f => ({ ...f, importe_cotizado: Number(e.target.value) }))} style={{ width: 100 }} /></td>
                      <td><input className="input" type="date" defaultValue={pp.fecha_cotizacion?.slice(0, 10)} onChange={e => setEditForm(f => ({ ...f, fecha_cotizacion: e.target.value }))} /></td>
                      <td><input className="input" defaultValue={pp.notas ?? ''} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} /></td>
                      <td className="flex gap-1">
                        <button className="btn small" onClick={() => updateItem(pp.proveedor_id, editForm)}>Guardar</button>
                        <button className="btn secondary small" onClick={() => setEditingId(null)}><X size={12}/></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{pp.proveedor.nombre}</strong></td>
                      <td className="money">{pp.importe_cotizado != null ? euro(pp.importe_cotizado) : '—'}</td>
                      <td>{fmtDate(pp.fecha_cotizacion)}</td>
                      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pp.notas || '—'}</td>
                      <td className="flex gap-1">
                        <button className="btn secondary small" onClick={() => { setEditingId(pp.proveedor_id); setEditForm({}) }}><Pencil size={12}/></button>
                        <button className="btn danger small" onClick={() => removeItem(pp.proveedor_id)}><Trash2 size={12}/></button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {contactados.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Contactados</h4>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {contactados.map(pp => (
              <div key={pp.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4 }}>
                <span style={{ fontSize: 13 }}>{pp.proveedor.nombre}</span>
                <select className="select small" value={pp.estado} onChange={e => updateItem(pp.proveedor_id, { estado: e.target.value })} style={{ fontSize: 11 }}>
                  {ESTADO_OPCIONES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button className="btn danger small" onClick={() => removeItem(pp.proveedor_id)}><Trash2 size={10}/></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {descartados.length > 0 && (
        <div>
          <h4 style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Descartados</h4>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {descartados.map(pp => (
              <div key={pp.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2' }}>
                <span style={{ fontSize: 13, color: '#ef4444', textDecoration: 'line-through' }}>{pp.proveedor.nombre}</span>
                <button className="btn danger small" onClick={() => removeItem(pp.proveedor_id)}><Trash2 size={10}/></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="modal-backdrop">
          <div className="modal card">
            <h3>Añadir proveedor</h3>
            <div className="field">
              <label>Proveedor</label>
              <select className="select" value={selectedProveedor} onChange={e => setSelectedProveedor(Number(e.target.value))}>
                <option value="">Seleccionar...</option>
                {allProveedores.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Estado inicial</label>
              <select className="select" value={newEstado} onChange={e => setNewEstado(e.target.value)}>
                {ESTADO_OPCIONES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setShowAdd(false)}>Cancelar</button>
              <button className="btn" disabled={!selectedProveedor} onClick={addProveedor}>Añadir</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
