import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AppContext } from './appContextStore'
import type { UserProfile } from './appContextStore'
import { GOOGLE_CONFIG } from '../config/google'
import {
  clearPersistedSession,
  fetchUserProfile,
  getMissingEnvVariables,
  initGapiClient,
  initTokenClient,
  readSessionFromCookie,
  requestAccessToken,
  revokeToken,
  saveSessionToCookie,
  setActiveAccessToken,
  validateSpreadsheetAccess,
  waitForGoogleSdk,
} from '../services/googleAuth'

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [spreadsheetTitle, setSpreadsheetTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const silentAuthAttemptRef = useRef(false)

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

        const restorePersistedSession = async (): Promise<boolean> => {
          const persisted = readSessionFromCookie()
          if (!persisted) {
            return false
          }

          // Si hay una sesion persistida, intentamos validar antes de mostrar login.
          setIsAuthenticating(true)
          setError(null)

          try {
            setActiveAccessToken(persisted.accessToken)

            const spreadsheet = await validateSpreadsheetAccess()
            let profile = persisted.user

            try {
              profile = await fetchUserProfile()
            } catch (profileError) {
              console.warn('No se pudo refrescar el perfil de usuario desde Google.', profileError)
            }

            if (cancelled) return true

            const safeTitle = spreadsheet.title || persisted.spreadsheetTitle

            setUser(profile)
            setSpreadsheetTitle(safeTitle)
            setIsSignedIn(true)

            saveSessionToCookie({
              tokenResponse: {
                access_token: persisted.accessToken,
                expires_in: Math.max(60, Math.floor((persisted.expiresAt - Date.now()) / 1000)),
              },
              user: profile,
              spreadsheetTitle: safeTitle,
            })

            return true
          } catch (restoreError) {
            console.error('Restore session error:', restoreError)
            clearPersistedSession()
            return false
          } finally {
            if (!cancelled) {
              setIsAuthenticating(false)
            }
          }
        }

        initTokenClient(
          async (tokenResponse) => {
            const wasSilentAttempt = silentAuthAttemptRef.current
            silentAuthAttemptRef.current = false

            if (tokenResponse.error) {
              if (!wasSilentAttempt) {
                setError('No fue posible autenticar con Google.')
              }
              setIsAuthenticating(false)
              setIsLoading(false)
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
              saveSessionToCookie({
                tokenResponse,
                user: profile,
                spreadsheetTitle: spreadsheet.title,
              })
            } catch (authError) {
              console.error('Auth flow error:', authError)
              if (!cancelled) {
                setError('Login correcto, pero no se pudo validar acceso al Google Sheet.')
                clearPersistedSession()
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
            const wasSilentAttempt = silentAuthAttemptRef.current
            silentAuthAttemptRef.current = false

            if (!cancelled) {
              if (!wasSilentAttempt) {
                setError('Autenticacion cancelada o fallida.')
              }
              setIsAuthenticating(false)
              setIsLoading(false)
            }
          },
        )

        const restored = await restorePersistedSession()
        if (restored) {
          if (!cancelled) {
            setIsLoading(false)
          }
          return
        }

        if (!cancelled) {
          setIsAuthenticating(true)
          silentAuthAttemptRef.current = true
          try {
            requestAccessToken('')
          } catch {
            silentAuthAttemptRef.current = false
            setIsAuthenticating(false)
            setIsLoading(false)
          }
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
    silentAuthAttemptRef.current = false

    try {
      requestAccessToken('consent')
    } catch (signInError) {
      console.error('Sign in error:', signInError)
      setError('No se pudo iniciar el flujo de autenticacion.')
      setIsAuthenticating(false)
    }
  }, [])

  const signOut = useCallback(() => {
    silentAuthAttemptRef.current = false
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
