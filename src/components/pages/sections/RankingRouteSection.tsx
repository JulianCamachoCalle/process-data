import { useEffect, useMemo } from 'react'
import RankingSection from '../dashboard/RankingSection'
import { useDashboardRuntime } from '../../../context/useDashboardRuntime'
import { getSectionById, getRequiredSheetsForSection } from '../dashboard/sectionsConfig'

export default function RankingRouteSection() {
  const { ensureSheets, getCachedSheet, sectionLoading, globalRangeStart, globalRangeEnd } = useDashboardRuntime()

  const requiredSheets = useMemo(() => getRequiredSheetsForSection(getSectionById('ranking')), [])

  useEffect(() => {
    void ensureSheets(requiredSheets)
  }, [ensureSheets, requiredSheets])

  const enviosSheet = getCachedSheet('DATA ENVIOS')
  const tiendasSheet = getCachedSheet('Tiendas') || getCachedSheet('TIENDAS')

  if (sectionLoading && (!enviosSheet || !tiendasSheet)) {
    return <p className="text-sm text-slate-500">Cargando ranking...</p>
  }

  return (
    <RankingSection
      enviosSheet={enviosSheet}
      tiendasSheet={tiendasSheet}
      startDate={globalRangeStart}
      endDate={globalRangeEnd}
    />
  )
}
