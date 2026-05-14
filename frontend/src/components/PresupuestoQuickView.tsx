import { X } from 'lucide-react'
import { useData } from '../utils/useData'
import { PriorityBadge, StateBadge } from './Badges'
import { api, euro, fmtDate, type Presupuesto } from '../utils/api'
import { Link } from 'react-router-dom'

export function PresupuestoQuickView({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data, loading } = useData<Presupuesto>(() => id ? api.get(`/presupuestos/${id}`) : Promise.resolve(null as any), [id])
  if (!id) return null
  return (
    <div className="quick-view-panel">
      <div className="quick-view-header">
        <h3>{data?.numero_presupuesto || 'Cargando...'}</h3>
        <button className="btn secondary small" onClick={onClose}><X size={14}/></button>
      </div>
      <div className="quick-view-content">
        {loading ? <div className="card">Cargando...</div> : data && <>
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            <StateBadge value={data.estado}/><PriorityBadge value={data.prioridad_calculada}/>
          </div>
          <div className="quick-view-item"><strong>Cliente</strong>{data.cliente}</div>
          <div className="quick-view-item"><strong>Obra</strong>{data.obra_referencia}</div>
          <div className="quick-view-item"><strong>Importe</strong>{euro(data.importe)}</div>
          <div className="quick-view-item"><strong>Gestor</strong>{data.gestor}</div>
          <div className="quick-view-item"><strong>Responsable</strong>{data.responsable_actual || '—'}</div>
          {data.siguiente_accion && <div className="quick-view-item"><strong>Próxima acción</strong>{data.siguiente_accion}</div>}
          <div className="quick-view-item"><strong>Vence</strong>{fmtDate(data.fecha_limite_siguiente_accion)}</div>
          <div className="quick-view-item"><strong>Días parado</strong>{data.dias_parado}</div>
          <div className="quick-view-item"><strong>Última act.</strong>{fmtDate(data.fecha_ultima_actualizacion)}</div>
          <div className="quick-view-actions">
            <Link to={`/presupuestos/${id}`} className="btn">Ver ficha completa →</Link>
          </div>
        </>}
      </div>
    </div>
  )
}