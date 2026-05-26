import { useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, FileSearch, Info, UploadCloud, XCircle } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { api } from '../utils/api'
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
}

export function Importar() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState('create_only')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  async function send(path: string) {
    if (!file) return
    const fd = new FormData(); fd.append('file', file)
    setError(null); setMessage(null)
    try {
      const result = await api.post<any>(`${path}?mode=${mode}`, fd)
      if (path.includes('preview')) setPreview(result)
      else {
        setMessage(`Importación completada. Insertados: ${result.insertados}. Actualizados: ${result.actualizados || 0}. Omitidos: ${result.omitidos?.length || 0}.`)
        toast.success(`Importación completada. Insertados: ${result.insertados}, Actualizados: ${result.actualizados || 0}`)
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); toast.error('Error en importación') }
  }
  return <>
    <PageHeader title="Importar" subtitle="Compara tu Excel/CSV con los presupuestos existentes antes de importar." />
    <section className="card">
      <div className="form-grid two">
        <div className="field"><label>Archivo Excel/CSV</label><input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={e => setFile(e.target.files?.[0] || null)} /></div>
        <div className="field"><label>Modo</label><select className="select" value={mode} onChange={e => setMode(e.target.value)}><option value="create_only">Crear solo nuevos</option><option value="update_existing">Actualizar existentes</option><option value="upsert">Crear nuevos y actualizar existentes</option></select></div>
        <div className="toolbar" style={{ alignSelf: 'end' }}><button className="btn secondary" onClick={() => send('/import/preview')}><FileSearch size={16}/> Simular y comparar</button><button className="btn" onClick={() => send('/import/confirm')}><UploadCloud size={16}/> Confirmar importación</button></div>
      </div>
      <p className="muted mt-2">Columnas esperadas: Nº presupuesto FactuSOL, Cliente, Obra / referencia, Gestor, Fecha presupuesto, Importe, Estado. Para actualizar, incluye columna <strong>version</strong>.</p>
    </section>
    {error && <div className="error mt-4">{error}</div>}
    {message && <div className="success mt-4">{message}</div>}

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
