import { Eye } from 'lucide-react'

interface AtAGlanceProps {
  text: string
}

export function AtAGlance({ text }: AtAGlanceProps) {
  if (!text) return null

  return (
    <div className="bg-brand-50 border border-brand-100 rounded-lg px-4 py-2.5 mb-4 flex items-center gap-2">
      <Eye size={16} className="text-brand flex-shrink-0" />
      <p className="text-sm text-ink flex-1">{text}</p>
    </div>
  )
}