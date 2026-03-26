import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CircleAlert, LayoutDashboard, Table2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import {
  appendSheetRow,
  deleteSheetRow,
  getSheetData,
  getSheetsData,
  getSpreadsheetSheetNames,
  PRIMARY_ANALYTICS_SHEETS,
  type RawSheetData,
  updateSheetRow,
} from '../../services/sheetsData'
import DashboardLayout from './dashboard/DashboardLayout'
import SectionContentLayout from './dashboard/SectionContentLayout'
import {
  formatDateInputValue,
  getDateBoundsFromSheet,
  normalizeKey,
  parseDateInputValue,
  SECTION_DESCRIPTIONS,
  SPECIAL_SHEETS,
} from './dashboard/shared'
import type { NavItem, NavSection } from './dashboard/shared'

const HomeSection = lazy(() => import('./dashboard/HomeSection'))
const RankingSection = lazy(() => import('./dashboard/RankingSection'))
const GenericSheetSection = lazy(() => import('./dashboard/GenericSheetSection'))

export default function DashboardPage() {
  const { user, signOut } = useApp()

  const [availableSheetNames, setAvailableSheetNames] = useState<string[]>([])
  const [sheetCache, setSheetCache] = useState<Record<string, RawSheetData>>({})
  const [activeSection, setActiveSection] = useState('home')
  const [initialLoading, setInitialLoading] = useState(true)
  const [sectionLoading, setSectionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyMutation, setBusyMutation] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  const getCachedSheet = useCallback(
    (sheetName: string): RawSheetData | null => {
      const key = normalizeKey(sheetName)
      return sheetCache[key] || null
    },
    [sheetCache],
  )

  const mergeSheets = useCallback((sheets: RawSheetData[]) => {
    setSheetCache((prev) => {
      const next = { ...prev }
      sheets.forEach((sheet) => {
        next[normalizeKey(sheet.sheetName)] = sheet
      })
      return next
    })
  }, [])

  const loadSheet = useCallback(
    async (sheetName: string, force = false): Promise<RawSheetData | null> => {
      try {
        const data = await getSheetData(sheetName, { force })
        mergeSheets([data])
        return data
      } catch {
        return null
      }
    },
    [mergeSheets],
  )

  const initializeDashboard = useCallback(async () => {
    setInitialLoading(true)
    setError(null)

    try {
      const names = await getSpreadsheetSheetNames()
      setAvailableSheetNames(names)
    } catch (initError) {
      console.error('Dashboard init error:', initError)
      setError('No se pudo inicializar el panel admin con Google Sheets.')
    } finally {
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    void initializeDashboard()
  }, [initializeDashboard])

  const homeItem = useMemo<NavItem>(
    () => ({ id: 'home', label: 'Inicio', icon: <LayoutDashboard size={16} />, sectionType: 'home' }),
    [],
  )

  const rankingItem = useMemo<NavItem>(
    () => ({ id: 'ranking', label: 'Ranking tiendas x vendedor', icon: <Table2 size={16} />, sectionType: 'ranking' }),
    [],
  )

  const primarySheetItems = useMemo<NavItem[]>(() => {
    return PRIMARY_ANALYTICS_SHEETS
      .filter((sheetName) => availableSheetNames.includes(sheetName))
      .map((sheetName) => ({
        id: `sheet-primary:${sheetName}`,
        label: sheetName,
        icon: <Table2 size={16} />,
        sectionType: 'sheet' as const,
        sheetName,
      }))
  }, [availableSheetNames])

  const navSections = useMemo<NavSection[]>(() => {
    return [
      { id: 'nav-principal', title: 'Principal', items: [homeItem, rankingItem] },
      { id: 'nav-core', title: 'Hojas principales', items: primarySheetItems },
    ]
  }, [homeItem, rankingItem, primarySheetItems])

  const navItems = useMemo(() => navSections.flatMap((section) => section.items), [navSections])

  const activeItem = useMemo(
    () => navItems.find((item) => item.id === activeSection) || navItems[0] || null,
    [navItems, activeSection],
  )

  useEffect(() => {
    if (!activeItem && navItems.length > 0) {
      setActiveSection(navItems[0].id)
    }
  }, [activeItem, navItems])

  const getRequiredSheetNamesForSection = useCallback((item: NavItem | null): string[] => {
    if (!item) return []

    if (item.sectionType === 'sheet' && item.sheetName) {
      return [item.sheetName]
    }

    if (item.sectionType === 'home') {
      return [...PRIMARY_ANALYTICS_SHEETS, SPECIAL_SHEETS.commissionsLeads]
    }

    if (item.sectionType === 'ranking') {
      return ['DATA ENVIOS', 'Tiendas']
    }

    return []
  }, [])

  const ensureRequiredSheets = useCallback(
    async (item: NavItem | null) => {
      if (!item) return

      const requiredSheetNames = getRequiredSheetNamesForSection(item)
      const missing = requiredSheetNames.filter((sheetName) => !getCachedSheet(sheetName))
      if (missing.length === 0) return

      setSectionLoading(true)
      setStatusMessage('')
      const loaded = await getSheetsData(missing)
      mergeSheets(loaded)
      setSectionLoading(false)
    },
    [getCachedSheet, getRequiredSheetNamesForSection, mergeSheets],
  )

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!activeItem) return
      try {
        await ensureRequiredSheets(activeItem)
      } catch (sectionError) {
        console.error('Section load error:', sectionError)
        if (!cancelled) {
          setError('No se pudo cargar la data de la seccion seleccionada.')
          setSectionLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [activeItem, ensureRequiredSheets])

  const executeMutation = useCallback(async (action: () => Promise<void>) => {
    setBusyMutation(true)
    setError(null)

    try {
      await action()
      setStatusMessage('Cambios sincronizados correctamente con Google Sheets.')
    } catch (mutationError) {
      console.error('CRUD mutation error:', mutationError)
      setError('No se pudo completar la operacion CRUD en Google Sheets.')
    } finally {
      setBusyMutation(false)
    }
  }, [])

  const handleCreate = useCallback(
    async (sheetName: string, rowValues: string[]) => {
      await executeMutation(async () => {
        await appendSheetRow(sheetName, rowValues)
        await loadSheet(sheetName, true)
      })
    },
    [executeMutation, loadSheet],
  )

  const handleUpdate = useCallback(
    async (sheetName: string, rowNumber: number, rowValues: string[]) => {
      await executeMutation(async () => {
        await updateSheetRow(sheetName, rowNumber, rowValues)
        await loadSheet(sheetName, true)
      })
    },
    [executeMutation, loadSheet],
  )

  const handleDelete = useCallback(
    async (sheetName: string, rowNumber: number) => {
      await executeMutation(async () => {
        await deleteSheetRow(sheetName, rowNumber)
        await loadSheet(sheetName, true)
      })
    },
    [executeMutation, loadSheet],
  )

  const refreshCurrentSection = useCallback(async () => {
    if (!activeItem) return

    setSectionLoading(true)
    setStatusMessage('')

    const toForce = getRequiredSheetNamesForSection(activeItem)
    for (const name of toForce) {
      await loadSheet(name, true)
    }

    setSectionLoading(false)
    setStatusMessage('Datos actualizados para la seccion actual.')
  }, [activeItem, getRequiredSheetNamesForSection, loadSheet])

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
    if (detectedGlobalBounds.max) return detectedGlobalBounds.max
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + 1, 0)
  }, [detectedGlobalBounds.max])

  const [globalStartInput, setGlobalStartInput] = useState('')
  const [globalEndInput, setGlobalEndInput] = useState('')
  const [hasUserSetGlobalRange, setHasUserSetGlobalRange] = useState(false)

  useEffect(() => {
    if (hasUserSetGlobalRange) return
    setGlobalStartInput(formatDateInputValue(defaultGlobalStart))
    setGlobalEndInput(formatDateInputValue(defaultGlobalEnd))
  }, [defaultGlobalStart, defaultGlobalEnd, hasUserSetGlobalRange])

  const parsedGlobalStart = useMemo(() => parseDateInputValue(globalStartInput), [globalStartInput])
  const parsedGlobalEnd = useMemo(() => parseDateInputValue(globalEndInput, true), [globalEndInput])

  const { globalRangeStart, globalRangeEnd } = useMemo(() => {
    const start = parsedGlobalStart || defaultGlobalStart
    const end = parsedGlobalEnd || parseDateInputValue(formatDateInputValue(defaultGlobalEnd), true) || defaultGlobalEnd

    if (start <= end) return { globalRangeStart: start, globalRangeEnd: end }
    return { globalRangeStart: end, globalRangeEnd: start }
  }, [parsedGlobalStart, parsedGlobalEnd, defaultGlobalStart, defaultGlobalEnd])

  if (initialLoading) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 md:p-6">
        <div className="mx-auto max-w-[1500px] animate-pulse space-y-4">
          <div className="h-20 rounded-2xl bg-slate-200" />
          <div className="grid gap-4 md:grid-cols-[280px_1fr]">
            <div className="h-[calc(100vh-8rem)] rounded-2xl bg-slate-200" />
            <div className="h-[calc(100vh-8rem)] rounded-2xl bg-slate-200" />
          </div>
        </div>
      </main>
    )
  }

  if (error && Object.keys(sheetCache).length === 0) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <section className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Error inicializando admin</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </section>
      </main>
    )
  }

  const activeSheet = activeItem?.sheetName ? getCachedSheet(activeItem.sheetName) : null
  const activeSectionLabel = activeItem?.label || 'Panel'
  const activeSectionDescription = activeItem
    ? SECTION_DESCRIPTIONS[activeItem.sectionType]
    : 'Explora los modulos disponibles y selecciona una seccion.'
  const globalRangeLabel = `${globalRangeStart.toLocaleDateString('es-PE')} - ${globalRangeEnd.toLocaleDateString('es-PE')}`
  const loadedSheetsCount = Object.keys(sheetCache).length

  let activeSectionContent: ReactNode = null

  if (activeItem?.sectionType === 'home') {
    activeSectionContent = (
      <HomeSection
        tiendasSheet={getCachedSheet('Tiendas') || undefined}
        enviosSheet={getCachedSheet('DATA ENVIOS') || undefined}
        recojosSheet={getCachedSheet('DATA RECOJOS') || undefined}
        comisionesSheet={getCachedSheet(SPECIAL_SHEETS.commissionsLeads) || undefined}
        startDate={globalRangeStart}
        endDate={globalRangeEnd}
      />
    )
  } else if (activeItem?.sectionType === 'sheet' && activeSheet) {
    activeSectionContent = (
      <GenericSheetSection
        sheet={activeSheet}
        startDate={globalRangeStart}
        endDate={globalRangeEnd}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        busy={busyMutation}
      />
    )
  } else if (activeItem?.sectionType === 'ranking') {
    activeSectionContent = (
      <RankingSection
        enviosSheet={getCachedSheet('DATA ENVIOS')}
        tiendasSheet={getCachedSheet('Tiendas')}
        startDate={globalRangeStart}
        endDate={globalRangeEnd}
      />
    )
  } else if (activeItem?.sheetName && !activeSheet && !sectionLoading) {
    activeSectionContent = (
      <article className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <CircleAlert size={16} />
          No se pudo cargar la hoja {activeItem.sheetName}. Verifica que exista y tenga permisos.
        </div>
      </article>
    )
  }

  return (
    <DashboardLayout
      userName={user?.name || 'Usuario'}
      navSections={navSections}
      activeSection={activeSection}
      onSelectSection={(id) => {
        setActiveSection(id)
        setStatusMessage('')
      }}
      activeSectionLabel={activeSectionLabel}
      activeSectionDescription={activeSectionDescription}
      globalRangeLabel={globalRangeLabel}
      loadedSheetsCount={loadedSheetsCount}
      globalStartInput={globalStartInput}
      globalEndInput={globalEndInput}
      onChangeStart={(value) => {
        setHasUserSetGlobalRange(true)
        setGlobalStartInput(value)
      }}
      onChangeEnd={(value) => {
        setHasUserSetGlobalRange(true)
        setGlobalEndInput(value)
      }}
      onRefresh={() => void refreshCurrentSection()}
      onSignOut={signOut}
      sectionLoading={sectionLoading}
      busyMutation={busyMutation}
      statusMessage={statusMessage}
      error={error}
    >
      <SectionContentLayout>
        <Suspense fallback={<p className="text-sm text-slate-500">Cargando apartado...</p>}>
          {activeSectionContent}
        </Suspense>
      </SectionContentLayout>
    </DashboardLayout>
  )
}
