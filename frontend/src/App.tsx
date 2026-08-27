import { AppShell } from '@/components/app-shell'
import { AuthProvider } from '@/hooks/use-auth'
import { ThemeProvider } from '@/hooks/use-theme'

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
