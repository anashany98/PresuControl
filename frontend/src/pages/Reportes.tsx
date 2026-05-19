import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Download, FileSpreadsheet, Package, ShieldAlert, XCircle, Clock, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StateBadge } from '../components/Badges'
import { API_URL, api, euro, fmtDate, type Presupuesto } from '../utils/api'
import { useAuth } from '../utils/auth'
import { useData } from '../utils/useData'
import { PedidoSummaryBadge } from '../components/PedidoSummary'
import { useToast } from '../utils/toast'

type ReportKey = 'atrasados' | 'cancelados' | 'sin_pedido' | 'sin_aceptacion' | 'en_riesgo' | 'pedidos_pendientes' | 'pedidos_completados'

const TABS: { key: ReportKey; label: string; icon: typeof FileSpreadsheet }[] = [
  { key: 'atrasados', label: 'Atrasados', icon: AlertTriangle },
  { key: 'cancelados', label: 'Cancelados', icon: XCircle },
  { key: 'sin_pedido', label: 'Sin pedido', icon: Package },
  { key: 'sin_aceptacion', label: 'Sin aceptación', icon: Clock },
  { key: 'en_riesgo', label: 'En riesgo', icon: ShieldAlert },
  { key: 'pedidos_pendientes', label: 'Pedidos pendientes', icon: Package },
  { key: 'pedidos_completados', label: 'Pedidos completados', icon: CheckCircle2 },
]

async function downloadExcel(data: Presupuesto[], filename: string) {
  if (!data.length) return
  const token = localStorage.getItem('presucontrol_token')
  const res = await fetch(`${API_URL}/reports/export-list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items: data, filename }),
  })
  if (!res.ok) throw new Error('Export failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function Reportes() {
  const { user } = useAuth()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<ReportKey>('atrasados')
  const [gestor, setGestor] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [diasLimite, setDiasLimite] = useState('7')

  const endpointMap: Record<ReportKey, string> = {
    atrasados: 'atrasados',
    cancelados: 'cancelados',
    sin_pedido: 'sin_pedido',
    sin_aceptacion: 'sin_aceptacion',
    en_riesgo: 'en_riesgo',
    pedidos_pendientes: 'pedidos_pendientes',
    pedidos_completados: 'pedidos_completados',
  }

  const queryParams = new URLSearchParams()
  if (gestor) queryParams.set('gestor', gestor)
  if (dateFrom) queryParams.set('fecha_from', dateFrom)
  if (dateTo) queryParams.set('fecha_to', dateTo)
  if (activeTab === 'sin_aceptacion') queryParams.set('dias', diasLimite)
  queryParams.set('type', endpointMap[activeTab])
  const query = queryParams.toString()

  const { data, loading, error, reload } = useData<Presupuesto[]>(
    () => api.get(`/reports/list?${query}`),
    [activeTab, query],
  )

  const rows = data || []

  const filteredRows = rows.filter(p => {
    if (gestor && p.gestor !== gestor) return false
    if (dateFrom && p.fecha_limite_siguiente_accion && p.fecha_limite_siguiente_accion < dateFrom) return false
    if (dateTo && p.fecha_limite_siguiente_accion && p.fecha_limite_siguiente_accion > dateTo) return false
    return true
  })

  const handleExport = () => {
    const date = new Date().toISOString().slice(0, 10)
    downloadExcel(filteredRows, `reporte_${activeTab}_${date}.xlsx`).catch(() => toast.error('Error exportando'))
  }

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle="Exporta listados de presupuestos según diferentes criterios."
        actions={<button className="btn secondary" onClick={reload}>Actualizar</button>}
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`btn ${activeTab === key ? '' : 'secondary'}`}
              onClick={() => setActiveTab(key)}
            >
              <Icon size={15} />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <input
            type="date"
            className="input"
            style={{ maxWidth: 170 }}
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            placeholder="Desde fecha límite"
          />
          <input
            type="date"
            className="input"
            style={{ maxWidth: 170 }}
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            placeholder="Hasta fecha límite"
          />
          {user?.puede_gestionar_sistema && (
            <input
              type="text"
              className="input"
              style={{ maxWidth: 170 }}
              value={gestor}
              onChange={e => setGestor(e.target.value)}
              placeholder="Gestor"
            />
          )}
          {activeTab === 'sin_aceptacion' && (
            <input
              type="number"
              className="input"
              style={{ maxWidth: 100 }}
              value={diasLimite}
              onChange={e => setDiasLimite(e.target.value)}
              min="1"
              placeholder="Días"
            />
          )}
          <button className="btn secondary" onClick={() => { setDateFrom(''); setDateTo(''); setGestor(''); setDiasLimite('7') }}>
            Limpiar
          </button>
          <button className="btn" onClick={handleExport} disabled={!filteredRows.length}>
            <Download size={15} />Exportar Excel
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {loading ? (
        <div className="card">Cargando...</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nº Presupuesto</th>
                <th>Cliente</th>
                <th>Gestor</th>
                <th>Estado</th>
                <th>Importe</th>
                <th>Pedidos</th>
                <th>Fecha límite</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center' }} className="muted">Sin resultados</td></tr>
              ) : (
                filteredRows.map(p => (
                  <tr key={p.id}>
                    <td><Link to={`/presupuestos/${p.id}`}><strong>{p.numero_presupuesto}</strong></Link></td>
                    <td>{p.cliente}</td>
                    <td>{p.gestor}</td>
                    <td><StateBadge value={p.estado} /></td>
                    <td className="money">{euro(p.importe)}</td>
                    <td><PedidoSummaryBadge presupuesto={p} variant="table" /></td>
                    <td>{fmtDate(p.fecha_limite_siguiente_accion)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {data && <div className="summary-strip"><span><strong>{filteredRows.length}</strong> resultados</span></div>}
    </>
  )
}
