import { useEffect, useMemo } from 'react'
import GenericSheetSection from '../../dashboard/GenericSheetSection'
import { useDashboardRuntime } from '../../../../context/useDashboardRuntime'
import { getReferencedTablesForSource } from '../../../../config/relationalMapping'

export default function SheetSectionRoute({ sheetName }: { sheetName: string }) {
  const {
    ensureSheets,
    getCachedSheet,
    sheetCache,
    sectionLoading,
    busyMutation,
    globalRangeStart,
    globalRangeEnd,
    createRow,
    updateRow,
    deleteRow,
  } = useDashboardRuntime()

  const requiredSheets = useMemo(
    () => {
      const required = [sheetName, ...getReferencedTablesForSource(sheetName)]

      if (sheetName.toUpperCase() === 'ENVIOS') {
        required.push('TARIFAS', 'LEADS GANADOS', 'FULLFILMENT', 'TIENDAS')
      }

      if (sheetName.toUpperCase() === 'RECOJOS') {
        required.push('LEADS GANADOS')
      }

      return [...new Set(required)]
    },
    [sheetName],
  )

  useEffect(() => {
    void ensureSheets(requiredSheets)
  }, [ensureSheets, requiredSheets])

  const activeSheet = getCachedSheet(sheetName)

  if (!activeSheet) {
    if (sectionLoading) {
      return <p className="text-sm text-slate-500">Cargando hoja {sheetName}...</p>
    }

    return (
      <article className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        No se pudo cargar la hoja {sheetName}. Verifica que exista y tenga permisos.
      </article>
    )
  }

  return (
    <GenericSheetSection
      sheet={activeSheet}
      relatedSheets={sheetCache}
      startDate={globalRangeStart}
      endDate={globalRangeEnd}
      onCreate={createRow}
      onUpdate={updateRow}
      onDelete={deleteRow}
      busy={busyMutation}
    />
  )
}
