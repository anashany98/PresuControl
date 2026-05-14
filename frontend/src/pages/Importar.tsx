import { useState } from 'react'
import { UploadCloud } from 'lucide-react'
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
    <PageHeader title="Importar" subtitle="Importación avanzada desde Excel o CSV con simulación, duplicados y actualización segura por versión." />
    <section className="card">
      <div className="form-grid two">
        <div className="field"><label>Archivo Excel/CSV</label><input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={e => setFile(e.target.files?.[0] || null)} /></div>
        <div className="field"><label>Modo</label><select className="select" value={mode} onChange={e => setMode(e.target.value)}><option value="create_only">Crear solo nuevos</option><option value="update_existing">Actualizar existentes</option><option value="upsert">Crear nuevos y actualizar existentes</option></select></div>
        <div className="toolbar" style={{ alignSelf: 'end' }}><button className="btn secondary" onClick={() => send('/import/preview')}><UploadCloud size={16}/>Simular importación</button><button className="btn" onClick={() => send('/import/confirm')}>Confirmar</button></div>
      </div>
      <p className="muted">Columnas esperadas: Nº presupuesto FactuSOL, Cliente, Obra / referencia, Gestor, Fecha presupuesto, Importe, Estado. Para actualizar existentes, incluye columna <strong>version</strong> o <strong>expected_version</strong> exportada desde la tabla.</p>
    </section>
    {error && <div className="error" style={{ marginTop: 14 }}>{error}</div>}
    {message && <div className="success" style={{ marginTop: 14 }}>{message}</div>}
    {preview && <section className="card" style={{ marginTop: 16 }}><h3>Resumen previo</h3>
      <div className="grid cards">
        <div className="card"><strong>{preview.total_filas}</strong><p className="muted">Filas totales</p></div>
        <div className="card"><strong>{preview.validos}</strong><p className="muted">Válidos</p></div>
        <div className="card"><strong>{preview.nuevos}</strong><p className="muted">Nuevos</p></div>
        <div className="card"><strong>{preview.actualizables}</strong><p className="muted">Actualizables</p></div>
        <div className="card"><strong>{preview.duplicados_bd.length}</strong><p className="muted">Duplicados BD</p></div>
        <div className="card"><strong>{preview.errores.length}</strong><p className="muted">Errores</p></div>
      </div>
      {!!preview.duplicados_bd.length && <div className="notice" style={{ marginTop: 12 }}>Duplicados BD: {preview.duplicados_bd.slice(0, 30).join(', ')}{preview.duplicados_bd.length > 30 ? '...' : ''}</div>}
      {!!preview.duplicados_archivo.length && <div className="notice" style={{ marginTop: 12 }}>Duplicados archivo: {preview.duplicados_archivo.join(', ')}</div>}
      {!!preview.errores.length && <div className="error" style={{ marginTop: 12 }}>{preview.errores.slice(0, 8).map(e => `Fila ${e.fila}: ${e.error}`).join(' | ')}</div>}
      {!!preview.cambios_preview.length && <div className="card" style={{ marginTop: 14 }}><h3>Cambios detectados</h3><div className="timeline">{preview.cambios_preview.map(c => <div className="timeline-item" key={c.numero_presupuesto}><strong>{c.numero_presupuesto}</strong><br/><small>{c.cambios.map(x => `${x.campo}: ${x.antes || '—'} → ${x.despues || '—'}`).join(' · ') || 'Sin cambios relevantes'}</small></div>)}</div></div>}
    </section>}
  </>
}
