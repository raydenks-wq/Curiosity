import { httpAdapter } from './adapters/httpAdapter'
import { localAdapter } from './adapters/localAdapter'

const adapterMode = import.meta.env.VITE_API_ADAPTER || 'local'

const adapters = {
  local: localAdapter,
  http: httpAdapter,
}

const fallbackAdapter = localAdapter
export const apiClient = adapters[adapterMode] || fallbackAdapter
export const currentApiAdapter = adapterMode
