import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

type Toast = { id: number; message: string; type: ToastType; timeoutId: ReturnType<typeof setTimeout>; action?: { label: string; onClick: () => void } }

type ToastCtx = {
  show: (message: string, type?: ToastType, action?: { label: string; onClick: () => void }) => void
  success: (message: string, action?: { label: string; onClick: () => void }) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastCtx>({ show: () => {}, success: () => {}, error: () => {} })

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const show = useCallback((message: string, type: ToastType = 'info', action?: { label: string; onClick: () => void }) => {
    const id = ++toastId
    const timeoutId = setTimeout(() => remove(id), 5000)
    setToasts(t => [...t, { id, message, type, timeoutId, action }])
  }, [remove])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      toasts.forEach(t => clearTimeout(t.timeoutId))
    }
  }, [toasts])

  return (
    <ToastContext.Provider value={{ show, success: (m, a) => show(m, 'success', a), error: (m) => show(m, 'error') }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' && <CheckCircle2 size={16}/>}
            {t.type === 'error' && <AlertCircle size={16}/>}
            {t.type === 'info' && <AlertCircle size={16}/>}
            <span>{t.message}</span>
            {t.action && <button className="toast-action" onClick={() => { clearTimeout(t.timeoutId); remove(t.id); t.action!.onClick() }}>{t.action.label}</button>}
            <button onClick={() => { clearTimeout(t.timeoutId); remove(t.id) }}><X size={14}/></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}