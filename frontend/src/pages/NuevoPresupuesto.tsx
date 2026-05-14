import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { PresupuestoForm } from '../components/PresupuestoForm'
import { api, type Presupuesto } from '../utils/api'
import { useToast } from '../utils/toast'

export function NuevoPresupuesto() {
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState<Partial<Presupuesto> & { modificado_por?: string }>({
    estado: 'Pendiente de enviar',
    fecha_presupuesto: new Date().toISOString().slice(0,10),
    pedido_proveedor_realizado: false,
    incidencia: false,
  })
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    setError(null)
    try {
      const created = await api.post<Presupuesto>('/presupuestos', form)
      navigate(`/presupuestos/${created.id}`)
      toast.success('Presupuesto creado correctamente')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); toast.error('Error al crear') }
  }
  return <>
    <PageHeader title="Nuevo presupuesto" subtitle="Alta manual de presupuesto creado en FactuSOL." />
    {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}
    <PresupuestoForm value={form} onChange={patch => setForm(v => ({ ...v, ...patch }))} onSubmit={submit} submitLabel="Crear presupuesto" />
  </>
}
