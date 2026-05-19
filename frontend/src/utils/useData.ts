import { useCallback, useEffect, useState, useRef } from 'react'

export function useData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const reload = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const result = await loader()
      if (!controller.signal.aborted) {
        setData(result)
      }
    }
    catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
    finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, deps)

  useEffect(() => {
    reload()
    return () => { if (abortRef.current) abortRef.current.abort() }
  }, [reload])
  return { data, loading, error, reload, setData }
}