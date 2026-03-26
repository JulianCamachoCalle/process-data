import { useMemo } from 'react'
import type { RawSheetData } from '../../../services/sheetsData'
import CrudSection from './CrudSection'
import { filterRowRecordsByDateRange, toRowRecords } from './shared'

export default function GenericSheetSection({
  sheet,
  startDate,
  endDate,
  onCreate,
  onUpdate,
  onDelete,
  busy,
}: {
  sheet: RawSheetData
  startDate: Date | null
  endDate: Date | null
  onCreate: (sheetName: string, rowValues: string[]) => Promise<void>
  onUpdate: (sheetName: string, rowNumber: number, rowValues: string[]) => Promise<void>
  onDelete: (sheetName: string, rowNumber: number) => Promise<void>
  busy: boolean
}) {
  const visibleRecords = useMemo(
    () => filterRowRecordsByDateRange(toRowRecords(sheet), sheet.headers, startDate, endDate),
    [sheet, startDate, endDate],
  )

  return (
    <div className="min-w-0 space-y-5 overflow-hidden">
      <CrudSection
        sheet={sheet}
        title={`CRUD - ${sheet.sheetName}`}
        description="Gestiona filas en esta hoja dentro del rango de fechas seleccionado."
        visibleRecords={visibleRecords}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
        busy={busy}
      />
    </div>
  )
}
