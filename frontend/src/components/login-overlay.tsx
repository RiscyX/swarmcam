import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/use-auth'

export function LoginOverlay() {
  const { isAuthenticated, isChecking, isLoggingIn, login, loginError } = useAuth()
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')

  if (isChecking || isAuthenticated) return null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await login({ user, password }).catch(() => undefined)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-sm overflow-hidden border-border bg-[#0a0d13] shadow-[0_0_80px_rgba(0,0,0,0.45)]">
        <div className="h-0.5 bg-swarm-amber" />
        <CardHeader className="pb-4">
          <CardTitle className="font-ui text-3xl font-black uppercase tracking-[0.18em] text-swarm-amber">
            SwarmCam
          </CardTitle>
          <CardDescription className="font-mono text-[10px] uppercase tracking-[0.18em]">
            distributed surveillance system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block space-y-1.5">
              <span className="font-ui text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Felhasználónév
              </span>
              <Input autoComplete="username" onChange={(event) => setUser(event.target.value)} placeholder="admin" value={user} />
            </label>
            <label className="block space-y-1.5">
              <span className="font-ui text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Jelszó
              </span>
              <Input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            <Button className="w-full" disabled={isLoggingIn} type="submit">
              {isLoggingIn ? 'Bejelentkezés...' : 'Bejelentkezés'}
            </Button>
            <div className="min-h-4 font-mono text-[11px] text-swarm-red">{loginError}</div>
          </form>

          <div className="mt-5 border-t border-border pt-4 font-mono text-[10px] leading-6 text-muted-foreground">
            Hitelesítés a Frigate NVR rendszeren keresztül. Első bejelentkezés előtt hozz létre felhasználót:
            <span className="ml-1 text-swarm-blue">http://localhost:5000</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
