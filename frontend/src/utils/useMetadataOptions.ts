import { api, ESTADOS, PRIORIDADES, type MetadataOptions } from './api'
import { useData } from './useData'

/**
 * Boot-time fallback. While `/metadata/options` is loading or fails, the
 * canonical lists for `estados` and `prioridades` are available so consumers
 * (Kanban, Dashboard, formularios) render immediately. Once the API responds,
 * its values win.
 *
 * Single source of truth: `backend/app/schemas.py` (consolidated in A-01).
 */
const EMPTY_OPTIONS: MetadataOptions = {
  gestores: [],
  proveedores: [],
  estados: [...ESTADOS],
  prioridades: [...PRIORIDADES],
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string')
}

export function useMetadataOptions() {
  const { data } = useData<MetadataOptions>(() => api.getMetadataOptions(), [])
  // Merge so we never lose the boot-time fallback for the canonical enums.
  if (!data) return EMPTY_OPTIONS
  return {
    ...EMPTY_OPTIONS,
    ...data,
    estados: isStringList(data.estados) && data.estados.length > 0 ? data.estados : EMPTY_OPTIONS.estados,
    prioridades: isStringList(data.prioridades) && data.prioridades.length > 0 ? data.prioridades : EMPTY_OPTIONS.prioridades,
  }
}
