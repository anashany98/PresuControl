import { useState, useMemo } from 'react'
import { CheckCircle2, Circle, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { SkeletonCard } from '../components/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { euro, type Presupuesto } from '../utils/api'
import { useToast } from '../utils/toast'
import { PedidoSummaryBadge } from '../components/PedidoSummary'

type SectionKey = 'hoy' | 'semana' | 'atrasados' | 'sin_accion'

interface Section {
  key: SectionKey
  label: string
  items: Presupuesto[]
}

function getDaysDiff(fecha: string | null | undefined): number {
  if (!fecha) return NaN
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(fecha)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function HoyItem({ p, onDone, done }: { p: Presupuesto; onDone: (p: Presupuesto) => void; done: boolean }) {
  const daysDiff = getDaysDiff(p.fecha_limite_siguiente_accion)
  const isPast = daysDiff < 0
  const isToday = daysDiff === 0

  const estadoColor: Record<string, string> = {
    'Pendiente de enviar': '#6b7280',
    'Enviado al cliente': '#3b82f6',
    'Aceptado - pendiente pedido proveedor': '#f97316',
    'Pedido proveedor realizado': '#8b5cf6',
    'Plazo proveedor confirmado': '#8b5cf6',
    'En preparación / fabricación': '#8b5cf6',
    'Entregado / cerrado': '#22c55e',
    'Cancelado / rechazado': '#ef4444',
    'Bloqueado / incidencia': '#ef4444',
  }

  return (
    <div className={`hoy-card${done ? ' done' : ''}`}>
      <div className="hoy-card-left">
        <div className="hoy-card-num">
          <Link to={`/presupuestos/${p.id}`}>{p.numero_presupuesto}</Link>
        </div>
        <div className="hoy-card-cliente">{p.cliente}</div>
        <div className="hoy-card-obra">{p.obra_referencia || '—'}</div>
      </div>
      <div className="hoy-card-center">
        {p.fecha_limite_siguiente_accion ? (
          <span className={`hoy-fecha ${isPast ? 'red' : isToday ? 'orange' : ''}`}>
            {isToday ? 'HOY' : isPast ? 'ATRASADO' : new Date(p.fecha_limite_siguiente_accion).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
          </span>
        ) : (
          <span className="hoy-fecha gray">—</span>
        )}
      </div>
      <div className="hoy-card-action">
        <span>{p.siguiente_accion || '—'}</span>
        <PedidoSummaryBadge presupuesto={p} variant="mini" />
      </div>
      <div className="hoy-card-right">
        <div className="hoy-card-gestor">{p.gestor}</div>
        <div className="hoy-card-estado" style={{ color: estadoColor[p.estado] || '#6b7280' }}>{p.estado}</div>
        <div className="hoy-card-importe">{euro(p.importe)}</div>
      </div>
      <button className="hoy-card-done" onClick={() => !done && onDone(p)} title="Marcar como hecho">
        {done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
      </button>
    </div>
  )
}

export function Hoy() {
  const { data, isLoading, error, refetch } = useQuery<Presupuesto[]>({
    queryKey: ['hoy'],
    queryFn: () => import('../utils/api').then(m => m.api.get<Presupuesto[]>('/hoy')),
  })
  const [done, setDone] = useState<Set<number>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const toast = useToast()

  const sections = useMemo(() => {
    if (!data) return [] as Section[]

    const hoy: Presupuesto[] = []
    const semana: Presupuesto[] = []
    const atrasados: Presupuesto[] = []
    const sinAccion: Presupuesto[] = []

    for (const p of data) {
      if (!p.fecha_limite_siguiente_accion) {
        sinAccion.push(p)
      } else {
        const diff = getDaysDiff(p.fecha_limite_siguiente_accion)
        if (diff < 0) atrasados.push(p)
        else if (diff === 0) hoy.push(p)
        else if (diff <= 7) semana.push(p)
        else hoy.push(p)
      }
    }

    return [
      { key: 'hoy', label: 'Para hoy', items: hoy },
      { key: 'semana', label: 'Esta semana', items: semana },
      { key: 'atrasados', label: 'Atrasados', items: atrasados },
      { key: 'sin_accion', label: 'Sin acción', items: sinAccion },
    ].filter(s => s.items.length > 0) as Section[]
  }, [data])

  async function markDone(p: Presupuesto) {
    setDone(d => new Set([...d, p.id]))
    try {
      const { api } = await import('../utils/api')
      await api.patch<Presupuesto>(`/presupuestos/${p.id}`, {
        ...p,
        expected_version: p.version,
      })
      setMsg('✓ Tarea completada')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setDone(d => { const n = new Set(d); n.delete(p.id); return n })
      toast.error('Error al marcar como hecho')
    }
  }

  return <>
    <PageHeader title="Hoy" subtitle="Vista general de acciones" actions={<button className="btn secondary" onClick={() => refetch()}><RefreshCw size={16}/></button>} />
    {msg && <div className="notice" style={{ marginBottom: 14 }}>{msg}</div>}
    {error && <div className="error">{(error as Error).message}</div>}
    {isLoading ? <SkeletonCard /> : <>
      {sections.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎉</div>
          <h3>¡Todo bajo control!</h3>
          <p>No hay tareas pendientes.</p>
        </div>
      ) : (
        <div className="hoy-sections">
          {sections.map(section => (
            <div className="hoy-section" key={section.key}>
              <h3 className="hoy-section-title">{section.label} <span className="hoy-section-count">{section.items.length}</span></h3>
              <div className="hoy-cards">
                {section.items.filter(p => !done.has(p.id)).map(p => (
                  <HoyItem key={p.id} p={p} onDone={markDone} done={done.has(p.id)} />
                ))}
                {section.items.filter(p => done.has(p.id)).length > 0 && (
                  <details className="hoy-done">
                    <summary>Completadas ({section.items.filter(p => done.has(p.id)).length})</summary>
                    {section.items.filter(p => done.has(p.id)).map(p => (
                      <HoyItem key={p.id} p={p} onDone={markDone} done />
                    ))}
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>}
    <style>{`
      .empty-state { text-align: center; padding: 60px 20px; background: white; border-radius: 12px; border: 1px solid #e5e7eb; }
      .empty-icon { font-size: 64px; margin-bottom: 16px; }
      .empty-state h3 { font-size: 22px; color: #1c1917; margin-bottom: 8px; }
      .empty-state p { color: #78716c; font-size: 14px; }
      .hoy-sections { display: flex; flex-direction: column; gap: 24px; }
      .hoy-section { }
      .hoy-section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #78716c; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
      .hoy-section-count { background: #f1f5f9; color: #475569; font-size: 11px; padding: 2px 7px; border-radius: 10px; }
      .hoy-cards { display: flex; flex-direction: column; gap: 4px; }
      .hoy-card { display: grid; grid-template-columns: 140px 60px 1fr 120px 32px; align-items: center; gap: 10px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; transition: all 0.15s; }
      .hoy-card:hover { border-color: #cbd5e1; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
      .hoy-card.done { opacity: 0.45; }
      .hoy-card-left { min-width: 0; }
      .hoy-card-num a { font-size: 13px; font-weight: 600; color: #1e40af; text-decoration: none; }
      .hoy-card-num a:hover { text-decoration: underline; }
      .hoy-card-cliente { font-size: 12px; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .hoy-card-obra { font-size: 11px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .hoy-card-center { text-align: center; }
      .hoy-fecha { font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #f0fdf4; color: #166534; }
      .hoy-fecha.red { background: #fef2f2; color: #dc2626; }
      .hoy-fecha.orange { background: #fff7ed; color: #ea580c; }
      .hoy-fecha.gray { background: #f9fafb; color: #9ca3af; }
      .hoy-card-action { display: grid; gap: 4px; font-size: 12px; color: #4b5563; min-width: 0; }
      .hoy-card-action > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .hoy-card-right { text-align: right; min-width: 0; }
      .hoy-card-gestor { font-size: 11px; color: #6b7280; }
      .hoy-card-estado { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .hoy-card-importe { font-size: 12px; font-weight: 600; color: #1c1917; }
      .hoy-card-done { width: 28px; height: 28px; border: none; background: none; cursor: pointer; color: #d1d5db; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.15s; flex-shrink: 0; }
      .hoy-card-done:hover { color: #22c55e; background: #f0fdf4; }
      .hoy-card.done .hoy-card-done { color: #22c55e; }
      .hoy-done { margin-top: 4px; padding: 6px 10px; background: #f9fafb; border-radius: 6px; font-size: 12px; color: #6b7280; }
      .hoy-done summary { cursor: pointer; font-weight: 500; }
    `}</style>
  </>
}
