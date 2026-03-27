import { createContext } from 'react'

export interface UserProfile {
  name: string
  email: string
  imageUrl: string
}

export interface AppContextType {
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

export const AppContext = createContext<AppContextType | null>(null)