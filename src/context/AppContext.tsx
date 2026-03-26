import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { GOOGLE_CONFIG } from '../config/google'
import {
  fetchUserProfile,
  getMissingEnvVariables,
  initGapiClient,
  initTokenClient,
  requestAccessToken,
  revokeToken,
  validateSpreadsheetAccess,
  waitForGoogleSdk,
} from '../services/googleAuth'

interface UserProfile {
  name: string
  email: string
  imageUrl: string
}

interface AppContextType {
  user: UserProfile | null
  isSignedIn: boolean
  isLoading: boolean
  isAuthenticating: boolean
  spreadsheetId: string
  spreadsheetTitle: string
  signIn: () => void
  signOut: () => void
  error: string | null
  clearError: () => void
}

const AppContext = createContext<AppContextType | null>(null)

export function useApp(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider')
  return ctx
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [spreadsheetTitle, setSpreadsheetTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const bootstrapAuth = async () => {
      const missingEnv = getMissingEnvVariables()
      if (missingEnv.length > 0) {
        setError(`Faltan variables en .env: ${missingEnv.join(', ')}`)
        setIsLoading(false)
        return
      }

      try {
        await waitForGoogleSdk()
        if (cancelled) return

        await initGapiClient()
        if (cancelled) return

        initTokenClient(
          async (tokenResponse) => {
            if (tokenResponse.error) {
              setError('No fue posible autenticar con Google.')
              setIsAuthenticating(false)
              return
            }

            setIsAuthenticating(true)
            setError(null)

            try {
              const profile = await fetchUserProfile()
              const spreadsheet = await validateSpreadsheetAccess()

              if (cancelled) return

              setUser(profile)
              setSpreadsheetTitle(spreadsheet.title)
              setIsSignedIn(true)
            } catch (authError) {
              console.error('Auth flow error:', authError)
              if (!cancelled) {
                setError('Login correcto, pero no se pudo validar acceso al Google Sheet.')
              }
            } finally {
              if (!cancelled) {
                setIsAuthenticating(false)
                setIsLoading(false)
              }
            }
          },
          (tokenError) => {
            console.error('Token client error:', tokenError)
            if (!cancelled) {
              setError('Autenticacion cancelada o fallida.')
              setIsAuthenticating(false)
              setIsLoading(false)
            }
          },
        )

        if (!cancelled) {
          setIsLoading(false)
        }
      } catch (setupError) {
        console.error('Bootstrap auth error:', setupError)
        if (!cancelled) {
          setError('No se pudo inicializar Google SDK. Revisa index.html y tu conexion.')
          setIsLoading(false)
          setIsAuthenticating(false)
        }
      }
    }

    void bootstrapAuth()

    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(() => {
    setError(null)
    setIsAuthenticating(true)

    try {
      requestAccessToken('consent')
    } catch (signInError) {
      console.error('Sign in error:', signInError)
      setError('No se pudo iniciar el flujo de autenticacion.')
      setIsAuthenticating(false)
    }
  }, [])

  const signOut = useCallback(() => {
    revokeToken()
    setUser(null)
    setIsSignedIn(false)
    setSpreadsheetTitle('')
    setError(null)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const value = useMemo(
    () => ({
      user,
      isSignedIn,
      isLoading,
      isAuthenticating,
      spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
      spreadsheetTitle,
      signIn,
      signOut,
      error,
      clearError,
    }),
    [
      user,
      isSignedIn,
      isLoading,
      isAuthenticating,
      spreadsheetTitle,
      signIn,
      signOut,
      error,
      clearError,
    ],
  )

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}
