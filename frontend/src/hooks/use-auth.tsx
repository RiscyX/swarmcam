/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { ApiError } from '@/lib/api'
import {
  clearStoredToken,
  fetchCurrentUser,
  getStoredToken,
  loginRequest,
  storeToken,
  type AuthUser,
  type LoginRequest,
} from '@/lib/auth'

type AuthContextValue = {
  token: string | null
  user: AuthUser | null
  isChecking: boolean
  isLoggingIn: boolean
  loginError: string | null
  isAuthenticated: boolean
  login: (body: LoginRequest) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function checkSession() {
      if (!token) {
        setIsChecking(false)
        return
      }

      try {
        const currentUser = await fetchCurrentUser(token)
        if (!cancelled) setUser(currentUser)
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          clearStoredToken()
          setToken(null)
          setUser(null)
        }
      } finally {
        if (!cancelled) setIsChecking(false)
      }
    }

    void checkSession()

    return () => {
      cancelled = true
    }
  }, [token])

  async function login(body: LoginRequest) {
    setIsLoggingIn(true)
    setLoginError(null)
    try {
      const response = await loginRequest(body)
      storeToken(response.token)
      setToken(response.token)
      const currentUser = await fetchCurrentUser(response.token).catch(() => null)
      setUser(currentUser)
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Invalid username or password')
      throw error
    } finally {
      setIsLoggingIn(false)
    }
  }

  function logout() {
    clearStoredToken()
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isChecking,
        isLoggingIn,
        loginError,
        isAuthenticated: Boolean(token),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
