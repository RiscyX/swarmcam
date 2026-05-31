import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { ApiError } from '@/lib/api'
import { createFace, deleteFace, faceThumbnailUrl, getFaces, registerFace, type FaceEntry } from '@/lib/faces'

export function FacesPage() {
  const { token } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [faces, setFaces] = useState<FaceEntry[]>([])
  const [disabled, setDisabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [uploadTarget, setUploadTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  async function load() {
    if (!token) return
    setLoading(true)
    try {
      const data = await getFaces(token)
      setFaces(Object.entries(data).map(([name, v]) => ({ name, files: v.files ?? [] })))
      setDisabled(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setDisabled(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [token])

  async function handleCreate() {
    if (!token || !newName.trim()) return
    setBusy(true)
    try {
      await createFace(token, newName.trim())
      setNewName('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!token || !uploadTarget || !e.target.files?.[0]) return
    setBusy(true)
    try {
      await registerFace(token, uploadTarget, e.target.files[0])
      await load()
    } finally {
      setBusy(false)
      setUploadTarget(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(name: string) {
    if (!token) return
    setBusy(true)
    try {
      await deleteFace(token, name)
      setConfirmDelete(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="font-mono text-xs text-muted-foreground">Betöltés...</div>

  if (disabled) return (
    <div className="grid min-h-[300px] place-items-center rounded-sm border border-dashed border-border bg-card/70 p-8 text-center">
      <div>
        <div className="font-ui text-lg font-bold uppercase tracking-[0.14em] text-muted-foreground">Arcfelismerés nem elérhető</div>
        <p className="mt-2 font-mono text-xs text-muted-foreground">A Frigate nem támogatja, vagy nincs engedélyezve.</p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Add face */}
      <div className="flex gap-2 rounded-sm border border-border bg-card p-3">
        <input
          className="flex-1 rounded-sm border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-swarm-amber"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
          placeholder="Új arc neve..."
          value={newName}
        />
        <Button disabled={busy || !newName.trim()} onClick={() => void handleCreate()} size="sm" variant="default">
          Létrehozás
        </Button>
      </div>

      {/* Face list */}
      <input accept="image/*" onChange={handleUpload} ref={fileInputRef} style={{ display: 'none' }} type="file" />

      {faces.length === 0 ? (
        <div className="grid min-h-[200px] place-items-center rounded-sm border border-dashed border-border bg-card/70">
          <p className="font-mono text-xs text-muted-foreground">Nincsenek arctanúk. Hozz létre egyet fent.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {faces.map((face) => (
            <div className="overflow-hidden rounded-sm border border-border bg-card" key={face.name}>
              <img alt={face.name} className="aspect-square w-full object-cover" src={faceThumbnailUrl(face.name)} />
              <div className="p-2">
                <div className="truncate font-ui font-bold tracking-[0.06em] text-foreground">{face.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{face.files.length} kép</div>
                <div className="mt-2 flex gap-1.5">
                  <Button
                    className="flex-1 text-[10px]"
                    disabled={busy}
                    onClick={() => { setUploadTarget(face.name); fileInputRef.current?.click() }}
                    size="sm"
                    variant="outline"
                  >
                    + Kép
                  </Button>
                  <Button
                    className="text-[10px] text-swarm-red hover:border-swarm-red/40"
                    disabled={busy}
                    onClick={() => setConfirmDelete(face.name)}
                    size="sm"
                    variant="outline"
                  >
                    Törlés
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
