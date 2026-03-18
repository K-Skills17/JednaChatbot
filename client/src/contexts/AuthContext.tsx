import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { auth as authApi } from '../lib/api'

interface User {
  id: string
  tenantId: string
  email: string
  name: string
  role: string
  tenant?: {
    businessName: string
    plan: string
    status: string
  }
}

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('lk_user')
    return saved ? JSON.parse(saved) : null
  })
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('lk_token'),
  )
  const [loading, setLoading] = useState(false)

  // Fetch full profile on mount if we have a token
  useEffect(() => {
    if (token && !user?.tenant) {
      authApi.me().then((profile) => {
        setUser(profile)
        localStorage.setItem('lk_user', JSON.stringify(profile))
      }).catch(() => {
        // Token expired
        setToken(null)
        setUser(null)
        localStorage.removeItem('lk_token')
        localStorage.removeItem('lk_user')
        localStorage.removeItem('lk_tenant_id')
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      const result = await authApi.login(email, password)
      setToken(result.token)
      setUser(result.user)
      localStorage.setItem('lk_token', result.token)
      localStorage.setItem('lk_user', JSON.stringify(result.user))
      localStorage.setItem('lk_tenant_id', result.user.tenantId)
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('lk_token')
    localStorage.removeItem('lk_user')
    localStorage.removeItem('lk_tenant_id')
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
