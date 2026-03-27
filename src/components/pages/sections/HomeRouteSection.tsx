import { useEffect, useMemo } from 'react'
import HomeSection from '../dashboard/HomeSection'
import { useDashboardRuntime } from '../../../context/useDashboardRuntime'
import { getSectionById, getRequiredSheetsForSection } from '../dashboard/sectionsConfig'
import { SPECIAL_SHEETS } from '../dashboard/shared'

export default function HomeRouteSection() {
  const { ensureSheets, getCachedSheet, sectionLoading, globalRangeStart, globalRangeEnd } = useDashboardRuntime()

  const requiredSheets = useMemo(() => getRequiredSheetsForSection(getSectionById('home')), [])

  useEffect(() => {
    void ensureSheets(requiredSheets)
  }, [ensureSheets, requiredSheets])

  const tiendasSheet = getCachedSheet('Tiendas') || getCachedSheet('TIENDAS') || undefined
  const enviosSheet = getCachedSheet('DATA ENVIOS') || undefined
  const recojosSheet = getCachedSheet('DATA RECOJOS') || undefined
  const comisionesSheet = getCachedSheet(SPECIAL_SHEETS.commissionsLeads) || undefined

  if (sectionLoading && !tiendasSheet && !enviosSheet && !recojosSheet) {
    return <p className="text-sm text-slate-500">Cargando informacion de inicio...</p>
  }

  return (
    <HomeSection
      tiendasSheet={tiendasSheet}
      enviosSheet={enviosSheet}
      recojosSheet={recojosSheet}
      comisionesSheet={comisionesSheet}
      startDate={globalRangeStart}
      endDate={globalRangeEnd}
    />
  )
}
