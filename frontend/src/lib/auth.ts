import { apiFetch } from '@/lib/api'

export const TOKEN_KEY = 'swarmcam_jwt'

export type AuthUser = {
  username: string
  role: 'admin' | 'viewer' | string
}

export type LoginRequest = {
  user: string
  password: string
}

export type LoginResponse = {
  token: string
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function loginRequest(body: LoginRequest) {
  return apiFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function fetchCurrentUser(token: string) {
  return apiFetch<AuthUser>('/api/auth/me', { token })
}
