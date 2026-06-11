import { Link } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { api, fmtDate } from '../utils/api'
import { useData } from '../utils/useData'

type Notif = { id: number; mensaje: string; leida: boolean; presupuesto_id?: number; creado_en: string }
type NotifResp = { notificaciones: Notif[]; sin_leer: number }

export function NotifPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: raw, loading, reload } = useData<NotifResp>(() => api.get('/notificaciones?limit=20'), [open])
  if (!open) return null

  const data = raw?.notificaciones || []
  const unread = data.filter(n => !n.leida).length

  async function markRead(id: number) {
    try { await api.post(`/notificaciones/${id}/leer`, {}); reload() } catch { /* noop */ }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white shadow-2xl flex flex-col" style={{ animation: 'slideInRight 0.2s ease' }}>
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell size={18} />
              <h3 className="font-semibold text-ink">Notificaciones</h3>
              {unread > 0 && <span className="badge rojo text-xs">{unread} nuevas</span>}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={async () => { try { await api.post('/notificaciones/marcar-todas-leidas', {}); reload() } catch { /* noop */ } }} className="text-xs text-brand hover:underline">
                  Marcar todas
                </button>
              )}
              <button onClick={onClose} className="text-ink-muted hover:text-ink"><X size={18} /></button>
            </div>
          </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? <div className="p-4 text-center text-ink-muted">Cargando...</div> :
           !data || data.length === 0 ? <div className="p-4 text-center text-ink-muted text-sm">Sin notificaciones</div> :
           data.map(n => (
            <div key={n.id} className={`p-3 rounded-lg mb-1 text-sm ${n.leida ? 'opacity-60' : 'bg-brand-50'}`}>
              <div className="flex justify-between gap-2">
                <p className="text-ink flex-1">{n.mensaje}</p>
                {!n.leida && (
                  <button onClick={() => markRead(n.id)} className="text-xs text-brand hover:underline flex-shrink-0">
                    Leída
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-ink-muted">{fmtDate(n.creado_en)}</span>
                {n.presupuesto_id && (
                  <Link to={`/presupuestos/${n.presupuesto_id}`} onClick={onClose} className="text-xs text-brand hover:underline">
                    Ver
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-border">
          <Link to="/notificaciones" onClick={onClose} className="text-sm text-brand hover:underline">
            Ver todas las notificaciones
          </Link>
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
