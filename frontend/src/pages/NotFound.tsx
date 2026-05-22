import { Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'

export function NotFound() {
  return (
    <>
      <PageHeader title="404" subtitle="Pagina no encontrada" />
      <div className="empty-state">
        <div className="empty-state-icon">
          <FileQuestion size={36} />
        </div>
        <h3>Esta pagina no existe</h3>
        <p>La URL que buscas no corresponde a ninguna seccion de PresuControl. Puede que el enlace este roto o que la pagina haya sido movida.</p>
        <div className="empty-state-actions">
          <Link className="btn" to="/">Volver al Dashboard</Link>
          <Link className="btn secondary" to="/presupuestos">Ver presupuestos</Link>
        </div>
      </div>
    </>
  )
}
