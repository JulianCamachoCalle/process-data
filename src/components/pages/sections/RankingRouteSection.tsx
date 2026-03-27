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

  const enviosSheet = getCachedSheet('ENVIOS') || getCachedSheet('DATA ENVIOS')
  const tiendasSheet = getCachedSheet('TIENDAS') || getCachedSheet('Tiendas')
  const vendedoresSheet = getCachedSheet('VENDEDORES')
  const resultadosSheet = getCachedSheet('RESULTADOS')

  if (sectionLoading && (!enviosSheet || !tiendasSheet)) {
    return <p className="text-sm text-slate-500">Cargando ranking...</p>
  }

  return (
    <RankingSection
      enviosSheet={enviosSheet}
      tiendasSheet={tiendasSheet}
      vendedoresSheet={vendedoresSheet}
      resultadosSheet={resultadosSheet}
      startDate={globalRangeStart}
      endDate={globalRangeEnd}
    />
  )
}
