import { api, type MetadataOptions } from './api'
import { useData } from './useData'

const EMPTY_OPTIONS: MetadataOptions = { gestores: [], proveedores: [] }

export function useMetadataOptions() {
  const { data } = useData<MetadataOptions>(() => api.getMetadataOptions(), [])
  return data || EMPTY_OPTIONS
}
