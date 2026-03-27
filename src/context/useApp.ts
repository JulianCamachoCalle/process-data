import { useContext } from 'react'
import { AppContext } from './appContextStore'
import type { AppContextType } from './appContextStore'

export function useApp(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider')
  return ctx
}