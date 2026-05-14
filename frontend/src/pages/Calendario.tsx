import { useState, useMemo } from 'react'
import { PageHeader } from '../components/PageHeader'
import { api, fmtDate, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CalendarDays, X, ArrowRight } from 'lucide-react'

type Evento = { date: string; type: string; tipo: 'limite' | 'plazo' | 'entrega' | 'enviado'; p: Presupuesto }

const EVENT_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  limite: { bg: '#fef2f2', border: '#dc2626', text: '#991b1b', badge: '#dc2626' },
  plazo: { bg: '#fff7ed', border: '#ea580c', text: '#9a3412', badge: '#ea580c' },
  entrega: { bg: '#f0fdf4', border: '#16a34a', text: '#166534', badge: '#16a34a' },
  enviado: { bg: '#fefce8', border: '#ca8a04', text: '#854d0e', badge: '#ca8a04' },
}

const EVENT_LABELS: Record<string, string> = {
  limite: 'Fecha límite',
  plazo: 'Plazo proveedor',
  entrega: 'Entrega prevista',
  enviado: 'Enviado sin respuesta',
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function esHoy(dia: number, mes: number, anio: number): boolean {
  const hoy = new Date()
  return dia === hoy.getDate() && mes === hoy.getMonth() && anio === hoy.getFullYear()
}

function getWeekDays(fecha: Date): Date[] {
  const day = fecha.getDay() || 7
  const monday = new Date(fecha)
  monday.setDate(fecha.getDate() - day + 1)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function Calendario() {
  const { data, loading, error } = useData<Presupuesto[]>(() => api.get('/presupuestos?limit=2000'), [])
  const [current, setCurrent] = useState(() => new Date())
  const [view, setView] = useState<'mes' | 'semana'>('mes')
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const year = current.getFullYear()
  const month = current.getMonth()

  const events = useMemo(() => {
    return (data || []).flatMap(p => {
      const result: Evento[] = []
      if (p.fecha_limite_siguiente_accion) result.push({ date: p.fecha_limite_siguiente_accion, type: 'Fecha límite', tipo: 'limite', p })
      if (p.plazo_proveedor) result.push({ date: p.plazo_proveedor, type: 'Plazo proveedor', tipo: 'plazo', p })
      if (p.fecha_prevista_entrega) result.push({ date: p.fecha_prevista_entrega, type: 'Entrega prevista', tipo: 'entrega', p })
      if (p.estado === 'Enviado al cliente' && p.fecha_envio_cliente) result.push({ date: p.fecha_envio_cliente, type: 'Enviado sin respuesta', tipo: 'enviado', p })
      return result
    })
  }, [data])

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthEvents = useMemo(() => events.filter(e => e.date.startsWith(monthKey)), [events, monthKey])

  const weekDays = useMemo(() => getWeekDays(current), [current])
  const weekEvents = useMemo(() => {
    const keys = weekDays.map(d => formatDateISO(d))
    return events.filter(e => keys.includes(e.date.slice(0, 10)))
  }, [events, weekDays])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay() || 7
  const cells = [...Array.from({ length: firstDay - 1 }, () => null as number | null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  function prev() {
    setCurrent(c => {
      const d = new Date(c)
      if (view === 'semana') d.setDate(d.getDate() - 7)
      else d.setMonth(d.getMonth() - 1)
      return d
    })
  }
  function next() {
    setCurrent(c => {
      const d = new Date(c)
      if (view === 'semana') d.setDate(d.getDate() + 7)
      else d.setMonth(d.getMonth() + 1)
      return d
    })
  }
  function goToday() { setCurrent(new Date()); setSelectedDay(null) }

  function getEventsForDay(dia: number | null) {
    if (!dia) return []
    return monthEvents.filter(e => Number(e.date.slice(8, 10)) === dia)
  }

  function getWeekEventsForDay(d: Date) {
    const k = formatDateISO(d)
    return weekEvents.filter(e => e.date === k)
  }

  const selectedEvents = useMemo(() => {
    if (!selectedDay) return []
    const dk = formatDateISO(selectedDay)
    return view === 'mes'
      ? monthEvents.filter(e => e.date.startsWith(monthKey) && e.date.slice(0, 10) === dk)
      : weekEvents.filter(e => e.date.slice(0, 10) === dk)
  }, [selectedDay, view, monthEvents, weekEvents, monthKey])

  const monthName = `${MONTHS[month]} ${year}`

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle="Fechas límite, plazos proveedor, entregas previstas y enviados pendientes de respuesta."
      />
      {error && <div className="cal-error">{error}</div>}
      {loading ? <div className="cal-loading"><div className="cal-loading-inner">Cargando presupuestos...</div></div> : <>
        <div className="cal-wrapper">
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button className="cal-btn cal-btn-icon" onClick={prev} aria-label="Anterior">
                <ChevronLeft size={18}/>
              </button>
              <h2 className="cal-title">{monthName}</h2>
              <button className="cal-btn cal-btn-icon" onClick={next} aria-label="Siguiente">
                <ChevronRight size={18}/>
              </button>
              <button className="cal-btn cal-btn-hoy" onClick={goToday}>Hoy</button>
            </div>
            <div className="cal-view-toggle">
              <button
                className={`cal-btn cal-btn-view ${view === 'mes' ? 'active' : ''}`}
                onClick={() => setView('mes')}
              >
                <CalendarDays size={15}/>
                Mes
              </button>
              <button
                className={`cal-btn cal-btn-view ${view === 'semana' ? 'active' : ''}`}
                onClick={() => setView('semana')}
              >
                <CalendarDays size={15}/>
                Semana
              </button>
            </div>
          </div>

          <div className="cal-legend">
            {Object.entries(EVENT_LABELS).map(([k, v]) => (
              <span key={k} className="cal-legend-item">
                <span className="cal-legend-dot" style={{background: EVENT_COLORS[k].badge}}/>
                {v}
              </span>
            ))}
          </div>

          <div className="cal-main">
            <div className={`cal-grid-container ${view === 'semana' ? 'week-view' : 'month-view'}`}>
              {view === 'semana' ? (
                <div className="cal-grid week-grid">
                  <div className="cal-head-row">
                    {weekDays.map(d => (
                      <div key={d.toISOString()} className={`cal-head-cell ${esHoy(d.getDate(), d.getMonth(), d.getFullYear()) ? 'today' : ''}`}>
                        <span className="cal-head-name">{DAYS[d.getDay() - 1]}</span>
                        <span className="cal-head-num">{d.getDate()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="cal-body-row">
                    {weekDays.map(d => {
                      const evs = getWeekEventsForDay(d)
                      const isToday = esHoy(d.getDate(), d.getMonth(), d.getFullYear())
                      return (
                        <div
                          key={d.toISOString()}
                          className={`cal-cell ${isToday ? 'today' : ''} ${evs.length > 0 ? 'has-events' : ''}`}
                          onClick={() => setSelectedDay(d)}
                        >
                          {evs.length === 0 ? (
                            <span className="cal-no-events">—</span>
                          ) : (
                            evs.map((e, i) => (
                              <Link
                                key={i}
                                to={`/presupuestos/${e.p.id}`}
                                className="cal-event"
                                style={{
                                  background: EVENT_COLORS[e.tipo].bg,
                                  borderLeftColor: EVENT_COLORS[e.tipo].border,
                                  color: EVENT_COLORS[e.tipo].text
                                }}
                                onClick={e => e.stopPropagation()}
                              >
                                <span className="cal-event-num">{e.p.numero_presupuesto}</span>
                                <span className="cal-event-type">{e.type}</span>
                              </Link>
                            ))
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="cal-grid month-grid">
                  <div className="cal-head-row">
                    {DAYS.map(d => <div key={d} className="cal-head-cell"><span className="cal-head-name">{d}</span></div>)}
                  </div>
                  <div className="cal-body-cells">
                    {cells.map((day, i) => {
                      const evs = getEventsForDay(day)
                      const isToday = day && esHoy(day, month, year)
                      return (
                        <div
                          key={i}
                          className={`cal-cell ${day ? '' : 'empty'} ${isToday ? 'today' : ''} ${day && evs.length > 0 ? 'has-events' : ''}`}
                          onClick={() => day && setSelectedDay(new Date(year, month, day))}
                        >
                          {day && <>
                            <div className="cal-day-num-wrap">
                              <span className="cal-day-num">{day}</span>
                              {evs.length > 0 && (
                                <span className="cal-count-badge">{evs.length}</span>
                              )}
                            </div>
                            <div className="cal-events-list">
                              {evs.slice(0, 3).map((e, i) => (
                                <Link
                                  key={i}
                                  to={`/presupuestos/${e.p.id}`}
                                  className="cal-event cal-event-compact"
                                  style={{
                                    background: EVENT_COLORS[e.tipo].bg,
                                    borderLeftColor: EVENT_COLORS[e.tipo].border,
                                    color: EVENT_COLORS[e.tipo].text
                                  }}
                                  onClick={e => e.stopPropagation()}
                                >
                                  {e.p.numero_presupuesto}
                                </Link>
                              ))}
                              {evs.length > 3 && (
                                <span className="cal-more">+{evs.length - 3} más</span>
                              )}
                            </div>
                          </>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {selectedDay && selectedEvents.length > 0 && (
              <div className="cal-side-panel">
                <div className="cal-panel-header">
                  <div>
                    <h3 className="cal-panel-date">{selectedDay.toLocaleDateString('es-ES', { weekday: 'short' })}</h3>
                    <p className="cal-panel-day">{selectedDay.getDate()} {MONTHS[selectedDay.getMonth()].toLowerCase()}</p>
                  </div>
                  <button className="cal-btn cal-btn-close" onClick={() => setSelectedDay(null)} aria-label="Cerrar">
                    <X size={16}/>
                  </button>
                </div>
                <div className="cal-panel-count">
                  {selectedEvents.length} evento{selectedEvents.length !== 1 ? 's' : ''}
                </div>
                <div className="cal-panel-list">
                  {selectedEvents.map((e, i) => (
                    <Link key={i} to={`/presupuestos/${e.p.id}`} className="cal-panel-item">
                      <div className="cal-panel-item-top">
                        <span className="cal-panel-num">{e.p.numero_presupuesto}</span>
                        <span
                          className="cal-panel-badge"
                          style={{
                            background: EVENT_COLORS[e.tipo].badge,
                            color: 'white'
                          }}
                        >
                          {e.type}
                        </span>
                      </div>
                      <div className="cal-panel-client">{e.p.cliente}</div>
                      <div className="cal-panel-meta">
                        <span>{e.p.estado}</span>
                        <span className="cal-panel-sep">·</span>
                        <span>{fmtDate(e.date)}</span>
                        <span className="cal-panel-sep">·</span>
                        <span>{e.p.importe}€</span>
                        <span className="cal-panel-sep">·</span>
                        <span>{e.p.gestor}</span>
                      </div>
                      <div className="cal-panel-arrow">
                        <ArrowRight size={14}/>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </>}
      <style>{`
        .cal-wrapper {
          max-width: 1400px;
        }
        .cal-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .cal-nav {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cal-title {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.03em;
          min-width: 220px;
          text-align: center;
          color: #1c1917;
          text-transform: capitalize;
          margin: 0;
        }
        .cal-view-toggle {
          display: flex;
          background: #faf9f7;
          border-radius: 14px;
          padding: 4px;
          gap: 2px;
        }
        .cal-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 0;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.15s ease;
          border-radius: 10px;
        }
        .cal-btn-icon {
          width: 36px;
          height: 36px;
          background: #faf9f7;
          color: #1c1917;
          border: 1px solid #e8e4df;
        }
        .cal-btn-icon:hover {
          background: #1c1917;
          color: white;
          border-color: #1c1917;
        }
        .cal-btn-hoy {
          background: #1c1917;
          color: white;
          padding: 8px 14px;
          border-radius: 10px;
          font-size: 13px;
          border: 1px solid #1c1917;
        }
        .cal-btn-hoy:hover {
          background: #292524;
        }
        .cal-btn-view {
          padding: 8px 14px;
          font-size: 13px;
          background: transparent;
          color: #78716c;
          border: 0;
        }
        .cal-btn-view.active {
          background: white;
          color: #1c1917;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        .cal-btn-close {
          width: 28px;
          height: 28px;
          background: #f5f3f0;
          color: #78716c;
          border: 1px solid #e8e4df;
          border-radius: 8px;
        }
        .cal-btn-close:hover {
          background: #1c1917;
          color: white;
          border-color: #1c1917;
        }
        .cal-legend {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
          margin-bottom: 20px;
          font-size: 12px;
          padding: 12px 16px;
          background: #faf9f7;
          border-radius: 14px;
          border: 1px solid #e8e4df;
        }
        .cal-legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #44403c;
          font-weight: 500;
        }
        .cal-legend-dot {
          width: 10px;
          height: 10px;
          border-radius: 3px;
        }
        .cal-main {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 16px;
          align-items: start;
        }
        .cal-main:has(.cal-side-panel) {
          grid-template-columns: 1fr 340px;
        }
        .cal-grid-container {
          background: #faf9f7;
          border: 1px solid #e8e4df;
          border-radius: 20px;
          overflow: hidden;
        }
        .cal-head-row {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          background: #f5f3f0;
          border-bottom: 1px solid #e8e4df;
        }
        .cal-head-cell {
          padding: 12px 8px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .cal-head-name {
          font-size: 11px;
          font-weight: 600;
          color: #78716c;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .cal-head-num {
          font-size: 20px;
          font-weight: 700;
          color: #1c1917;
          line-height: 1;
        }
        .cal-head-cell.today .cal-head-num {
          width: 36px;
          height: 36px;
          background: #dc2626;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        .cal-body-cells {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
        }
        .cal-body-row {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          min-height: 140px;
        }
        .cal-cell {
          min-height: 100px;
          padding: 8px;
          border-right: 1px solid #e8e4df;
          border-bottom: 1px solid #e8e4df;
          cursor: pointer;
          transition: background 0.12s;
          position: relative;
        }
        .cal-cell:nth-child(7n) {
          border-right: 0;
        }
        .month-view .cal-cell:nth-last-child(-n+7) {
          border-bottom: 0;
        }
        .week-view .cal-body-row .cal-cell:nth-child(7n) {
          border-right: 0;
        }
        .week-view .cal-body-row .cal-cell:nth-child(n+8) {
          border-bottom: 0;
        }
        .cal-cell.empty {
          background: #f5f3f0;
          cursor: default;
        }
        .cal-cell:hover:not(.empty) {
          background: #f0ede8;
        }
        .cal-cell.today {
          background: #fff7f7;
        }
        .cal-cell.has-events {
          background: #fffdfc;
        }
        .cal-day-num-wrap {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .cal-day-num {
          font-size: 14px;
          font-weight: 700;
          color: #1c1917;
        }
        .cal-cell.today .cal-day-num {
          width: 26px;
          height: 26px;
          background: #dc2626;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
        }
        .cal-count-badge {
          font-size: 10px;
          font-weight: 700;
          background: #1c1917;
          color: white;
          padding: 2px 6px;
          border-radius: 8px;
          min-width: 20px;
          text-align: center;
        }
        .cal-events-list {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .cal-event {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 6px;
          border-radius: 6px;
          border-left: 3px solid;
          font-size: 11px;
          text-decoration: none;
          transition: all 0.12s;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cal-event:hover {
          filter: brightness(0.95);
          transform: translateX(2px);
        }
        .cal-event-compact {
          flex-direction: column;
          align-items: flex-start;
          gap: 1px;
        }
        .cal-event-num {
          font-weight: 700;
        }
        .cal-event-type {
          font-size: 10px;
          opacity: 0.8;
          font-weight: 500;
        }
        .cal-no-events {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 80px;
          color: #c4bfb8;
          font-size: 24px;
        }
        .cal-more {
          font-size: 10px;
          color: #78716c;
          padding: 2px 4px;
          font-weight: 500;
        }
        .cal-side-panel {
          width: 340px;
          background: #faf9f7;
          border: 1px solid #e8e4df;
          border-radius: 20px;
          overflow: hidden;
          position: sticky;
          top: 16px;
        }
        .cal-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 16px;
          background: #f5f3f0;
          border-bottom: 1px solid #e8e4df;
        }
        .cal-panel-date {
          font-size: 12px;
          font-weight: 600;
          color: #78716c;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin: 0 0 4px;
        }
        .cal-panel-day {
          font-size: 22px;
          font-weight: 700;
          color: #1c1917;
          text-transform: capitalize;
          margin: 0;
        }
        .cal-panel-count {
          padding: 8px 16px;
          font-size: 11px;
          font-weight: 600;
          color: #78716c;
          border-bottom: 1px solid #e8e4df;
          background: #faf9f7;
        }
        .cal-panel-list {
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: calc(100vh - 280px);
          overflow-y: auto;
        }
        .cal-panel-item {
          display: block;
          padding: 12px;
          background: white;
          border: 1px solid #e8e4df;
          border-radius: 14px;
          text-decoration: none;
          color: inherit;
          position: relative;
          transition: all 0.15s;
        }
        .cal-panel-item:hover {
          border-color: #1c1917;
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
        }
        .cal-panel-item-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .cal-panel-num {
          font-size: 15px;
          font-weight: 800;
          color: #1c1917;
          letter-spacing: -0.02em;
        }
        .cal-panel-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 8px;
        }
        .cal-panel-client {
          font-size: 13px;
          font-weight: 600;
          color: #1c1917;
          margin-bottom: 4px;
        }
        .cal-panel-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          font-size: 11px;
          color: #78716c;
        }
        .cal-panel-sep {
          color: #c4bfb8;
        }
        .cal-panel-arrow {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #c4bfb8;
          transition: all 0.15s;
        }
        .cal-panel-item:hover .cal-panel-arrow {
          color: #1c1917;
          transform: translateY(-50%) translateX(2px);
        }
        .cal-error {
          padding: 14px 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 14px;
          color: #991b1b;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .cal-loading {
          display: flex;
          justify-content: center;
          padding: 60px;
        }
        .cal-loading-inner {
          color: #78716c;
          font-size: 14px;
        }
        @media (max-width: 1100px) {
          .cal-main {
            grid-template-columns: 1fr;
          }
          .cal-side-panel {
            width: 100%;
            position: static;
          }
          .cal-main:has(.cal-side-panel) {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 720px) {
          .cal-title {
            font-size: 18px;
            min-width: 160px;
          }
          .cal-legend {
            gap: 12px;
            font-size: 11px;
          }
          .cal-cell {
            min-height: 80px;
            padding: 6px;
          }
          .cal-day-num {
            font-size: 12px;
          }
          .cal-count-badge {
            font-size: 9px;
            padding: 1px 4px;
          }
          .cal-event {
            font-size: 10px;
            padding: 3px 4px;
          }
          .cal-head-num {
            font-size: 16px;
          }
          .cal-head-cell.today .cal-head-num {
            width: 30px;
            height: 30px;
            font-size: 15px;
          }
        }
      `}</style>
    </>
  )
}