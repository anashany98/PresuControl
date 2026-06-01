import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console for now; production should POST to /api/errors/endpoint (TODO: BUG-39 enhancement)
    console.error('ErrorBoundary caught:', error, errorInfo)
    // Expose for E2E tests and external reporting
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:error', { detail: { error, errorInfo } }))
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="auth-page">
          <div className="card max-w-md">
            <h2 className="text-xl font-bold mb-4 text-danger">Algo salió mal</h2>
            <p className="text-stone-600 mb-4">
              Ha ocurrido un error inesperado. Si recargar no funciona, intenta reintentar.
            </p>
            {this.state.error && (
              <details className="mb-4 text-xs text-stone-500">
                <summary className="cursor-pointer">Detalles técnicos</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-2">
              <button
                onClick={this.reset}
                className="btn flex-1"
                data-testid="error-boundary-retry"
              >
                Reintentar
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn btn-secondary flex-1"
              >
                Recargar página
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}