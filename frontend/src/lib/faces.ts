import { apiFetch, apiUrl } from '@/lib/api'

export type FaceEntry = { name: string; files: string[] }

export type FrigateUser = { username: string; role: string }

export function getFaces(token: string) {
  return apiFetch<Record<string, { files: string[] }>>('/api/faces', { token })
}

export function createFace(token: string, name: string) {
  return apiFetch<{ ok: boolean }>(`/api/faces/${encodeURIComponent(name)}/create`, { method: 'POST', token })
}

export function registerFace(token: string, name: string, file: File) {
  const body = new FormData()
  body.append('file', file)
  return apiFetch<{ ok: boolean }>(`/api/faces/${encodeURIComponent(name)}/register`, { method: 'POST', token, body })
}

export function deleteFace(token: string, name: string) {
  return apiFetch<{ ok: boolean }>(`/api/faces/${encodeURIComponent(name)}`, { method: 'DELETE', token })
}

export function faceThumbnailUrl(name: string) {
  return apiUrl(`/api/faces/${encodeURIComponent(name)}/thumbnail`)
}

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
