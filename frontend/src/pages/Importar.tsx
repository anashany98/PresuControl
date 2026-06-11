import { useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Columns3, FileSearch, Info, Table, UploadCloud } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { api } from '../utils/api'
import { Modal } from '../components/Modal'
import { useToast } from '../utils/toast'

type Preview = {
  total_filas: number
  validos: number
  duplicados_bd: string[]
  duplicados_archivo: string[]
  errores: { fila: number; error: string }[]
  preview: Record<string, string>[]
  modo: string
  nuevos: number
  actualizables: number
  cambios_preview: { numero_presupuesto: string; cambios: { campo: string; antes?: string; despues?: string }[] }[]
  columnas?: string[]
  mapeo?: Record<string, string>
}

export function Importar() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState('create_only')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [showDataModal, setShowDataModal] = useState(false)
  const [showMappingModal, setShowMappingModal] = useState(false)
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set())
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({})
  const [, setColumnAliases] = useState<Record<string, string>>({})
  const [, setFileHeaders] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  function handleFileChange(f: File | null) {
    setFile(f)
    setFileHeaders([])
    setPreview(null)
    setColumnMapping({})
    if (!f) return
    // Parse headers for CSV
    if (f.name.toLowerCase().endsWith('.csv')) {
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result as string
        const firstLine = text.split('\n')[0] || ''
        const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''))
        if (headers.length > 0 && headers[0]) setFileHeaders(headers)
      }
      reader.readAsText(f.slice(0, 4096))
    } else {
      // For XLSX/XLS, use fallback: show generic message
      setFileHeaders(['(Columnas detectadas al simular)'])
    }
    // Load field labels
    if (Object.keys(fieldLabels).length === 0) {
      api.get<{fields: Record<string, string>; aliases: Record<string, string>}>('/import/fields').then(data => {
        setFieldLabels(data.fields)
        setColumnAliases(data.aliases)
        // Auto-map using aliases (exact match priority) + labels (fallback)
        if (f.name.toLowerCase().endsWith('.csv')) {
          const reader2 = new FileReader()
          reader2.onload = () => {
            const text = reader2.result as string
            const firstLine = text.split('\n')[0] || ''
            const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''))
            const auto: Record<string, string> = {}
            for (const h of headers) {
              if (!h) continue
              // 1. Try exact alias match
              if (data.aliases[h]) { auto[h] = data.aliases[h]; continue }
              // 2. Try case-insensitive alias match
              const hl = h.toLowerCase().trim()
              const aliasMatch = Object.entries(data.aliases).find(([k]) => k.toLowerCase().trim() === hl)
              if (aliasMatch) { auto[h] = aliasMatch[1]; continue }
              // 3. Try label substring match (longest match first)
              let bestKey = '', bestLen = 0
              for (const [key, label] of Object.entries(data.fields)) {
                const ll = label.toLowerCase()
                if (ll.includes(hl) && ll.length > bestLen) { bestKey = key; bestLen = ll.length }
                if (hl.includes(key.replace(/_/g, ' ')) && key.length > bestLen) { bestKey = key; bestLen = key.length }
              }
              if (bestKey) auto[h] = bestKey
            }
            setColumnMapping(auto)
          }
          reader2.readAsText(f.slice(0, 4096))
        }
      }).catch(() => {})
    }
  }

  async function send(path: string) {
    if (!file) return
    const fd = new FormData(); fd.append('file', file)
    if (Object.keys(columnMapping).length > 0) fd.append('column_mapping', JSON.stringify(columnMapping))
    setError(null); setMessage(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await api.post<any>(`${path}?mode=${mode}`, fd)
      if (path.includes('preview')) {
        setPreview(result)
        if (result.mapeo) {
          setColumnMapping(prev => Object.keys(prev).length > 0 ? prev : result.mapeo || {})
        }
        // Open mapping modal for review
        if (result.columnas && result.columnas.length > 0) {
          setShowMappingModal(true)
        }
        // Load field labels if not loaded
        if (Object.keys(fieldLabels).length === 0) {
          api.get<{fields: Record<string, string>; aliases: Record<string, string>}>('/import/fields').then(data => {
            setFieldLabels(data.fields)
            setColumnAliases(data.aliases)
          }).catch(() => {})
        }
      }
      else {
        setMessage(`Importación completada. Insertados: ${result.insertados}. Actualizados: ${result.actualizados || 0}. Omitidos: ${result.omitidos?.length || 0}.`)
        toast.success(`Importación completada. Insertados: ${result.insertados}, Actualizados: ${result.actualizados || 0}`)
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); toast.error('Error en importación') }
  }
  return <>
    <PageHeader title="Importar" subtitle="Selecciona un archivo Excel o CSV. Se detectarán las columnas y podrás revisar el mapeo antes de importar." />
    <section className="card">
      <div className="form-grid two">
        <div className="field"><label>Archivo Excel/CSV</label><input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={e => handleFileChange(e.target.files?.[0] || null)} /></div>
        <div className="field"><label>Modo</label><select className="select" value={mode} onChange={e => setMode(e.target.value)}><option value="create_only">Crear solo nuevos</option><option value="update_existing">Actualizar existentes</option><option value="upsert">Crear nuevos y actualizar existentes</option></select></div>
        <div className="toolbar" style={{ alignSelf: 'end' }}>          <button className="btn" onClick={() => send('/import/preview')} disabled={!file}><UploadCloud size={16}/> Importar</button></div>
      </div>
      <p className="muted mt-2">Columnas esperadas: Nº presupuesto FactuSOL, Cliente, Obra / referencia, Gestor, Fecha presupuesto, Importe, Estado. Para actualizar, incluye columna <strong>version</strong>.</p>
    </section>

    {error && <div className="error mt-4">{error}</div>}
    {message && <div className="success mt-4">{message}</div>}

    {/* Warning: check mapping before confirming */}
    {preview && preview.errores.length > 0 && (
      <div className="notice mt-4 flex items-start gap-2">
        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-warning" />
        <div>
          <strong>Revisa el mapeo de columnas antes de confirmar.</strong>{' '}
          Algunas columnas pueden no haberse detectado correctamente. Usa "Simular y comparar" después de ajustar el mapeo.
        </div>
      </div>
    )}

    {/* Preview / Comparativa */}
    {preview && <section className="mt-4 space-y-4">
      {/* Resumen KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiTile label="Filas totales" value={preview.total_filas} color="default" />
        <KpiTile label="Válidos" value={preview.validos} color="green" />
        <KpiTile label="Nuevos" value={preview.nuevos} color="blue" subtitle="Se crearán" />
        <KpiTile label="Actualizables" value={preview.actualizables} color="purple" subtitle="Se modificarán" />
        <KpiTile label="Duplicados" value={preview.duplicados_bd.length} color={preview.duplicados_bd.length > 0 ? 'yellow' : 'default'} subtitle="Ya existen" />
        <KpiTile label="Errores" value={preview.errores.length} color={preview.errores.length > 0 ? 'red' : 'default'} subtitle="No importables" />
      </div>

      {/* Botón ver datos */}
      {preview.preview.length > 0 && (
        <button className="btn secondary" onClick={() => setShowDataModal(true)}>
          <Table size={16} /> Ver datos ({preview.preview.length} filas)
        </button>
      )}

      {/* Duplicados */}
      {!!preview.duplicados_bd.length && (
        <div className="notice flex items-start gap-2">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <strong>{preview.duplicados_bd.length} presupuestos ya existen en la BD:</strong>{' '}
            {preview.duplicados_bd.slice(0, 30).join(', ')}
            {preview.duplicados_bd.length > 30 && ` ...y ${preview.duplicados_bd.length - 30} más`}
          </div>
        </div>
      )}

      {/* Errores */}
      {!!preview.errores.length && (
        <div className="error flex items-start gap-2">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <strong>{preview.errores.length} errores encontrados:</strong>
            <ul className="mt-1 list-disc pl-4">
              {preview.errores.slice(0, 8).map((e, i) => (
                <li key={i}>Fila {e.fila}: {e.error}</li>
              ))}
              {preview.errores.length > 8 && <li>...y {preview.errores.length - 8} más</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Cambios detectados */}
      {!!preview.cambios_preview.length && (
        <div className="card">
          <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">
            📋 Cambios detectados ({preview.cambios_preview.length} presupuestos)
          </h3>
          <div className="flex flex-col gap-3">
            {preview.cambios_preview.map(c => (
              <div key={c.numero_presupuesto} className="border border-border rounded-lg p-3 bg-surface-panel">
                <div className="font-mono text-sm font-semibold text-brand mb-2">{c.numero_presupuesto}</div>
                <div className="flex flex-col gap-1">
                  {c.cambios.map((ch, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-ink-muted font-medium min-w-[120px]">{ch.campo}:</span>
                      <span className="text-danger line-through bg-red-50 px-1.5 py-0.5 rounded text-xs max-w-[200px] truncate" title={ch.antes}>
                        {ch.antes || '—'}
                      </span>
                      <ArrowRight size={12} className="text-ink-muted flex-shrink-0" />
                      <span className="text-success font-semibold bg-green-50 px-1.5 py-0.5 rounded text-xs max-w-[200px] truncate" title={ch.despues}>
                        {ch.despues || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sin cambios pero actualizables */}
      {preview.cambios_preview.length === 0 && preview.actualizables > 0 && (
        <div className="notice flex items-center gap-2">
          <CheckCircle2 size={16} />
          {preview.actualizables} presupuestos actualizables sin cambios detectados (mismos valores).
        </div>
      )}
    </section>}

    {/* Modal de datos */}
    {showDataModal && preview && preview.preview.length > 0 && (() => {
      const allCols = Object.keys(preview.preview[0] || {})
      const visibleCols = selectedCols.size > 0 ? allCols.filter(c => selectedCols.has(c)) : allCols
      return (
      <Modal open onClose={() => { setShowDataModal(false); setSelectedCols(new Set()) }} title={`Datos a importar (${preview.preview.length} filas)`}>
        <details className="column-panel mb-3">
          <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink flex items-center gap-1">
            <Columns3 size={14} /> Columnas visibles ({visibleCols.length}/{allCols.length})
          </summary>
          <div className="flex flex-wrap gap-2 mt-2">
            <button className="text-xs text-brand hover:underline" onClick={() => setSelectedCols(new Set(allCols))}>Todas</button>
            <button className="text-xs text-ink-muted hover:underline" onClick={() => setSelectedCols(new Set())}>Ninguna (mostrar todas)</button>
            {allCols.map(col => (
              <label key={col} className="check text-xs">
                <input
                  type="checkbox"
                  checked={selectedCols.size === 0 || selectedCols.has(col)}
                  onChange={() => {
                    setSelectedCols(prev => {
                      const next = new Set(prev.size === 0 ? new Set(allCols) : prev)
                      if (next.has(col)) next.delete(col)
                      else next.add(col)
                      return next
                    })
                  }}
                /> {col}
              </label>
            ))}
          </div>
        </details>
        <div className="table-wrap" style={{ maxHeight: '50vh', overflow: 'auto' }}>
          <table style={{ minWidth: 'auto' }}>
            <thead>
              <tr>
                {visibleCols.map(k => (
                  <th key={k} className="text-xs whitespace-nowrap sticky top-0 bg-surface-panel">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.preview.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-surface-panel' : ''}>
                  {visibleCols.map(col => (
                    <td key={col} className="text-xs whitespace-nowrap">{row[col] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
      )
    })()}

    {/* Modal de mapeo de columnas */}
    {showMappingModal && preview?.columnas && (
      <Modal open onClose={() => setShowMappingModal(false)} title="Revisar mapeo de columnas">
        <p className="text-sm text-ink-muted mb-4">
          Verifica que cada columna del Excel se asigne al campo correcto. Ajusta los que estén mal antes de importar.
        </p>
        <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto">
          {preview.columnas.map(col => {
            const mapped = columnMapping[col] || preview.mapeo?.[col] || ''
            const isRequired = ['numero_presupuesto','cliente','obra_referencia','gestor','fecha_presupuesto','importe','estado'].includes(mapped)
            return (
              <div key={col} className="flex items-center gap-3 p-2 bg-surface-panel rounded-lg border border-border">
                <span className="text-xs font-mono text-ink min-w-[140px] max-w-[200px] truncate" title={col}>{col}</span>
                <ArrowRight size={12} className="text-ink-muted flex-shrink-0" />
                <select
                  className="select flex-1 text-xs"
                  value={mapped}
                  onChange={e => setColumnMapping(prev => ({ ...prev, [col]: e.target.value }))}
                >
                  <option value="">— Ignorar columna —</option>
                  {Object.entries(fieldLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                {!mapped && <span className="text-xs text-warning">⚠️ Sin mapear</span>}
                {isRequired && <span className="badge text-xs" style={{color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca'}}>Requerido</span>}
              </div>
            )
          })}
        </div>
        <div className="modal-actions">
          <button className="btn secondary" onClick={() => setShowMappingModal(false)}>Cancelar</button>
          <button className="btn secondary" onClick={async () => {
            setShowMappingModal(false)
            await send('/import/preview')
          }}><FileSearch size={16} /> Revisar de nuevo</button>
          <button className="btn" onClick={() => { setShowMappingModal(false); send('/import/confirm') }}><UploadCloud size={16} /> Confirmar</button>
        </div>
      </Modal>
    )}
  </>
}

function KpiTile({ label, value, color, subtitle }: { label: string; value: number; color: string; subtitle?: string }) {
  const colors: Record<string, string> = {
    default: 'text-ink', green: 'text-success', blue: 'text-blue-600',
    purple: 'text-purple-600', yellow: 'text-yellow-600', red: 'text-danger',
  }
  const bgColors: Record<string, string> = {
    default: '', green: 'border-l-success', blue: 'border-l-blue-500',
    purple: 'border-l-purple-500', yellow: 'border-l-yellow-500', red: 'border-l-danger',
  }
  return (
    <div className={`card p-3 text-center ${bgColors[color] || ''}`} style={color !== 'default' ? { borderLeftWidth: '2px' } : {}}>
      <div className={`text-2xl font-black ${colors[color] || colors.default}`}>{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
      {subtitle && <div className="text-xs text-ink-muted mt-0.5">{subtitle}</div>}
    </div>
  )
}
