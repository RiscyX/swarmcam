import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader className="pb-2">
          <div className="text-lg font-semibold text-foreground">SwarmCam</div>
          <div className="text-xs text-muted-foreground">distributed surveillance system</div>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Username</span>
              <Input autoComplete="username" onChange={(e) => setUser(e.target.value)} placeholder="admin" value={user} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Password</span>
              <Input autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} type="password" value={password} />
            </label>
            <Button className="w-full" disabled={isLoggingIn} type="submit">
              {isLoggingIn ? 'Signing in...' : 'Sign in'}
            </Button>
            {loginError ? <div className="font-mono text-xs text-swarm-red">{loginError}</div> : null}
          </form>

          <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Authentication via Frigate NVR. Create a user at{' '}
            <span className="text-[var(--accent-text)]">http://localhost:5000</span> before first login.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
