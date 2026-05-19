export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, message: string, payload?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export function wsUrl(path: string) {
  const target = path.startsWith('/') ? path : `/${path}`
  if (API_BASE_URL) {
    const url = new URL(target, API_BASE_URL)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.toString()
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${target}`
}

type ApiFetchOptions = RequestInit & {
  token?: string | null
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}) {
  const { token, headers, ...init } = options
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : null

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'detail' in payload
        ? String(payload.detail)
        : typeof payload === 'object' && payload && 'message' in payload
          ? String(payload.message)
          : `HTTP ${response.status}`
    throw new ApiError(response.status, message, payload)
  }

  return payload as T
}
