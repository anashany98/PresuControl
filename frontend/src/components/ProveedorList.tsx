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
  const [adding, setAdding] = useState(false)
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
      api.getProveedores().then(setAllProveedores).catch(e => toast.error('Error cargando proveedores'))
    }
  }, [showAdd])

  async function addProveedor() {
    if (!selectedProveedor) return
    setAdding(true)
    try {
      await api.addProveedorPresupuesto(presupuestoId, { proveedor_id: Number(selectedProveedor), estado: newEstado })
      setShowAdd(false)
      toast.success('Proveedor añadido')
      load()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
    finally { setAdding(false) }
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
      <div className="toolbar mb-3">
        <h3 className="m-0">Proveedores</h3>
        <button className="btn secondary small" onClick={openAdd}><Plus size={14}/>Añadir</button>
      </div>

      {cotizados.length > 0 && (
        <div className="flex gap-4 mb-4 px-3 py-2 rounded bg-blue-50 text-sm">
          <span>Mejor cotización: <strong>{euro(mejorCotizacion)}</strong></span>
          {diferencia !== null && (
            <span className={diferencia <= 0 ? 'text-green-600' : 'text-red-600'}>
              {diferencia <= 0 ? 'Ahorro' : 'Diferencia'}: {diferencia <= 0 ? '' : '+'}{euro(Math.abs(diferencia))} ({((Math.abs(diferencia) / presupuestoImporte) * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      )}

      {loading && <p className="muted">Cargando...</p>}
      {items.length === 0 && !loading && <p className="muted">Sin proveedores asociados.</p>}

      {cotizados.length > 0 && (
        <div className="mb-4">
          <h4 className="text-2xs uppercase tracking-wider text-stone-500 mb-2">Cotización recibida</h4>
          <table>
            <thead><tr><th>Proveedor</th><th>Importe</th><th>Fecha</th><th>Notas</th><th></th></tr></thead>
            <tbody>
              {cotizados.map(pp => (
                <tr key={pp.id}>
                  {editingId === pp.proveedor_id ? (
                    <>
                      <td><strong>{pp.proveedor.nombre}</strong></td>
                      <td><input className="input w-24" type="number" step="0.01" defaultValue={pp.importe_cotizado ?? ''} onChange={e => setEditForm(f => ({ ...f, importe_cotizado: Number(e.target.value) }))} /></td>
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
                      <td className="max-w-44 truncate">{pp.notas || '—'}</td>
                      <td className="flex gap-1">
                        <button className="btn secondary small" onClick={() => { setEditingId(pp.proveedor_id); setEditForm({}) }} aria-label={`Editar ${pp.proveedor?.nombre}`}><Pencil size={12}/></button>
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
        <div className="mb-4">
          <h4 className="text-2xs uppercase tracking-wider text-stone-500 mb-2">Contactados</h4>
          <div className="flex flex-wrap gap-2">
            {contactados.map(pp => (
              <div key={pp.id} className="flex items-center gap-1_5 px-2 py-1 border border-stone-200 rounded text-sm">
                <span>{pp.proveedor.nombre}</span>
                <select className="select small text-xs" value={pp.estado} onChange={e => updateItem(pp.proveedor_id, { estado: e.target.value })}>
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
          <h4 className="text-2xs uppercase tracking-wider text-stone-500 mb-2">Descartados</h4>
          <div className="flex flex-wrap gap-2">
            {descartados.map(pp => (
              <div key={pp.id} className="flex items-center gap-1_5 px-2 py-1 border border-red-200 rounded text-sm bg-red-50">
                <span className="text-red-600 line-through text-sm">{pp.proveedor.nombre}</span>
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
              <button className="btn" disabled={!selectedProveedor || adding} onClick={addProveedor}>{adding ? 'Añadiendo...' : 'Añadir'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
