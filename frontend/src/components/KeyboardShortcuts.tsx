import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const SHORTCUTS = [
  { keys: '/', description: 'Buscar presupuestos' },
  { keys: 'N', description: 'Nuevo presupuesto' },
  { keys: 'Esc', description: 'Cerrar modal / cancelar' },
  { keys: '?', description: 'Mostrar esta ayuda' },
  { keys: 'g d', description: 'Dashboard' },
  { keys: 'g k', description: 'Kanban' },
  { keys: 'g p', description: 'Presupuestos' },
  { keys: 'g t', description: 'Mi trabajo' },
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
      <div className="modal card max-w-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Atajos de teclado</h3>
          <button className="btn secondary small" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {SHORTCUTS.map(s => (
            <div key={s.keys} className="flex justify-between items-center py-1_5">
              <span className="text-sm text-stone-600">{s.description}</span>
              <kbd className="bg-stone-100 border border-border rounded px-2 py-0_5 font-mono text-xs font-semibold text-ink">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
