import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PulseDot } from '@/components/ui/pulse-dot'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusPill } from '@/components/ui/status-pill'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/hooks/use-auth'
import { ApiError } from '@/lib/api'
import { changePassword, createUser, deleteUser, getUsers, type FrigateUser } from '@/lib/users'

function roleTone(role: string): 'admin' | 'offline' {
  return role === 'admin' ? 'admin' : 'offline'
}

export function UsersPage() {
  const { token, user: currentUser } = useAuth()
  const [users, setUsers] = useState<FrigateUser[]>([])
  const [forbidden, setForbidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Create user dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('viewer')
  const [createError, setCreateError] = useState<string | null>(null)

  // Change password dialog
  const [pwTarget, setPwTarget] = useState<string | null>(null)
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)

  // Delete confirm dialog
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
    if (!token || !newUsername.trim() || !newPassword || busy) return
    setBusy(true)
    setCreateError(null)
    try {
      await createUser(token, newUsername.trim(), newPassword, newRole)
      setCreateOpen(false)
      setNewUsername(''); setNewPassword(''); setNewRole('viewer')
      await load()
    } catch {
      setCreateError('User creation failed — check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleChangePw() {
    if (!token || !pwTarget || busy) return
    if (!newPw) { setPwError('Password cannot be empty.'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return }
    setBusy(true)
    setPwError(null)
    try {
      await changePassword(token, pwTarget, newPw)
      setPwTarget(null); setNewPw(''); setConfirmPw('')
    } catch {
      setPwError('Password change failed — check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!token || !confirmDelete || busy) return
    setBusy(true)
    setDeleteError(null)
    try {
      await deleteUser(token, confirmDelete)
      setConfirmDelete(null)
      await load()
    } catch {
      setDeleteError('Delete failed — the user could not be removed from Frigate. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  function closeCreate() {
    setCreateOpen(false)
    setCreateError(null)
  }

  function closePw() {
    setPwTarget(null)
    setPwError(null)
    setNewPw(''); setConfirmPw('')
  }

  function closeDelete() {
    setConfirmDelete(null)
    setDeleteError(null)
  }

  if (loading) return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => <Skeleton className="h-[46px] w-full" key={i} />)}
    </div>
  )

  if (forbidden) return (
    <EmptyState
      description="User management is only available to admins."
      title="Access denied"
      variant="error"
    />
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Header action */}
      <div className="flex items-center justify-end">
        <Button onClick={() => { setCreateOpen(true); setCreateError(null) }}>
          New user
        </Button>
      </div>

      {/* Desktop — table */}
      <div className="hidden overflow-hidden rounded-sm border border-[var(--border-raised)] md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.username}>
                <TableCell className="font-bold">
                  {u.username}
                  {u.username === currentUser?.username ? (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-dim)]">(you)</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <StatusPill tone={roleTone(u.role)}>{u.role}</StatusPill>
                </TableCell>
                <TableCell variant="mono">—</TableCell>
                <TableCell variant="actions">
                  <Button onClick={() => { setPwTarget(u.username); setNewPw(''); setConfirmPw(''); setPwError(null) }} size="sm" variant="outline">
                    Password
                  </Button>
                  <Button
                    disabled={u.username === currentUser?.username}
                    onClick={() => { setConfirmDelete(u.username); setDeleteError(null) }}
                    size="sm"
                    variant="destructive"
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile — cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {users.map((u) => (
          <div className="overflow-hidden rounded-sm border border-[var(--border-raised)] bg-[var(--bg-surface)]" key={u.username}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <PulseDot animated={false} tone={u.role === 'admin' ? 'accent' : 'offline'} />
              <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg)]">
                {u.username}
                {u.username === currentUser?.username ? ' (you)' : ''}
              </span>
              <StatusPill tone={roleTone(u.role)}>{u.role}</StatusPill>
            </div>
            <div className="grid grid-cols-2 gap-px border-t border-[var(--border-row)] bg-[var(--border-row)]">
              <div className="bg-[var(--bg-surface)] px-3 py-2">
                <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-dim)]">Login</div>
                <div className="font-mono text-xs text-[var(--fg-secondary)]">{u.username}</div>
              </div>
              <div className="bg-[var(--bg-surface)] px-3 py-2">
                <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-dim)]">Role</div>
                <div className="font-mono text-xs text-[var(--fg-secondary)]">{u.role}</div>
              </div>
            </div>
            <div className="border-t border-[var(--border-row)] p-2">
              <Button className="w-full" onClick={() => { setPwTarget(u.username); setNewPw(''); setConfirmPw(''); setPwError(null) }} size="sm" variant="outline">
                Change password
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Create user dialog */}
      <Dialog
        confirmLabel={busy ? 'Creating…' : 'Create'}
        description="The user is created through the Frigate auth API. Roles: admin or viewer."
        onClose={closeCreate}
        onConfirm={() => void handleCreate()}
        open={createOpen}
        title="New user"
      >
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="new-user-username">Username</Label>
            <Input
              autoComplete="off"
              id="new-user-username"
              onChange={(e) => setNewUsername(e.target.value)}
              value={newUsername}
            />
          </div>
          <div>
            <Label htmlFor="new-user-password">Password</Label>
            <Input
              autoComplete="new-password"
              id="new-user-password"
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              value={newPassword}
            />
          </div>
          <div>
            <Label htmlFor="new-user-role">Role</Label>
            <Select id="new-user-role" onChange={(e) => setNewRole(e.target.value)} value={newRole}>
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
            </Select>
          </div>
          {createError ? (
            <p className="font-mono text-xs text-[var(--status-error)]" role="alert">
              {createError}
            </p>
          ) : null}
        </div>
      </Dialog>

      {/* Change password dialog */}
      <Dialog
        confirmLabel={busy ? 'Saving…' : 'Save'}
        description={`Set a new password for ${pwTarget ?? ''}.`}
        onClose={closePw}
        onConfirm={() => void handleChangePw()}
        open={Boolean(pwTarget)}
        title="Change password"
      >
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="change-pw-new">New password</Label>
            <Input
              autoFocus
              autoComplete="new-password"
              id="change-pw-new"
              onChange={(e) => setNewPw(e.target.value)}
              type="password"
              value={newPw}
            />
          </div>
          <div>
            <Label htmlFor="change-pw-confirm">Confirm</Label>
            <Input
              autoComplete="new-password"
              id="change-pw-confirm"
              onChange={(e) => setConfirmPw(e.target.value)}
              type="password"
              value={confirmPw}
            />
          </div>
          {pwError ? (
            <p className="font-mono text-xs text-[var(--status-error)]" role="alert">
              {pwError}
            </p>
          ) : null}
        </div>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        cancelLabel="Cancel"
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
        description="The user immediately loses access and all their Frigate sessions become invalid. This cannot be undone."
        onClose={closeDelete}
        onConfirm={() => void handleDelete()}
        open={Boolean(confirmDelete)}
        title="Delete user"
        variant="destructive"
      >
        {confirmDelete ? (
          <>
            <p className="text-sm text-[var(--fg-secondary)]">
              Are you sure you want to delete{' '}
              <span className="font-mono font-bold text-[var(--fg)]">{confirmDelete}</span>?
            </p>
            {deleteError ? (
              <p className="mt-3 font-mono text-xs text-[var(--status-error)]" role="alert">
                {deleteError}
              </p>
            ) : null}
          </>
        ) : null}
      </Dialog>
    </div>
  )
}
