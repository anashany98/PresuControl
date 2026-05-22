import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const SHORTCUTS = [
  { keys: '/', description: 'Buscar presupuestos' },
  { keys: 'N', description: 'Nuevo presupuesto' },
  { keys: 'Esc', description: 'Cerrar modal / cancelar' },
  { keys: '?', description: 'Mostrar esta ayuda' },
]

export function useKeyboardShortcuts() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        setOpen(v => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return { open, setOpen }
}

export function KeyboardShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Atajos de teclado</h3>
          <button className="btn secondary small" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SHORTCUTS.map(s => (
            <div key={s.keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{s.description}</span>
              <kbd style={{
                background: 'var(--line)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '2px 8px',
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                fontWeight: 600, color: 'var(--text)',
              }}>{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
