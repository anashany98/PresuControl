import { useState } from 'react'
import { X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AlertaDashboard } from '../utils/dashboard'

interface AlertBannerProps {
  alerta: AlertaDashboard
}

const DISMISS_KEY = 'alertBannerDismissed'

export function AlertBanner({ alerta }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(DISMISS_KEY) === 'true'
  })

  if (!alerta.tipo || dismissed) return null

  const isCritico = alerta.tipo === 'critico'

  return (
    <div
      className="rounded-lg p-4 mb-4 flex items-start justify-between gap-3"
      style={{
        backgroundColor: isCritico ? '#fef2f2' : '#fff7ed',
        borderWidth: '1px',
        borderColor: isCritico ? '#fecaca' : '#fed7aa',
      }}
    >
      <div className="flex-1">
        <p className="text-sm font-semibold truncate" style={{ color: isCritico ? '#dc2626' : '#f97316' }}>
          {alerta.mensaje}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          to="/presupuestos?prioridad=Crítico&ocultar_cerrados=true&sort_by=prioridad&sort_dir=desc"
          className="text-xs px-3 py-1 rounded font-medium transition-colors"
          style={{
            backgroundColor: isCritico ? '#dc2626' : '#f97316',
            color: '#ffffff',
          }}
        >
          Ver críticos
        </Link>
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, 'true')
            setDismissed(true)
          }}
          className="p-1 rounded hover:opacity-70 transition-opacity"
          style={{ color: isCritico ? '#dc2626' : '#f97316' }}
          aria-label="Dismiss alert"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}