import { useState, useEffect, useRef } from 'react'
import { Activity, X } from 'lucide-react'
import { api, fmtDate } from '../utils/api'
import { Link } from 'react-router-dom'

type ActivityItem = {
  id: number
  presupuesto_id: number
  campo: string
  descripcion: string
  usuario_nombre?: string
  usuario_email?: string
  creado_en: string
}

export function ActivityPanel({ open, onClose, isAdmin }: { open: boolean; onClose: () => void; isAdmin: boolean }) {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const fetchActivity = async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const res = await api.get<ActivityItem[]>('/logs/actividad?limit=15')
      setItems(res || [])
    } catch { /* noop */ }
    setLoading(false)
  }

  useEffect(() => {
    if (open) {
      fetchActivity()
      intervalRef.current = setInterval(fetchActivity, 15000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [open])

  if (!open || !isAdmin) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white shadow-2xl flex flex-col" style={{ animation: 'slideInRight 0.2s ease' }}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity size={18} />
            <h3 className="font-semibold text-ink">Actividad</h3>
            <span className="text-xs text-ink-muted">Auto</span>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading && items.length === 0 ? (
            <div className="p-4 text-center text-ink-muted text-sm">Cargando...</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-center text-ink-muted text-sm">Sin actividad reciente</div>
          ) : (
            items.map(item => (
              <Link key={item.id} to={`/presupuestos/${item.presupuesto_id}`} onClick={onClose} className="block p-3 rounded-lg mb-1 hover:bg-surface-hover border border-transparent hover:border-border text-sm">
                <p className="text-ink">{item.descripcion}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-ink-muted">{item.usuario_nombre || item.usuario_email || 'Sistema'}</span>
                  <span className="text-xs text-ink-muted">{fmtDate(item.creado_en)}</span>
                </div>
              </Link>
            ))
          )}
        </div>
        <div className="p-2 border-t border-border text-center">
          <span className="text-xs text-ink-muted">Se actualiza cada 15 segundos</span>
        </div>
      </div>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}