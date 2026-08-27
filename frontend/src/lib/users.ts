import { apiFetch } from '@/lib/api'

export type FrigateUser = { username: string; role: string }

export function getUsers(token: string) {
  return apiFetch<FrigateUser[]>('/api/users', { token })
}

export function createUser(token: string, username: string, password: string, role: string) {
  return apiFetch<{ ok: boolean }>('/api/users', {
    method: 'POST', token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role }),
  })
}

export function changePassword(token: string, username: string, password: string) {
  return apiFetch<{ ok: boolean }>(`/api/users/${encodeURIComponent(username)}/password`, {
    method: 'PUT', token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
}

export function deleteUser(token: string, username: string) {
  return apiFetch<{ ok: boolean }>(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE', token })
}
