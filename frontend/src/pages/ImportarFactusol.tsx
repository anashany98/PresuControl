import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle, Download, FileSpreadsheet, RefreshCw, UploadCloud, XCircle } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { api, euro } from '../utils/api'
import { useToast } from '../utils/toast'

type CambiosPreview = {
  numero_presupuesto: string
  cambios: { campo: string; antes?: string; despues?: string }[]
}

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
  cambios_preview: CambiosPreview[]
}

type ImportResult = {
  insertados: number
  actualizados: number
  omitidos: { fila: number; numero_presupuesto: string; motivo: string }[]
}

type ImportMode = 'create_only' | 'update_existing' | 'upsert'

const MODE_LABELS: Record<ImportMode, string> = {
  create_only: 'Crear solo nuevos',
  update_existing: 'Actualizar existentes',
  upsert: 'Crear y actualizar',
}

function DnDZona({ children }: { children: React.ReactNode }) {
  const [drag, setDrag] = useState(false)
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDrag(false)
    const input = e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement
    const f = e.dataTransfer.files[0]
    if (f && input) {
      const dt = new DataTransfer()
      dt.items.add(f)
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, [])
  return (
    <div
      className={`drop-zone ${drag ? 'drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      {children}
    </div>
  )
}

export function ImportarFactusol() {
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<ImportMode>('create_only')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload')
  const [selectedNums, setSelectedNums] = useState<Set<string>>(new Set())

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error('Formato no válido. Usa .xlsx, .xls o .csv')
      return
    }
    setFile(f)
    setPreview(null)
    setResult(null)
  }, [toast])

  const handlePreview = useCallback(async () => {
    if (!file) return
    setLoading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post<Preview>(`/import/preview?mode=${mode}`, fd)
      setPreview(res)
      setStep('preview')
      setSelectedNums(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en simulación')
    } finally {
      setLoading(false)
    }
  }, [file, mode, toast])

  const handleConfirm = useCallback(async () => {
    if (!file) return
    setLoading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post<ImportResult>(`/import/confirm?mode=${mode}`, fd)
      setResult(res)
      setStep('result')
      toast.success(`Importación completada`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en importación')
    } finally {
      setLoading(false)
    }
  }, [file, mode, toast])

  const downloadErrors = useCallback(() => {
    if (!result?.omitidos.length) return
    const csv = ['Fila,Nº presupuesto,Motivo']
    result.omitidos.forEach((o) => csv.push(`${o.fila},${o.numero_presupuesto},"${o.motivo.replace(/"/g, '""')}"`))
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'importacion_errores.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [result])

  const reset = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setSelectedNums(new Set())
    setStep('upload')
  }

  const toggleNum = (num: string) => {
    setSelectedNums((prev) => {
      const next = new Set(prev)
      if (next.has(num)) next.delete(num)
      else next.add(num)
      return next
    })
  }

  return (
    <>
      <PageHeader
        title="Importar desde FactuSOL"
        subtitle="Importa presupuestos desde archivos Excel de FactuSOL con simulación previa y comparación."
        actions={<Link className="btn secondary" to="/importar"><ArrowLeft size={16} />Volver</Link>}
      />
      {step === 'upload' && (
        <section className="card">
          <DnDZona>
            <UploadCloud size={40} />
            <p>Arrastra o selecciona un archivo Excel (.xlsx, .xls) o CSV</p>
            <div className="file-picker-wrap">
              <input
                className="file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
              />
            </div>
          </DnDZona>
          {file && (
            <div className="file-selected">
              <FileSpreadsheet size={20} />
              <span>{file.name}</span>
              <button className="btn secondary" onClick={() => setFile(null)} title="Quitar"><XCircle size={15} /></button>
            </div>
          )}
          {file && (
            <div className="form-grid two" style={{ marginTop: 20 }}>
              <div className="field">
                <label>Modo de importación</label>
                <select className="select" value={mode} onChange={(e) => setMode(e.target.value as ImportMode)}>
                  <option value="create_only">Crear solo nuevos</option>
                  <option value="update_existing">Actualizar existentes</option>
                  <option value="upsert">Crear y actualizar</option>
                </select>
              </div>
            </div>
          )}
          {file && (
            <p className="muted" style={{ marginTop: 8 }}>
              Columnas esperadas: Nº presupuesto FactuSOL, Cliente, Obra / referencia, Gestor, Fecha presupuesto, Importe, Estado.
              Para actualizar existentes incluye columna <strong>version</strong> o <strong>expected_version</strong>.
            </p>
          )}
          {file && (
            <div className="toolbar" style={{ marginTop: 16 }}>
              <button className="btn secondary" onClick={handlePreview} disabled={loading}>
                <RefreshCw size={16} className={loading ? 'spin' : ''} />
                {loading ? 'Simulando...' : 'Simular importación'}
              </button>
            </div>
          )}
        </section>
      )}

      {step === 'preview' && preview && (
        <section className="card">
          <h3><UploadCloud size={18} />Simulación previa</h3>
          <div className="grid cards" style={{ marginTop: 12 }}>
            <div className="card"><strong>{preview.total_filas}</strong><p className="muted">Filas totales</p></div>
            <div className="card"><strong>{preview.validos}</strong><p className="muted">Válidos</p></div>
            <div className="card success"><strong>{preview.nuevos}</strong><p className="muted">Nuevos</p></div>
            <div className="card warning"><strong>{preview.actualizables}</strong><p className="muted">Actualizables</p></div>
            <div className="card"><strong>{preview.duplicados_bd.length}</strong><p className="muted">Ya en sistema</p></div>
            <div className="card error"><strong>{preview.errores.length}</strong><p className="muted">Errores</p></div>
          </div>

          <div className="toolbar" style={{ marginTop: 16 }}>
            <span className="muted">Modo: <strong>{MODE_LABELS[mode]}</strong></span>
          </div>

          {preview.nuevos > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4>Nuevos presupuestos ({preview.nuevos})</h4>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Nº FactuSOL</th><th>Cliente</th><th>Obra</th><th>Gestor</th><th>Fecha</th><th>Importe</th><th>Estado</th></tr></thead>
                  <tbody>
                    {preview.preview.map((p, i) => <tr key={i}>
                      <td>{p.numero_presupuesto}</td>
                      <td>{p.cliente}</td>
                      <td>{p.obra_referencia}</td>
                      <td>{p.gestor}</td>
                      <td>{p.fecha_presupuesto}</td>
                      <td className="money">{euro(Number(p.importe))}</td>
                      <td>{p.estado}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.actualizables > 0 && preview.cambios_preview.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4>Comparación (Excel vs Sistema) — {preview.actualizables} actualizables</h4>
              <div className="comparison-list">
                {preview.cambios_preview.map((c) => (
                  <div key={c.numero_presupuesto} className={`comparison-item ${c.cambios.length > 0 ? 'has-diff' : 'no-diff'}`}>
                    <div className="comparison-header">
                      <strong>{c.numero_presupuesto}</strong>
                      {c.cambios.length > 0
                        ? <span className="badge warning">Con cambios</span>
                        : <span className="badge success">Sin cambios</span>}
                    </div>
                    <div className="comparison-body">
                      {c.cambios.length === 0
                        ? <p className="muted">Sin diferencias relevantes</p>
                        : c.cambios.map((ch, j) => (
                          <div key={j} className="diff-row">
                            <span className="diff-field">{ch.campo}</span>
                            <span className="diff-before">{ch.antes || '—'}</span>
                            <span className="diff-arrow">→</span>
                            <span className="diff-after">{ch.despues || '—'}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.errores.length > 0 && (
            <div className="error" style={{ marginTop: 16 }}>
              <AlertTriangle size={16} />Errores detectados:
              <ul style={{ margin: '8px 0 0 20px' }}>
                {preview.errores.slice(0, 10).map((e, i) => <li key={i}>Fila {e.fila}: {e.error}</li>)}
              </ul>
            </div>
          )}

          {preview.duplicados_bd.length > 0 && (
            <div className="notice" style={{ marginTop: 16 }}>
              Ya existen en sistema ({preview.duplicados_bd.length}): {preview.duplicados_bd.slice(0, 20).join(', ')}
              {preview.duplicados_bd.length > 20 && ` y ${preview.duplicados_bd.length - 20} más`}
            </div>
          )}

          <div className="toolbar" style={{ marginTop: 20 }}>
            <button className="btn secondary" onClick={reset}><ArrowLeft size={16} />Cambiar archivo</button>
            <button className="btn" onClick={handleConfirm} disabled={loading || preview.validos === 0}>
              <CheckCircle size={16} />Confirmar importación
            </button>
          </div>
        </section>
      )}

      {step === 'result' && result && (
        <section className="card">
          <h3><CheckCircle size={18} />Resultado de la importación</h3>
          <div className="grid cards" style={{ marginTop: 12 }}>
            <div className="card success"><strong>{result.insertados}</strong><p className="muted">Creados</p></div>
            <div className="card warning"><strong>{result.actualizados}</strong><p className="muted">Actualizados</p></div>
            <div className="card error"><strong>{result.omitidos.length}</strong><p className="muted">Omitidos</p></div>
          </div>

          {result.omitidos.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="toolbar">
                <h4 style={{ margin: 0 }}>Omitidos / errores</h4>
                <button className="btn secondary" onClick={downloadErrors}>
                  <Download size={16} />Descargar CSV errores
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Fila</th><th>Nº FactuSOL</th><th>Motivo</th></tr></thead>
                  <tbody>
                    {result.omitidos.slice(0, 30).map((o, i) => <tr key={i}>
                      <td>{o.fila}</td>
                      <td>{o.numero_presupuesto}</td>
                      <td className="error-text">{o.motivo}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="toolbar" style={{ marginTop: 20 }}>
            <button className="btn secondary" onClick={reset}><RefreshCw size={16} />Nueva importación</button>
            <Link className="btn" to="/presupuestos"><CheckCircle size={16} />Ver presupuestos</Link>
          </div>
        </section>
      )}
    </>
  )
}