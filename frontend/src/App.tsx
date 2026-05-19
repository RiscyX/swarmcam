import { AppShell } from '@/components/app-shell'
import { AuthProvider } from '@/hooks/use-auth'

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
