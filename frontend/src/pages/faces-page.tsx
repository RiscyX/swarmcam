import { useEffect, useRef, useState } from 'react'

import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { ApiError } from '@/lib/api'
import { createFace, deleteFace, faceThumbnailUrl, getFaces, registerFace, type FaceEntry } from '@/lib/faces'
import { cn } from '@/lib/utils'

export function FacesPage() {
  const { token } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepth = useRef(0)
  const [faces, setFaces] = useState<FaceEntry[]>([])
  const [disabled, setDisabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // New face dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [createError, setCreateError] = useState<string | null>(null)

  // Upload / delete
  const [uploadTarget, setUploadTarget] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

  async function load() {
    if (!token) return
    setLoading(true)
    try {
      const data = await getFaces(token)
      setFaces(
        Object.entries(data)
          .map(([name, v]) => ({ name, files: Array.isArray(v) ? v : (v.files ?? []) }))
      )
      setDisabled(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setDisabled(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [token])

  async function handleCreate() {
    if (!token || !newName.trim() || busy) return
    setBusy(true)
    setCreateError(null)
    try {
      await createFace(token, newName.trim())
      for (const file of pendingFiles) {
        await registerFace(token, newName.trim(), file)
      }
      setCreateOpen(false)
      setNewName('')
      setPendingFiles([])
      await load()
    } catch {
      setCreateError('Could not create the face or register the images — check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!token || !uploadTarget || !e.target.files?.[0]) return
    setBusy(true)
    setUploadError(null)
    try {
      await registerFace(token, uploadTarget, e.target.files[0])
      await load()
    } catch {
      setUploadError(`Image registration failed for ${uploadTarget} — check the connection and try again.`)
    } finally {
      setBusy(false)
      setUploadTarget(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete() {
    if (!token || !confirmDelete || busy) return
    setBusy(true)
    setDeleteError(null)
    try {
      await deleteFace(token, confirmDelete)
      setConfirmDelete(null)
      await load()
    } catch {
      setDeleteError(`Delete failed for ${confirmDelete} — check the connection and try again.`)
    } finally {
      setBusy(false)
    }
  }

  function openCreate() {
    setPendingFiles([])
    setCreateError(null)
    setCreateOpen(true)
  }

  function closeCreate() {
    setCreateOpen(false)
    setCreateError(null)
    setPendingFiles([])
  }

  function closeDelete() {
    setConfirmDelete(null)
    setDeleteError(null)
  }

  function handleDragEnter(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    dragDepth.current += 1
    setDragActive(true)
  }

  function handleDragOver(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault()
  }

  function handleDragLeave(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragActive(false)
    }
  }

  function handleDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setPendingFiles(files)
    setCreateError(null)
    setCreateOpen(true)
  }

  if (loading) return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-[2px] rounded-sm border border-[var(--border)] bg-[var(--border)] p-[2px]">
      {[0, 1, 2, 3].map((i) => <Skeleton className="aspect-square w-full" key={i} />)}
    </div>
  )

  if (disabled) return (
    <EmptyState
      description="Frigate does not support it, or it is not enabled."
      title="Face recognition is not available"
      variant="error"
    />
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Header action */}
      <div className="flex items-center justify-end">
        <Button className="h-9 px-4" onClick={openCreate}>
          New face
        </Button>
      </div>

      {/* Hidden upload input */}
      <input accept="image/*" onChange={handleUpload} ref={fileInputRef} style={{ display: 'none' }} type="file" />

      {/* Upload error */}
      {uploadError ? (
        <p className="rounded-sm border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 font-mono text-xs text-[var(--status-error)]" role="alert">
          {uploadError}
        </p>
      ) : null}

      {faces.length === 0 ? (
        <EmptyState
          action={<Button className="h-9" onClick={openCreate}>New face</Button>}
          description="Register a face and add 5–15 cropped images so Frigate can build a usable embedding."
          icon={<Plus className="h-6 w-6" />}
          title="No registered faces"
        />
      ) : (
        <div className="overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--border)]">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-[2px] p-[2px]">
            {faces.map((face) => (
              <div className="flex min-w-0 flex-col bg-[var(--bg-surface)]" key={face.name}>
                <div className="aspect-square w-full overflow-hidden bg-[var(--bg-tile)]">
                  {face.files.length > 0 ? (
                    <img
                      alt={face.name}
                      className="h-full w-full object-cover [filter:grayscale(1)_contrast(1.08)]"
                      src={faceThumbnailUrl(face.name)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-mono text-5xl font-bold text-[var(--fg-dim)]">
                      {face.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="truncate text-[13px] font-extrabold tracking-[0.04em] text-[var(--fg)]">{face.name}</div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
                    {face.files.length} IMAGES
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Button
                      className="h-9 flex-1 px-2"
                      disabled={busy}
                      onClick={() => { setUploadError(null); setUploadTarget(face.name); fileInputRef.current?.click() }}
                      size="sm"
                      variant="outline"
                    >
                      Add
                    </Button>
                    <Button
                      aria-label={`Delete ${face.name}`}
                      className="h-9 w-9 shrink-0 p-0"
                      disabled={busy}
                      onClick={() => { setConfirmDelete(face.name); setDeleteError(null) }}
                      size="icon"
                      variant="destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {/* New face tile */}
            <button
              aria-label="New face"
              className={cn(
                'flex min-h-[120px] flex-col items-center justify-center gap-1 border-l-2 border-dashed p-3 transition-colors',
                dragActive
                  ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]'
                  : 'border-[var(--border-raised)] bg-[var(--bg-surface)] hover:border-[var(--accent)]',
              )}
              onClick={openCreate}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              type="button"
            >
              <Plus className="pointer-events-none h-5 w-5 text-[var(--fg-muted)]" />
              <span className="pointer-events-none font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--fg-secondary)]">
                New face
              </span>
              <span className="pointer-events-none font-mono text-[10px] text-[var(--fg-dim)]">drop images here</span>
            </button>
          </div>
        </div>
      )}

      {/* New face dialog */}
      <Dialog
        confirmLabel={busy ? 'Creating…' : 'Create'}
        description="Give the face a name. 5–15 cropped images are needed for a usable embedding."
        onClose={closeCreate}
        onConfirm={() => void handleCreate()}
        open={createOpen}
        title="New face"
      >
        <div className="-mx-5 -mt-4">
          <Label htmlFor="new-face-name">Name</Label>
          <Input
            autoComplete="off"
            id="new-face-name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
            placeholder="e.g. Richard"
            value={newName}
          />
          {pendingFiles.length > 0 ? (
            <p className="mt-2 font-mono text-xs text-[var(--fg-muted)]">
              {pendingFiles.length} dropped image{pendingFiles.length !== 1 ? 's' : ''} will be registered after creating the face.
            </p>
          ) : null}
          {createError ? (
            <p className="mt-3 font-mono text-xs text-[var(--status-error)]" role="alert">
              {createError}
            </p>
          ) : null}
        </div>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        cancelLabel="Cancel"
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
        description="The face and all its registered images are removed from Frigate. This cannot be undone."
        onClose={closeDelete}
        onConfirm={() => void handleDelete()}
        open={Boolean(confirmDelete)}
        title="Delete face"
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
