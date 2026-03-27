import { Suspense, useCallback, useEffect, useMemo } from 'react'
import { LayoutDashboard, Table2 } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../../../context/useApp'
import { DashboardRuntimeProvider } from '../../../context/DashboardRuntimeContext'
import { useDashboardRuntime } from '../../../context/useDashboardRuntime'
import DashboardLayout from './DashboardLayout'
import SectionContentLayout from './SectionContentLayout'
import { getRequiredSheetsForSection, getSectionById, getSectionByPath, DASHBOARD_SECTIONS } from './sectionsConfig'
import { normalizeKey } from './shared'
import type { NavSection } from './shared'

function DashboardShellContent() {
  const { signOut, user } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  const {
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
    onChangeStart,
    onChangeEnd,
    onSelectPreset,
    refreshSheets,
    clearStatusMessage,
  } = useDashboardRuntime()

  const visibleSections = useMemo(() => {
    if (availableSheetNames.length === 0) {
      return DASHBOARD_SECTIONS.filter((section) => section.kind !== 'sheet')
    }

    return DASHBOARD_SECTIONS.filter((section) => {
      if (section.kind !== 'sheet' || !section.sheetName) return true
      return availableSheetNames.includes(section.sheetName)
    })
  }, [availableSheetNames])

  const activeSection = useMemo(() => {
    const byPath = getSectionByPath(location.pathname)
    if (byPath) return byPath
    return getSectionById('home')
  }, [location.pathname])

  const navSections = useMemo<NavSection[]>(() => {
    const grouped: Record<string, NavSection> = {
      principal: { id: 'nav-principal', title: 'Principal', items: [] },
      'primary-data': { id: 'nav-primary', title: 'Datos primarios', items: [] },
      'operational-data': { id: 'nav-operational', title: 'Datos operativos', items: [] },
    }

    visibleSections.forEach((section) => {
      grouped[section.group].items.push({
        id: section.id,
        label: section.label,
        sectionType: section.kind === 'sheet' ? 'sheet' : section.kind,
        sheetName: section.sheetName,
        icon: section.kind === 'home' ? <LayoutDashboard size={16} /> : <Table2 size={16} />,
      })
    })

    return [grouped.principal, grouped['primary-data'], grouped['operational-data']]
  }, [visibleSections])

  const activeSectionId = activeSection?.id || 'home'
  const activeSectionLabel = activeSection?.label || 'Panel'
  const activeSectionDescription = activeSection?.description || 'Selecciona una seccion para continuar.'
  const globalRangeLabel = `${globalRangeStart.toLocaleDateString('es-PE')} - ${globalRangeEnd.toLocaleDateString('es-PE')}`
  const loadedSheetsCount = Object.keys(sheetCache).length

  const refreshActiveSection = useCallback(() => {
    if (!activeSection) return
    void refreshSheets(getRequiredSheetsForSection(activeSection))
  }, [activeSection, refreshSheets])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tagName = target.tagName
        const isEditable =
          target.isContentEditable ||
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT'

        if (isEditable) return
      }

      const isAltRefresh = event.altKey && !event.ctrlKey && !event.metaKey && normalizeKey(event.key) === 'r'
      const isCtrlShiftRefresh = event.ctrlKey && event.shiftKey && !event.metaKey && normalizeKey(event.key) === 'r'

      if (!isAltRefresh && !isCtrlShiftRefresh) return

      event.preventDefault()
      if (!sectionLoading && !busyMutation) {
        refreshActiveSection()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [refreshActiveSection, sectionLoading, busyMutation])

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

  if (error && loadedSheetsCount === 0) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <section className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Error inicializando admin</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </section>
      </main>
    )
  }

  return (
    <DashboardLayout
      userName={user?.name || 'Usuario'}
      navSections={navSections}
      activeSection={activeSectionId}
      onSelectSection={(id) => {
        const target = getSectionById(id)
        if (!target) return
        clearStatusMessage()
        navigate(`/dashboard/${target.path}`)
      }}
      activeSectionLabel={activeSectionLabel}
      activeSectionDescription={activeSectionDescription}
      globalRangeLabel={globalRangeLabel}
      loadedSheetsCount={loadedSheetsCount}
      globalStartInput={globalStartInput}
      globalEndInput={globalEndInput}
      selectedPreset={selectedPreset}
      onChangeStart={onChangeStart}
      onChangeEnd={onChangeEnd}
      onSelectPreset={onSelectPreset}
      onRefresh={refreshActiveSection}
      onSignOut={signOut}
      sectionLoading={sectionLoading}
      busyMutation={busyMutation}
      statusMessage={statusMessage}
      error={error}
    >
      <SectionContentLayout>
        <Suspense fallback={<p className="text-sm text-slate-500">Cargando apartado...</p>}>
          <Outlet />
        </Suspense>
      </SectionContentLayout>
    </DashboardLayout>
  )
}

export default function DashboardShellRoute() {
  return (
    <DashboardRuntimeProvider>
      <DashboardShellContent />
    </DashboardRuntimeProvider>
  )
}
