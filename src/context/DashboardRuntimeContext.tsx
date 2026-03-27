import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  appendSheetRow,
  deleteSheetRow,
  getSheetData,
  getSheetsData,
  getSpreadsheetSheetNames,
  type RawSheetData,
  updateSheetRow,
} from '../services/sheetsData'
import {
  formatDateInputValue,
  getDateBoundsFromSheet,
  normalizeKey,
  parseDateInputValue,
} from '../components/pages/dashboard/shared'
import {
  DashboardRuntimeContext,
  type DashboardRuntimeContextType,
  type GlobalRangePreset,
} from './dashboardRuntimeStore'

const PRESET_DAYS: Record<GlobalRangePreset, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

export function DashboardRuntimeProvider({ children }: { children: ReactNode }) {
  const [availableSheetNames, setAvailableSheetNames] = useState<string[]>([])
  const [sheetCache, setSheetCache] = useState<Record<string, RawSheetData>>({})
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadingCounter, setLoadingCounter] = useState(0)
  const [busyMutation, setBusyMutation] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')

  const [globalStartInput, setGlobalStartInput] = useState('')
  const [globalEndInput, setGlobalEndInput] = useState('')
  const [hasUserSetGlobalRange, setHasUserSetGlobalRange] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<GlobalRangePreset | null>(null)

  const sectionLoading = loadingCounter > 0

  const mergeSheets = useCallback((sheets: RawSheetData[]) => {
    setSheetCache((prev) => {
      const next = { ...prev }
      sheets.forEach((sheet) => {
        next[normalizeKey(sheet.sheetName)] = sheet
      })
      return next
    })
  }, [])

  const getCachedSheet = useCallback(
    (sheetName: string): RawSheetData | null => {
      const key = normalizeKey(sheetName)
      return sheetCache[key] || null
    },
    [sheetCache],
  )

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      setInitialLoading(true)
      setError(null)

      try {
        const names = await getSpreadsheetSheetNames()
        if (!cancelled) {
          setAvailableSheetNames(names)
        }
      } catch (initError) {
        console.error('Dashboard runtime init error:', initError)
        if (!cancelled) {
          setError('No se pudo inicializar el panel admin con Google Sheets.')
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false)
        }
      }
    }

    void initialize()

    return () => {
      cancelled = true
    }
  }, [])

  const ensureSheets = useCallback(
    async (sheetNames: string[], options?: { force?: boolean }) => {
      const uniqueNames = [...new Set(sheetNames.map((name) => name.trim()).filter((name) => name.length > 0))]
      if (uniqueNames.length === 0) return

      const availableNormalized = new Set(availableSheetNames.map((name) => normalizeKey(name)))
      const existingNames =
        availableNormalized.size > 0
          ? uniqueNames.filter((name) => availableNormalized.has(normalizeKey(name)))
          : uniqueNames

      if (existingNames.length === 0) return

      const force = Boolean(options?.force)
      const missingOrForced = force
        ? existingNames
        : existingNames.filter((sheetName) => !getCachedSheet(sheetName))

      if (missingOrForced.length === 0) return

      setLoadingCounter((prev) => prev + 1)
      setStatusMessage('')
      setError(null)

      try {
        const loaded = await getSheetsData(missingOrForced, { force })
        mergeSheets(loaded)
      } catch (loadError) {
        console.error('Dashboard sheet load error:', loadError)
        setError('No se pudo cargar la data de la seccion seleccionada.')
      } finally {
        setLoadingCounter((prev) => Math.max(0, prev - 1))
      }
    },
    [availableSheetNames, getCachedSheet, mergeSheets],
  )

  const refreshSheets = useCallback(
    async (sheetNames: string[]) => {
      await ensureSheets(sheetNames, { force: true })
      setStatusMessage('Datos actualizados para la seccion actual.')
    },
    [ensureSheets],
  )

  const executeMutation = useCallback(
    async (action: () => Promise<void>) => {
      setBusyMutation(true)
      setError(null)
      setStatusMessage('')

      try {
        await action()
        setStatusMessage('Cambios sincronizados correctamente con Google Sheets.')
      } catch (mutationError) {
        console.error('Dashboard CRUD mutation error:', mutationError)
        setError('No se pudo completar la operacion CRUD en Google Sheets.')
      } finally {
        setBusyMutation(false)
      }
    },
    [],
  )

  const createRow = useCallback(
    async (sheetName: string, rowValues: string[], columnCount: number) => {
      await executeMutation(async () => {
        await appendSheetRow(sheetName, rowValues, columnCount)
        const refreshed = await getSheetData(sheetName, { force: true })
        mergeSheets([refreshed])
      })
    },
    [executeMutation, mergeSheets],
  )

  const updateRow = useCallback(
    async (sheetName: string, rowNumber: number, rowValues: string[], columnCount: number) => {
      await executeMutation(async () => {
        await updateSheetRow(sheetName, rowNumber, rowValues, columnCount)
        const refreshed = await getSheetData(sheetName, { force: true })
        mergeSheets([refreshed])
      })
    },
    [executeMutation, mergeSheets],
  )

  const deleteRow = useCallback(
    async (sheetName: string, rowNumber: number) => {
      await executeMutation(async () => {
        await deleteSheetRow(sheetName, rowNumber)
        const refreshed = await getSheetData(sheetName, { force: true })
        mergeSheets([refreshed])
      })
    },
    [executeMutation, mergeSheets],
  )

  const detectedGlobalBounds = useMemo(() => {
    const sheets = Object.values(sheetCache)
    if (sheets.length === 0) {
      return { min: null as Date | null, max: null as Date | null }
    }

    const bounds = sheets.map((sheet) => getDateBoundsFromSheet(sheet))
    const mins = bounds.map((item) => item.min).filter((item): item is Date => Boolean(item))
    const maxs = bounds.map((item) => item.max).filter((item): item is Date => Boolean(item))

    return {
      min: mins.length > 0 ? new Date(Math.min(...mins.map((date) => date.getTime()))) : null,
      max: maxs.length > 0 ? new Date(Math.max(...maxs.map((date) => date.getTime()))) : null,
    }
  }, [sheetCache])

  const defaultGlobalStart = useMemo(() => {
    if (detectedGlobalBounds.min) return detectedGlobalBounds.min
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }, [detectedGlobalBounds.min])

  const defaultGlobalEnd = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])

  useEffect(() => {
    if (hasUserSetGlobalRange) return
    setGlobalStartInput(formatDateInputValue(defaultGlobalStart))
    setGlobalEndInput(formatDateInputValue(defaultGlobalEnd))
  }, [defaultGlobalStart, defaultGlobalEnd, hasUserSetGlobalRange])

  const parsedGlobalStart = useMemo(() => parseDateInputValue(globalStartInput), [globalStartInput])
  const parsedGlobalEnd = useMemo(() => parseDateInputValue(globalEndInput, true), [globalEndInput])

  const onSelectPreset = useCallback(
    (preset: GlobalRangePreset) => {
      const days = PRESET_DAYS[preset]
      const baseEnd = parsedGlobalEnd || defaultGlobalEnd

      const nextEnd = new Date(baseEnd)
      nextEnd.setHours(23, 59, 59, 999)

      const nextStart = new Date(nextEnd)
      nextStart.setHours(0, 0, 0, 0)
      nextStart.setDate(nextStart.getDate() - (days - 1))

      setHasUserSetGlobalRange(true)
      setGlobalStartInput(formatDateInputValue(nextStart))
      setGlobalEndInput(formatDateInputValue(nextEnd))
      setSelectedPreset(preset)
    },
    [parsedGlobalEnd, defaultGlobalEnd],
  )

  const { globalRangeStart, globalRangeEnd } = useMemo(() => {
    const start = parsedGlobalStart || defaultGlobalStart
    const end = parsedGlobalEnd || defaultGlobalEnd

    if (start <= end) {
      return { globalRangeStart: start, globalRangeEnd: end }
    }

    return { globalRangeStart: end, globalRangeEnd: start }
  }, [parsedGlobalStart, parsedGlobalEnd, defaultGlobalStart, defaultGlobalEnd])

  const value = useMemo<DashboardRuntimeContextType>(
    () => ({
      availableSheetNames,
      sheetCache,
      initialLoading,
      sectionLoading,
      busyMutation,
      error,
      statusMessage,
      globalStartInput,
      globalEndInput,
      selectedPreset,
      globalRangeStart,
      globalRangeEnd,
      getCachedSheet,
      ensureSheets,
      refreshSheets,
      createRow,
      updateRow,
      deleteRow,
      onChangeStart: (value) => {
        setHasUserSetGlobalRange(true)
        setSelectedPreset(null)
        setGlobalStartInput(value)
      },
      onChangeEnd: (value) => {
        setHasUserSetGlobalRange(true)
        setSelectedPreset(null)
        setGlobalEndInput(value)
      },
      onSelectPreset,
      clearStatusMessage: () => setStatusMessage(''),
    }),
    [
      availableSheetNames,
      sheetCache,
      initialLoading,
      sectionLoading,
      busyMutation,
      error,
      statusMessage,
      globalStartInput,
      globalEndInput,
      selectedPreset,
      globalRangeStart,
      globalRangeEnd,
      getCachedSheet,
      ensureSheets,
      refreshSheets,
      createRow,
      updateRow,
      deleteRow,
      onSelectPreset,
    ],
  )

  return <DashboardRuntimeContext.Provider value={value}>{children}</DashboardRuntimeContext.Provider>
}
