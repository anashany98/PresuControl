import { useState } from 'react'
import { ExternalLink, Pencil, Save, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, ESTADO_ENTREGA_OPTIONS, euro, fmtDate, isoDate, type EstadoEntrega, type PedidoProveedor, type Presupuesto } from '../utils/api'
import { getPedidoSummary, type PedidoSummaryItem } from '../utils/pedidoSummary'
import { useToast } from '../utils/toast'
import { PedidoSummaryBadge } from './PedidoSummary'
import { OptionInput } from './OptionInput'
import { useMetadataOptions } from '../utils/useMetadataOptions'

type Props = {
  presupuesto: Presupuesto
  onClose: () => void
  onUpdated: () => void
}

type Draft = {
  proveedor: string
  numero_pedido: string
  fecha_pedido: string
  importe: string
  estado_entrega: EstadoEntrega
  fecha_entrega_prevista: string
  fecha_entrega_real: string
  observaciones: string
}

function draftFromPedido(pedido: PedidoProveedor): Draft {
  return {
    proveedor: pedido.proveedor || '',
    numero_pedido: pedido.numero_pedido || '',
    fecha_pedido: isoDate(pedido.fecha_pedido),
    importe: pedido.importe != null ? String(pedido.importe) : '',
    estado_entrega: pedido.estado_entrega,
    fecha_entrega_prevista: isoDate(pedido.fecha_entrega_prevista),
    fecha_entrega_real: isoDate(pedido.fecha_entrega_real),
    observaciones: pedido.observaciones || '',
  }
}

function RowWarnings({ pedido }: { pedido: PedidoSummaryItem }) {
  const warnings = [
    pedido.vencido ? 'vencido' : null,
    pedido.fechaPrevistaFaltante ? 'sin fecha' : null,
    pedido.importeIncompleto ? 'sin importe' : null,
  ].filter(Boolean)
  if (!warnings.length) return null
  return <div className="pedido-panel-row-alerts">{warnings.map(w => <span key={w}>{w}</span>)}</div>
}

export function PedidoSummaryPanel({ presupuesto, onClose, onUpdated }: Props) {
  const summary = getPedidoSummary(presupuesto)
  const metadataOptions = useMetadataOptions()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  function startEdit(pedido: PedidoSummaryItem) {
    setError(null)
    setEditingId(pedido.id)
    setDraft(draftFromPedido(pedido))
  }

  function set(key: keyof Draft, value: string) {
    setDraft(current => current ? { ...current, [key]: value } : current)
  }

  async function save(pedido: PedidoSummaryItem) {
    if (!draft || saving) return
    setSaving(true)
    setError(null)
    try {
      await api.updatePedido(pedido.id, {
        proveedor: draft.proveedor.trim(),
        numero_pedido: draft.numero_pedido.trim() || null,
        fecha_pedido: draft.fecha_pedido || null,
        importe: draft.importe.trim() ? Number(draft.importe) : null,
        estado_entrega: draft.estado_entrega,
        fecha_entrega_prevista: draft.fecha_entrega_prevista || null,
        fecha_entrega_real: draft.fecha_entrega_real || null,
        observaciones: draft.observaciones.trim() || null,
      })
      setEditingId(null)
      setDraft(null)
      onUpdated()
      toast.success('Pedido actualizado')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pedido-panel-backdrop" onClick={onClose}>
      <aside className="pedido-side-panel" onClick={e => e.stopPropagation()} aria-label="Pedidos proveedor">
        <div className="pedido-panel-header">
          <div>
            <h3>{presupuesto.numero_presupuesto}</h3>
            <p>{presupuesto.cliente}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar panel"><X size={17}/></button>
        </div>

        <PedidoSummaryBadge presupuesto={presupuesto} summary={summary} variant="detail" />

        {error && <div className="error pedido-panel-error">{error}</div>}

        <div className="pedido-panel-list">
          {summary.totalPedidos === 0 && <p className="muted">Sin pedidos registrados.</p>}
          {summary.pedidos.map(pedido => {
            const editing = editingId === pedido.id && draft
            return (
              <div className="pedido-panel-row" key={pedido.id}>
                {editing ? (
                  <div className="pedido-panel-edit-grid">
                    <label>Proveedor<OptionInput className="input" options={metadataOptions.proveedores} value={draft.proveedor} onChange={e => set('proveedor', e.target.value)} /></label>
                    <label>Nº pedido<input className="input" value={draft.numero_pedido} onChange={e => set('numero_pedido', e.target.value)} /></label>
                    <label>Fecha pedido<input className="input" type="date" value={draft.fecha_pedido} onChange={e => set('fecha_pedido', e.target.value)} /></label>
                    <label>Importe<input className="input" type="number" step="0.01" value={draft.importe} onChange={e => set('importe', e.target.value)} /></label>
                    <label>Estado<select className="input" value={draft.estado_entrega} onChange={e => set('estado_entrega', e.target.value)}>{ESTADO_ENTREGA_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
                    <label>Entrega prevista<input className="input" type="date" value={draft.fecha_entrega_prevista} onChange={e => set('fecha_entrega_prevista', e.target.value)} /></label>
                    <label>Entrega real<input className="input" type="date" value={draft.fecha_entrega_real} onChange={e => set('fecha_entrega_real', e.target.value)} /></label>
                    <label className="pedido-panel-full">Observaciones<textarea className="input" rows={2} value={draft.observaciones} onChange={e => set('observaciones', e.target.value)} /></label>
                    <div className="pedido-panel-actions pedido-panel-full">
                      <button className="btn secondary small" onClick={() => { setEditingId(null); setDraft(null) }}>Cancelar</button>
                      <button className="btn small" disabled={saving || !draft.proveedor.trim()} onClick={() => save(pedido)}><Save size={13}/>{saving ? 'Guardando...' : 'Guardar'}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="pedido-panel-row-top">
                      <div>
                        <strong>{pedido.proveedor}</strong>
                        <span>{pedido.numero_pedido || 'Sin nº pedido'} · {pedido.estado_entrega}</span>
                      </div>
                      <div className="pedido-panel-row-money">{pedido.importe != null ? euro(pedido.importe) : '—'}</div>
                    </div>
                    <div className="pedido-panel-row-meta">
                      <span>Pedido: {fmtDate(pedido.fecha_pedido)}</span>
                      <span>Prevista: {fmtDate(pedido.fecha_entrega_prevista)}</span>
                      {pedido.fecha_entrega_real && <span>Real: {fmtDate(pedido.fecha_entrega_real)}</span>}
                    </div>
                    {pedido.observaciones && <p className="pedido-panel-notes">{pedido.observaciones}</p>}
                    <RowWarnings pedido={pedido} />
                    <div className="pedido-panel-actions">
                      {pedido.isLegacy ? (
                        <span className="muted">Pedido antiguo: editable desde detalle</span>
                      ) : (
                        <button className="btn secondary small" onClick={() => startEdit(pedido)}><Pencil size={13}/>Editar</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        <div className="pedido-panel-footer">
          <Link className="btn secondary" to={`/presupuestos/${presupuesto.id}`}><ExternalLink size={15}/>Abrir detalle</Link>
        </div>
      </aside>
    </div>
  )
}
