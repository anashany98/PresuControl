import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

type Props = {
  label: string
  children: ReactNode
  error?: string | null
  required?: boolean
}

export function InlineField({ label, children, error, required }: Props) {
  return (
    <div className={`field${error ? ' field-error' : ''}`}>
      <label>
        {label}
        {required && <span className="required-mark"> *</span>}
      </label>
      {children}
      {error && (
        <span className="field-error-msg">
          <AlertCircle size={12} /> {error}
        </span>
      )}
    </div>
  )
}