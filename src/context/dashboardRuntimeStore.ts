import { createContext } from 'react'
import type { RawSheetData } from '../services/sheetsData'

export type GlobalRangePreset = '7d' | '30d' | '90d'

export type DashboardRuntimeContextType = {
  availableSheetNames: string[]
  sheetCache: Record<string, RawSheetData>
  initialLoading: boolean
  sectionLoading: boolean
  busyMutation: boolean
  error: string | null
  statusMessage: string
  globalStartInput: string
  globalEndInput: string
  selectedPreset: GlobalRangePreset | null
  globalRangeStart: Date
  globalRangeEnd: Date
  getCachedSheet: (sheetName: string) => RawSheetData | null
  ensureSheets: (sheetNames: string[], options?: { force?: boolean }) => Promise<void>
  refreshSheets: (sheetNames: string[]) => Promise<void>
  createRow: (sheetName: string, rowValues: string[], columnCount: number) => Promise<void>
  updateRow: (sheetName: string, rowNumber: number, rowValues: string[], columnCount: number) => Promise<void>
  deleteRow: (sheetName: string, rowNumber: number) => Promise<void>
  onChangeStart: (value: string) => void
  onChangeEnd: (value: string) => void
  onSelectPreset: (preset: GlobalRangePreset) => void
  clearStatusMessage: () => void
}

export const DashboardRuntimeContext = createContext<DashboardRuntimeContextType | null>(null)
