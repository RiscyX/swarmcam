import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { ApiError } from '@/lib/api'
import { changePassword, createUser, deleteUser, getUsers, type FrigateUser } from '@/lib/faces'

export function UsersPage() {
  const { token, user: currentUser } = useAuth()
  const [users, setUsers] = useState<FrigateUser[]>([])
  const [forbidden, setForbidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Create form
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('viewer')

  // Change password
  const [pwTarget, setPwTarget] = useState<string | null>(null)
  const [newPw, setNewPw] = useState('')

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  async function load() {
    if (!token) return
    setLoading(true)
    try {
      setUsers(await getUsers(token))
      setForbidden(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setForbidden(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [token])

  async function handleCreate() {
    if (!token || !newUsername.trim() || !newPassword) return
    setBusy(true)
    try {
      await createUser(token, newUsername.trim(), newPassword, newRole)
      setNewUsername(''); setNewPassword(''); setNewRole('viewer')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleChangePw() {
    if (!token || !pwTarget || !newPw) return
    setBusy(true)
    try {
      await changePassword(token, pwTarget, newPw)
      setPwTarget(null); setNewPw('')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(username: string) {
    if (!token) return
    setBusy(true)
    try {
      await deleteUser(token, username)
      setConfirmDelete(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="font-mono text-xs text-muted-foreground">Betöltés...</div>

  if (forbidden) return (
    <div className="grid min-h-[300px] place-items-center rounded-sm border border-dashed border-border bg-card/70 p-8 text-center">
      <div>
        <div className="font-ui text-lg font-bold uppercase tracking-[0.14em] text-muted-foreground">Nincs jogosultság</div>
        <p className="mt-2 font-mono text-xs text-muted-foreground">Felhasználókezelés csak adminoknak érhető el.</p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* User table */}
      <div className="overflow-hidden rounded-sm border border-border bg-card">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-border bg-background/60 text-left text-muted-foreground">
              <th className="px-4 py-3 font-bold uppercase tracking-[0.12em]">Felhasználó</th>
              <th className="px-4 py-3 font-bold uppercase tracking-[0.12em]">Szerepkör</th>
              <th className="px-4 py-3 font-bold uppercase tracking-[0.12em]">Műveletek</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr className="border-b border-border last:border-0 hover:bg-white/[0.02]" key={u.username}>
                <td className="px-4 py-3 font-bold text-foreground">
                  {u.username}
                  {u.username === currentUser?.username ? (
                    <span className="ml-2 text-muted-foreground">(te)</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${u.role === 'admin' ? 'border-swarm-amber/40 text-swarm-amber' : 'border-border text-muted-foreground'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button onClick={() => { setPwTarget(u.username); setNewPw('') }} size="sm" variant="outline">
                      Jelszó
                    </Button>
                    <Button
                      className="text-swarm-red hover:border-swarm-red/40"
                      disabled={u.username === currentUser?.username}
                      onClick={() => setConfirmDelete(u.username)}
                      size="sm"
                      variant="outline"
                    >
                      Törlés
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create user */}
      <div className="rounded-sm border border-border bg-card p-4">
        <div className="mb-3 font-ui text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Új felhasználó</div>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-sm border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-swarm-amber"
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Felhasználónév"
            value={newUsername}
          />
          <input
            className="rounded-sm border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-swarm-amber"
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Jelszó"
            type="password"
            value={newPassword}
          />
          <select
            className="rounded-sm border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-swarm-amber"
            onChange={(e) => setNewRole(e.target.value)}
            value={newRole}
          >
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
          <Button disabled={busy || !newUsername.trim() || !newPassword} onClick={() => void handleCreate()} size="sm" variant="default">
            Létrehozás
          </Button>
        </div>
      </div>

      {/* Change password modal */}
      {pwTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="rounded-sm border border-border bg-card p-6">
            <div className="mb-3 font-ui font-bold uppercase tracking-[0.12em]">Jelszó módosítása: {pwTarget}</div>
            <input
              autoFocus
              className="w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-swarm-amber"
              onChange={(e) => setNewPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleChangePw() }}
              placeholder="Új jelszó"
              type="password"
              value={newPw}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button disabled={busy || !newPw} onClick={() => void handleChangePw()} size="sm" variant="default">Mentés</Button>
              <Button onClick={() => setPwTarget(null)} size="sm" variant="outline">Mégse</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirm */}
      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="rounded-sm border border-border bg-card p-6 text-center">
            <p className="font-mono text-sm text-foreground">Biztosan törlöd: <strong>{confirmDelete}</strong>?</p>
            <div className="mt-4 flex justify-center gap-3">
              <Button disabled={busy} onClick={() => void handleDelete(confirmDelete)} variant="destructive">Törlés</Button>
              <Button onClick={() => setConfirmDelete(null)} variant="outline">Mégse</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
