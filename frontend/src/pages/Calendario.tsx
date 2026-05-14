import { useState, useMemo } from 'react'
import { PageHeader } from '../components/PageHeader'
import { api, fmtDate, type Presupuesto } from '../utils/api'
import { useData } from '../utils/useData'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'

type Evento = { date: string; type: string; tipo: 'limite' | 'plazo' | 'entrega' | 'enviado'; p: Presupuesto }

const EVENT_COLORS: Record<string, string> = {
  limite: '#ef4444',
  plazo: '#f97316',
  entrega: '#22c55e',
  enviado: '#eab308',
}

const EVENT_LABELS: Record<string, string> = {
  limite: 'Fecha límite',
  plazo: 'Plazo proveedor',
  entrega: 'Entrega prevista',
  enviado: 'Enviado sin respuesta',
}

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
  const weekKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const weekEvents = useMemo(() => {
    const keys = weekDays.map(weekKey)
    return events.filter(e => keys.some(k => e.date === k))
  }, [events, weekDays])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay() || 7
  const cells = [...Array.from({ length: firstDay - 1 }, () => null as number | null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const daysOfWeek = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

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
  function goToday() { setCurrent(new Date()) }

  function getEventsForDay(dia: number | null) {
    if (!dia) return []
    return monthEvents.filter(e => Number(e.date.slice(8, 10)) === dia)
  }

  function getWeekEventsForDay(d: Date) {
    const k = weekKey(d)
    return weekEvents.filter(e => e.date === k)
  }

  const monthName = current.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  const eventsByDay = (day: number | null) => {
    const evs = getEventsForDay(day)
    return evs.length
  }

  const selectedEvents = selectedDay ? (view === 'mes'
    ? monthEvents.filter(e => Number(e.date.slice(8, 10)) === selectedDay.getDate() && e.date.startsWith(monthKey))
    : weekEvents.filter(e => {
      const dk = weekKey(selectedDay)
      const ek = e.date.slice(0, 10)
      return dk === ek
    })
  ) : []

  return <>
    <PageHeader
      title="Calendario"
      subtitle="Fechas límite, plazos proveedor, entregas previstas y enviados pendientes de respuesta."
    />
    {error && <div className="error">{error}</div>}
    {loading ? <div className="card">Cargando...</div> : <>
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="btn secondary small" onClick={prev}><ChevronLeft size={16}/></button>
          <span className="cal-title">{monthName}</span>
          <button className="btn secondary small" onClick={next}><ChevronRight size={16}/></button>
          <button className="btn secondary small" onClick={goToday}>Hoy</button>
        </div>
        <div className="cal-views">
          <button className={`btn secondary small ${view === 'mes' ? 'active' : ''}`} onClick={() => setView('mes')}>Mes</button>
          <button className={`btn secondary small ${view === 'semana' ? 'active' : ''}`} onClick={() => setView('semana')}>Semana</button>
        </div>
      </div>

      <div className="cal-legend">
        {Object.entries(EVENT_LABELS).map(([k, v]) => (
          <span key={k} className="legend-item"><span className="legend-dot" style={{background: EVENT_COLORS[k]}}/>{v}</span>
        ))}
      </div>

      {view === 'semana' ? (
        <div className="calendar semana">
          <div className="week-header">
            {weekDays.map(d => (
              <div key={d.toISOString()} className={`week-day-header${esHoy(d.getDate(), d.getMonth(), d.getFullYear()) ? ' today' : ''}`}>
                <span className="week-day-name">{daysOfWeek[d.getDay() - 1]}</span>
                <span className="week-day-num">{d.getDate()}</span>
              </div>
            ))}
          </div>
          <div className="week-grid">
            {weekDays.map(d => {
              const evs = getWeekEventsForDay(d)
              return (
                <div key={d.toISOString()} className={`week-cell${esHoy(d.getDate(), d.getMonth(), d.getFullYear()) ? ' today' : ''}`} onClick={() => setSelectedDay(d)}>
                  {evs.length === 0 ? <span className="no-events">—</span> : evs.map((e, i) => (
                    <Link key={i} to={`/presupuestos/${e.p.id}`} className="event" style={{borderLeftColor: EVENT_COLORS[e.tipo]}}>
                      <strong>{e.type}</strong>
                      <span>{e.p.numero_presupuesto}</span>
                    </Link>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="calendar mes">
          <div className="month-header">
            {daysOfWeek.map(d => <div key={d} className="day-name">{d}</div>)}
          </div>
          <div className="month-grid">
            {cells.map((day, i) => {
              const evs = getEventsForDay(day)
              const isToday = day && esHoy(day, month, year)
              return (
                <div key={i} className={`day${isToday ? ' today' : ''}${day && evs.length > 0 ? ' has-events' : ''}`} onClick={() => day && setSelectedDay(new Date(year, month, day))}>
                  {day && <>
                    <b>{day}</b>
                    {evs.slice(0, 3).map((e, i) => (
                      <Link key={i} to={`/presupuestos/${e.p.id}`} className="event" style={{borderLeftColor: EVENT_COLORS[e.tipo]}}>
                        {e.p.numero_presupuesto}
                      </Link>
                    ))}
                    {evs.length > 3 && <span className="more-events">+{evs.length - 3} más</span>}
                  </>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {selectedDay && selectedEvents.length > 0 && (
        <div className="cal-detail-panel">
          <div className="cal-detail-header">
            <strong>{selectedDay.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
            <button className="btn secondary small" onClick={() => setSelectedDay(null)}>Cerrar</button>
          </div>
          <div className="cal-detail-events">
            {selectedEvents.map((e, i) => (
              <Link key={i} to={`/presupuestos/${e.p.id}`} className="detail-event" style={{borderLeftColor: EVENT_COLORS[e.tipo]}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <strong>{e.p.numero_presupuesto}</strong>
                  <span className="event-type-badge" style={{background: EVENT_COLORS[e.tipo]}}>{e.type}</span>
                </div>
                <div>{e.p.cliente}</div>
                <div className="muted">{e.p.estado}</div>
                <div className="muted">{fmtDate(e.date)} · {e.p.importe}€ · Gestor: {e.p.gestor}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>}
    <style>{`
      .cal-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        flex-wrap: wrap;
        gap: 8px;
      }
      .cal-nav { display: flex; align-items: center; gap: 8px; }
      .cal-title { font-size: 18px; font-weight: 600; min-width: 180px; text-align: center; }
      .cal-views { display: flex; gap: 4px; }
      .cal-legend { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; font-size: 12px; }
      .legend-item { display: flex; align-items: center; gap: 4px; }
      .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
      .calendar { background: var(--card-bg, #fff); border-radius: 8px; border: 1px solid var(--border, #e5e7eb); overflow: hidden; }
      .month-header, .week-header { display: grid; grid-template-columns: repeat(7, 1fr); background: #f9fafb; border-bottom: 1px solid var(--border, #e5e7eb); }
      .day-name, .week-day-header { padding: 8px; text-align: center; font-size: 12px; font-weight: 600; color: var(--muted, #6b7280); }
      .week-day-header { display: flex; flex-direction: column; align-items: center; padding: 8px; }
      .week-day-num { font-size: 18px; font-weight: 600; }
      .week-day-name { font-size: 11px; color: var(--muted, #6b7280); }
      .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
      .week-grid { display: grid; grid-template-columns: repeat(7, 1fr); min-height: 120px; }
      .day, .week-cell { min-height: 100px; padding: 4px; border-right: 1px solid var(--border, #e5e7eb); border-bottom: 1px solid var(--border, #e5e7eb); cursor: pointer; transition: background 0.15s; }
      .day:hover, .week-cell:hover { background: #f9fafb; }
      .day b, .week-cell b { display: block; font-size: 13px; margin-bottom: 2px; }
      .day.today b, .week-day-header.today .week-day-num { background: var(--primary, #3b82f6); color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
      .week-cell.today { background: #eff6ff; }
      .event { display: block; font-size: 11px; padding: 2px 4px; margin: 1px 0; border-left: 3px solid; background: #f9fafb; border-radius: 2px; text-decoration: none; color: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .event:hover { background: #e0e7ff; }
      .more-events { display: block; font-size: 10px; color: var(--muted, #6b7280); padding: 2px 4px; }
      .no-events { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted, #6b7280); font-size: 20px; }
      .has-events { background: #fafafa; }
      .cal-detail-panel { margin-top: 16px; background: var(--card-bg, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 8px; overflow: hidden; }
      .cal-detail-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f9fafb; border-bottom: 1px solid var(--border, #e5e7eb); font-weight: 600; text-transform: capitalize; }
      .cal-detail-events { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
      .detail-event { display: block; padding: 10px 12px; border-left: 4px solid; background: #f9fafb; border-radius: 4px; text-decoration: none; color: inherit; }
      .detail-event:hover { background: #e0e7ff; }
      .detail-event strong { font-size: 14px; }
      .detail-event div { font-size: 12px; }
      .event-type-badge { color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: 600; }
      .btn.active { background: var(--primary, #3b82f6); color: white; }
    `}</style>
  </>
}