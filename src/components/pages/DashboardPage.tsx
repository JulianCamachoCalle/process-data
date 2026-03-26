import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  CircleAlert,
  LayoutDashboard,
  LogOut,
  Medal,
  RefreshCcw,
  Store,
  Table2,
  UserRound,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useApp } from '../../context/AppContext'
import {
  appendSheetRow,
  deleteSheetRow,
  getSheetData,
  getSheetsData,
  getSpreadsheetSheetNames,
  HIDDEN_NAV_SHEETS,
  PRIMARY_ANALYTICS_SHEETS,
  type RawSheetData,
  updateSheetRow,
} from '../../services/sheetsData'
import { buildDashboardData } from '../../utils/dashboardTransforms'

interface NavItem {
  id: string
  label: string
  icon: ReactNode
  sectionType: 'home' | 'sheet' | 'vendor' | 'commissions' | 'monthly' | 'store' | 'ranking'
  sheetName?: string
}

interface RowRecord {
  rowNumber: number
  row: string[]
}

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

const SPECIAL_SHEETS = {
  vendorInfo: 'INFO VENDEDOR',
  commissionsLeads: 'COMISIONES Y LEADS',
  monthlySummary: 'RESUMEN MENSUAL',
  storeInfo: 'INFO TIENDA',
} as const

const MONTH_DATE_KEYS = ['fecha', 'date', 'dia', 'created', 'registro']
const VENDOR_KEYS = ['vendedor', 'nombre_vendedor', 'asesor', 'usuario', 'nombre']
const STORE_KEYS = ['tienda', 'sucursal', 'local', 'store', 'pdv']
const STATUS_KEYS = ['estado', 'status', 'resultado', 'situacion']

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function formatInt(value: number): string {
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 }).format(value)
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function parseDateValue(value: string): Date | null {
  if (!value) return null

  const trimmed = value.trim()

  if (/^\d{5}(?:\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed)
    if (!Number.isNaN(serial)) {
      const date = new Date(Math.round((serial - 25569) * 86400 * 1000))
      if (!Number.isNaN(date.getTime())) {
        return date
      }
    }
  }

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const day = Number(slash[1])
    const month = Number(slash[2]) - 1
    const yearRaw = Number(slash[3])
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw
    const date = new Date(year, month, day)
    if (!Number.isNaN(date.getTime())) return date
  }

  const date = new Date(trimmed)
  if (!Number.isNaN(date.getTime())) return date
  return null
}

function parseNumeric(value: string): number | null {
  if (!value) return null

  let cleaned = value.trim().replace(/[^\d,.-]/g, '')
  if (!cleaned) return null

  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.')
  }

  const parsed = Number(cleaned)
  return Number.isNaN(parsed) ? null : parsed
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((header) => normalizeKey(header))

  for (const candidate of candidates) {
    const exact = normalized.findIndex((header) => header === candidate)
    if (exact >= 0) return exact
  }

  for (const candidate of candidates) {
    const partial = normalized.findIndex((header) => header.includes(candidate))
    if (partial >= 0) return partial
  }

  return -1
}

function toRowRecords(sheet: RawSheetData | null): RowRecord[] {
  if (!sheet) return []

  return sheet.rows.map((row, index) => ({
    row,
    rowNumber: sheet.rowNumbers[index] || index + 2,
  }))
}

function truncateLabel(value: string, max = 22): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}...`
}

function categorySeriesFromColumn(records: RowRecord[], columnIndex: number, limit = 8): Array<{ name: string; value: number }> {
  const counter = new Map<string, number>()

  for (const record of records) {
    const cell = (record.row[columnIndex] || '').trim()
    const value = cell || 'Sin dato'
    counter.set(value, (counter.get(value) || 0) + 1)
  }

  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name: truncateLabel(name), value }))
}

function buildSheetOverview(sheet: RawSheetData) {
  const headers = sheet.headers
  const records = toRowRecords(sheet)

  const fillCounter = new Map<string, number>()
  let nonEmptyCells = 0

  for (const header of headers) {
    fillCounter.set(header, 0)
  }

  records.forEach((record) => {
    headers.forEach((header, columnIndex) => {
      const value = (record.row[columnIndex] || '').trim()
      if (!value) return
      nonEmptyCells += 1
      fillCounter.set(header, (fillCounter.get(header) || 0) + 1)
    })
  })

  const totalCells = headers.length * records.length
  const fillRate = totalCells > 0 ? nonEmptyCells / totalCells : 0

  const columnFillSeries = [...fillCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name: truncateLabel(name), value }))

  let bestCategoryColumn = -1
  let categorySeries: Array<{ name: string; value: number }> = []

  headers.forEach((_header, index) => {
    const candidateSeries = categorySeriesFromColumn(records, index)
    if (candidateSeries.length >= 2 && candidateSeries.length > categorySeries.length) {
      bestCategoryColumn = index
      categorySeries = candidateSeries
    }
  })

  let numericSeries: Array<{ row: number; value: number }> = []
  let numericColumn = -1

  headers.forEach((_header, index) => {
    if (numericSeries.length > 0) return

    const values: Array<{ row: number; value: number }> = []
    records.forEach((record, rowIndex) => {
      const parsed = parseNumeric(record.row[index] || '')
      if (parsed !== null) {
        values.push({ row: rowIndex + 1, value: parsed })
      }
    })

    if (values.length >= 4) {
      numericSeries = values.slice(0, 40)
      numericColumn = index
    }
  })

  return {
    fillRate,
    nonEmptyCells,
    totalCells,
    columnFillSeries,
    categorySeries,
    categoryColumn: bestCategoryColumn >= 0 ? headers[bestCategoryColumn] : '',
    numericSeries,
    numericColumn: numericColumn >= 0 ? headers[numericColumn] : '',
  }
}

function CrudSection({
  sheet,
  title,
  description,
  visibleRecords,
  onCreate,
  onUpdate,
  onDelete,
  busy,
}: {
  sheet: RawSheetData
  title: string
  description: string
  visibleRecords: RowRecord[]
  onCreate: (sheetName: string, rowValues: string[]) => Promise<void>
  onUpdate: (sheetName: string, rowNumber: number, rowValues: string[]) => Promise<void>
  onDelete: (sheetName: string, rowNumber: number) => Promise<void>
  busy: boolean
}) {
  const headers = sheet.headers
  const [createDraft, setCreateDraft] = useState<string[]>(() => headers.map(() => ''))
  const [editRowNumber, setEditRowNumber] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<string[]>([])

  useEffect(() => {
    setCreateDraft(headers.map(() => ''))
    setEditRowNumber(null)
    setEditDraft([])
  }, [sheet.sheetName, headers])

  const handleEditStart = (record: RowRecord) => {
    setEditRowNumber(record.rowNumber)
    setEditDraft(headers.map((_, index) => record.row[index] || ''))
  }

  const handleCreate = async () => {
    await onCreate(sheet.sheetName, createDraft)
    setCreateDraft(headers.map(() => ''))
  }

  const handleUpdate = async () => {
    if (editRowNumber === null) return
    await onUpdate(sheet.sheetName, editRowNumber, editDraft)
    setEditRowNumber(null)
    setEditDraft([])
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{description}</p>
      </div>

      {headers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          La hoja no tiene cabeceras. Agrega encabezados en la primera fila para habilitar CRUD.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Crear nuevo registro</p>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {headers.map((header, index) => (
                <label key={`create-${header}-${index + 1}`} className="text-xs text-slate-600">
                  {header}
                  <input
                    value={createDraft[index] || ''}
                    onChange={(event) => {
                      const next = [...createDraft]
                      next[index] = event.target.value
                      setCreateDraft(next)
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
                  />
                </label>
              ))}
            </div>
            <div className="mt-3">
              <button
                onClick={() => void handleCreate()}
                disabled={busy}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Crear fila
              </button>
            </div>
          </div>

          {editRowNumber !== null && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Editar fila {editRowNumber}</p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {headers.map((header, index) => (
                  <label key={`edit-${header}-${index + 1}`} className="text-xs text-amber-800">
                    {header}
                    <input
                      value={editDraft[index] || ''}
                      onChange={(event) => {
                        const next = [...editDraft]
                        next[index] = event.target.value
                        setEditDraft(next)
                      }}
                      className="mt-1 w-full rounded-lg border border-amber-300 px-2 py-1.5 text-sm text-slate-800"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => void handleUpdate()}
                  disabled={busy}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Guardar cambios
                </button>
                <button
                  onClick={() => {
                    setEditRowNumber(null)
                    setEditDraft([])
                  }}
                  className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="max-h-[460px] overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">Acciones</th>
                  {headers.map((header) => (
                    <th key={`header-${header}`} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((record) => (
                  <tr key={`row-${record.rowNumber}`} className="odd:bg-white even:bg-slate-50">
                    <td className="whitespace-nowrap border-b border-slate-100 px-2 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEditStart(record)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (!window.confirm(`Eliminar fila ${record.rowNumber} de ${sheet.sheetName}?`)) return
                            void onDelete(sheet.sheetName, record.rowNumber)
                          }}
                          className="rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-700"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                    {headers.map((_, index) => (
                      <td key={`cell-${record.rowNumber}-${index + 1}`} className="max-w-56 truncate border-b border-slate-100 px-3 py-2 text-slate-700">
                        {record.row[index] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function HomeSection({ sheets }: { sheets: RawSheetData[] }) {
  const dashboardData = useMemo(() => buildDashboardData(sheets), [sheets])
  const hasTimeline = dashboardData.globalTimeline.length > 0
  const hasStatus = dashboardData.statusDistribution.length > 0

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Registros Totales</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatInt(dashboardData.totalRecords)}</p>
          <p className="mt-1 text-xs text-slate-500">Solo hojas principales</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Hojas Principales</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatInt(sheets.length)}</p>
          <p className="mt-1 text-xs text-slate-500">Tiendas, envios, recojos y tarifa</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tarifa Promedio</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">S/ {dashboardData.tariffMetrics.average.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-500">Min {dashboardData.tariffMetrics.min.toFixed(2)} - Max {dashboardData.tariffMetrics.max.toFixed(2)}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Valores Tarifa</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatInt(dashboardData.tariffMetrics.count)}</p>
          <p className="mt-1 text-xs text-slate-500">Detectados para analitica</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Registros por hoja</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboardData.sheetStats} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-10} height={48} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#dc2626" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Tendencia mensual</h3>
          <div className="h-72">
            {hasTimeline ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboardData.globalTimeline} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="homeArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#dc2626" fill="url(#homeArea)" fillOpacity={1} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                No se detectaron columnas de fecha.
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Distribucion por estado</h3>
        <div className="h-80">
          {hasStatus ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dashboardData.statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={105}>
                  {dashboardData.statusDistribution.map((item, index) => (
                    <Cell key={`status-${item.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
              No se encontro una columna de estado en las hojas principales.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function GenericSheetModule({
  sheet,
  onCreate,
  onUpdate,
  onDelete,
  busy,
}: {
  sheet: RawSheetData
  onCreate: (sheetName: string, rowValues: string[]) => Promise<void>
  onUpdate: (sheetName: string, rowNumber: number, rowValues: string[]) => Promise<void>
  onDelete: (sheetName: string, rowNumber: number) => Promise<void>
  busy: boolean
}) {
  const overview = useMemo(() => buildSheetOverview(sheet), [sheet])

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Filas</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatInt(sheet.rows.length)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Columnas</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatInt(sheet.headers.length)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Completitud</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatPercent(overview.fillRate)}</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Cobertura por columna</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.columnFillSeries} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-8} height={44} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Distribucion principal</h3>
          <p className="mb-3 text-xs text-slate-500">Columna: {overview.categoryColumn || 'No detectada'}</p>
          <div className="h-72">
            {overview.categorySeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={overview.categorySeries} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}>
                    {overview.categorySeries.map((item, index) => (
                      <Cell key={`category-${item.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                Sin distribucion categorica util.
              </div>
            )}
          </div>
        </article>
      </section>

      <CrudSection
        sheet={sheet}
        title={`CRUD - ${sheet.sheetName}`}
        description="Crea, edita o elimina filas directamente en Google Sheets."
        visibleRecords={toRowRecords(sheet)}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
        busy={busy}
      />
    </div>
  )
}

function FilteredEntityModule({
  sheet,
  title,
  keyCandidates,
  onCreate,
  onUpdate,
  onDelete,
  busy,
}: {
  sheet: RawSheetData
  title: string
  keyCandidates: string[]
  onCreate: (sheetName: string, rowValues: string[]) => Promise<void>
  onUpdate: (sheetName: string, rowNumber: number, rowValues: string[]) => Promise<void>
  onDelete: (sheetName: string, rowNumber: number) => Promise<void>
  busy: boolean
}) {
  const records = useMemo(() => toRowRecords(sheet), [sheet])
  const keyColumn = useMemo(() => findColumnIndex(sheet.headers, keyCandidates), [sheet.headers, keyCandidates])
  const [selectedValue, setSelectedValue] = useState('')

  const options = useMemo(() => {
    if (keyColumn < 0) return []
    return [...new Set(records.map((record) => (record.row[keyColumn] || '').trim()).filter((value) => value.length > 0))]
      .sort((a, b) => a.localeCompare(b))
  }, [records, keyColumn])

  useEffect(() => {
    if (options.length === 0) {
      setSelectedValue('')
      return
    }

    if (!selectedValue || !options.includes(selectedValue)) {
      setSelectedValue(options[0])
    }
  }, [options, selectedValue])

  const filtered = useMemo(() => {
    if (keyColumn < 0 || !selectedValue) return records
    return records.filter((record) => (record.row[keyColumn] || '').trim() === selectedValue)
  }, [records, keyColumn, selectedValue])

  const statusColumn = useMemo(() => findColumnIndex(sheet.headers, STATUS_KEYS), [sheet.headers])
  const chartSeries = useMemo(() => {
    if (statusColumn >= 0) {
      return categorySeriesFromColumn(filtered, statusColumn)
    }

    const fallbackColumn = keyColumn >= 0 ? (keyColumn === 0 ? 1 : 0) : 0
    if (fallbackColumn >= 0 && fallbackColumn < sheet.headers.length) {
      return categorySeriesFromColumn(filtered, fallbackColumn)
    }

    return []
  }, [filtered, statusColumn, keyColumn, sheet.headers.length])

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">Selecciona una entidad para ver su informacion agrupada y gestionar registros.</p>

        {keyColumn >= 0 ? (
          <div className="mt-3 max-w-md">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {sheet.headers[keyColumn]}
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-800"
                value={selectedValue}
                onChange={(event) => setSelectedValue(event.target.value)}
              >
                {options.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            No se detecto columna clave para filtrar. Se muestra toda la data.
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Registros filtrados</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{formatInt(filtered.length)}</p>
          <p className="mt-1 text-xs text-slate-500">Total en hoja: {formatInt(records.length)}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Distribucion de estado/categoria</h3>
          <div className="h-56">
            {chartSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSeries} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-8} height={44} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                Sin datos suficientes para graficar.
              </div>
            )}
          </div>
        </article>
      </section>

      <CrudSection
        sheet={sheet}
        title={`CRUD - ${sheet.sheetName}`}
        description="Gestion completa de filas para este apartado filtrado."
        visibleRecords={filtered}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
        busy={busy}
      />
    </div>
  )
}

function MonthlySummaryModule({
  sheet,
  onCreate,
  onUpdate,
  onDelete,
  busy,
}: {
  sheet: RawSheetData
  onCreate: (sheetName: string, rowValues: string[]) => Promise<void>
  onUpdate: (sheetName: string, rowNumber: number, rowValues: string[]) => Promise<void>
  onDelete: (sheetName: string, rowNumber: number) => Promise<void>
  busy: boolean
}) {
  const records = useMemo(() => toRowRecords(sheet), [sheet])
  const dateColumn = useMemo(() => findColumnIndex(sheet.headers, MONTH_DATE_KEYS), [sheet.headers])

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const monthRecords = useMemo(() => {
    if (dateColumn < 0) return records

    return records.filter((record) => {
      const date = parseDateValue(record.row[dateColumn] || '')
      if (!date) return false
      return date >= startOfMonth && date <= endOfMonth
    })
  }, [records, dateColumn, startOfMonth, endOfMonth])

  const dailySeries = useMemo(() => {
    if (dateColumn < 0) return []

    const map = new Map<string, number>()
    monthRecords.forEach((record) => {
      const date = parseDateValue(record.row[dateColumn] || '')
      if (!date) return
      const key = `${date.getDate()}`.padStart(2, '0')
      map.set(key, (map.get(key) || 0) + 1)
    })

    return [...map.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([day, value]) => ({ day, value }))
  }, [monthRecords, dateColumn])

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">Resumen mensual</h3>
        <p className="mt-1 text-sm text-slate-600">
          Datos desde el {startOfMonth.toLocaleDateString('es-PE')} hasta el {endOfMonth.toLocaleDateString('es-PE')}.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Registros del mes</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{formatInt(monthRecords.length)}</p>
          <p className="mt-1 text-xs text-slate-500">Total en hoja: {formatInt(records.length)}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Distribucion diaria</h3>
          <div className="h-56">
            {dailySeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailySeries} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#16a34a" fill="#bbf7d0" fillOpacity={0.75} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                No hay fechas parseables en este mes.
              </div>
            )}
          </div>
        </article>
      </section>

      <CrudSection
        sheet={sheet}
        title={`CRUD - ${sheet.sheetName}`}
        description="Gestion mensual con alcance completo de la hoja."
        visibleRecords={monthRecords}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
        busy={busy}
      />
    </div>
  )
}

function RankingModule({ enviosSheet }: { enviosSheet: RawSheetData | null }) {
  const [selectedVendor, setSelectedVendor] = useState('')

  const rankingData = useMemo(() => {
    if (!enviosSheet) return [] as Array<{ vendedor: string; tienda: string; entregados: number; key: string }>

    const headers = enviosSheet.headers
    const records = toRowRecords(enviosSheet)
    const vendorCol = findColumnIndex(headers, VENDOR_KEYS)
    const storeCol = findColumnIndex(headers, STORE_KEYS)
    const statusCol = findColumnIndex(headers, STATUS_KEYS)

    if (vendorCol < 0 || storeCol < 0) return []

    const deliveredKeywords = ['entregado', 'entregada', 'completado', 'delivered']
    const counter = new Map<string, { vendedor: string; tienda: string; entregados: number }>()

    records.forEach((record) => {
      const vendedor = (record.row[vendorCol] || '').trim() || 'Sin vendedor'
      const tienda = (record.row[storeCol] || '').trim() || 'Sin tienda'

      if (statusCol >= 0) {
        const status = normalizeKey(record.row[statusCol] || '')
        const delivered = deliveredKeywords.some((keyword) => status.includes(keyword))
        if (!delivered) return
      }

      const key = `${vendedor}::${tienda}`
      const current = counter.get(key)

      if (current) {
        current.entregados += 1
      } else {
        counter.set(key, { vendedor, tienda, entregados: 1 })
      }
    })

    return [...counter.values()]
      .sort((a, b) => b.entregados - a.entregados)
      .map((item) => ({ ...item, key: `${item.vendedor}::${item.tienda}` }))
  }, [enviosSheet])

  const vendorOptions = useMemo(() => {
    return [...new Set(rankingData.map((item) => item.vendedor))].sort((a, b) => a.localeCompare(b))
  }, [rankingData])

  useEffect(() => {
    if (vendorOptions.length === 0) {
      setSelectedVendor('')
      return
    }

    if (!selectedVendor || !vendorOptions.includes(selectedVendor)) {
      setSelectedVendor(vendorOptions[0])
    }
  }, [vendorOptions, selectedVendor])

  const filtered = useMemo(() => {
    if (!selectedVendor) return rankingData.slice(0, 15)
    return rankingData.filter((item) => item.vendedor === selectedVendor).slice(0, 15)
  }, [rankingData, selectedVendor])

  const chartData = filtered.map((item) => ({
    name: truncateLabel(item.tienda),
    entregados: item.entregados,
  }))

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">Ranking de tiendas por vendedor</h3>
        <p className="mt-1 text-sm text-slate-600">Base: DATA ENVIOS con estado entregado/completado.</p>

        <div className="mt-3 max-w-md">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Vendedor
            <select
              value={selectedVendor}
              onChange={(event) => setSelectedVendor(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-800"
            >
              {vendorOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Top tiendas entregadas</h3>
          <div className="h-72">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-10} height={50} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="entregados" fill="#f97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                No hay registros entregados para el ranking.
              </div>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Tabla ranking</h3>
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">#</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">Tienda</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">Entregados</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => (
                  <tr key={item.key} className="odd:bg-white even:bg-slate-50">
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{index + 1}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{item.tienda}</td>
                    <td className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-900">{item.entregados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  )
}

export default function DashboardPage() {
  const { user, spreadsheetId, spreadsheetTitle, signOut } = useApp()
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

  const loadSheet = useCallback(async (sheetName: string, force = false): Promise<RawSheetData | null> => {
    try {
      const data = await getSheetData(sheetName, { force })
      mergeSheets([data])
      return data
    } catch {
      return null
    }
  }, [mergeSheets])

  const initializeDashboard = useCallback(async () => {
    setInitialLoading(true)
    setError(null)

    try {
      const names = await getSpreadsheetSheetNames()
      setAvailableSheetNames(names)

      const initialNames = PRIMARY_ANALYTICS_SHEETS.filter((sheetName) => names.includes(sheetName))
      if (initialNames.length > 0) {
        const initialSheets = await getSheetsData(initialNames)
        mergeSheets(initialSheets)
      }
    } catch (initError) {
      console.error('Dashboard init error:', initError)
      setError('No se pudo inicializar el panel admin con Google Sheets.')
    } finally {
      setInitialLoading(false)
    }
  }, [mergeSheets])

  useEffect(() => {
    void initializeDashboard()
  }, [initializeDashboard])

  const hiddenSet = useMemo(() => new Set(HIDDEN_NAV_SHEETS.map((name) => normalizeKey(name))), [])

  const customModules = useMemo<NavItem[]>(
    () => [
      { id: 'home', label: 'Inicio', icon: <LayoutDashboard size={16} />, sectionType: 'home' },
      { id: 'special-info-vendedor', label: 'Info vendedor', icon: <UserRound size={16} />, sectionType: 'vendor', sheetName: SPECIAL_SHEETS.vendorInfo },
      { id: 'special-comisiones-leads', label: 'Comisiones y leads', icon: <UserRound size={16} />, sectionType: 'commissions', sheetName: SPECIAL_SHEETS.commissionsLeads },
      { id: 'special-resumen-mensual', label: 'Resumen mensual', icon: <Table2 size={16} />, sectionType: 'monthly', sheetName: SPECIAL_SHEETS.monthlySummary },
      { id: 'special-info-tienda', label: 'Info tienda', icon: <Store size={16} />, sectionType: 'store', sheetName: SPECIAL_SHEETS.storeInfo },
      { id: 'special-ranking', label: 'Ranking tiendas x vendedor', icon: <Medal size={16} />, sectionType: 'ranking' },
    ],
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

  const visibleExtraSheetItems = useMemo<NavItem[]>(() => {
    const reserved = new Set([
      ...PRIMARY_ANALYTICS_SHEETS.map((name) => normalizeKey(name)),
      normalizeKey(SPECIAL_SHEETS.vendorInfo),
      normalizeKey(SPECIAL_SHEETS.commissionsLeads),
      normalizeKey(SPECIAL_SHEETS.monthlySummary),
      normalizeKey(SPECIAL_SHEETS.storeInfo),
    ])

    return availableSheetNames
      .filter((sheetName) => !hiddenSet.has(normalizeKey(sheetName)) && !reserved.has(normalizeKey(sheetName)))
      .map((sheetName) => ({
        id: `sheet-extra:${sheetName}`,
        label: sheetName,
        icon: <Table2 size={16} />,
        sectionType: 'sheet' as const,
        sheetName,
      }))
  }, [availableSheetNames, hiddenSet])

  const navItems = useMemo(() => {
    return [...customModules, ...primarySheetItems, ...visibleExtraSheetItems]
  }, [customModules, primarySheetItems, visibleExtraSheetItems])

  const activeItem = useMemo(
    () => navItems.find((item) => item.id === activeSection) || navItems[0] || null,
    [navItems, activeSection],
  )

  useEffect(() => {
    if (!activeItem && navItems.length > 0) {
      setActiveSection(navItems[0].id)
    }
  }, [activeItem, navItems])

  const ensureRequiredSheets = useCallback(async (item: NavItem | null) => {
    if (!item) return

    const needed = new Set<string>()

    if (item.sectionType === 'sheet' && item.sheetName) {
      needed.add(item.sheetName)
    }

    if (item.sectionType === 'vendor' && item.sheetName) {
      needed.add(item.sheetName)
    }

    if (item.sectionType === 'commissions' && item.sheetName) {
      needed.add(item.sheetName)
    }

    if (item.sectionType === 'monthly' && item.sheetName) {
      needed.add(item.sheetName)
    }

    if (item.sectionType === 'store' && item.sheetName) {
      needed.add(item.sheetName)
    }

    if (item.sectionType === 'ranking') {
      needed.add('DATA ENVIOS')
      needed.add('Tiendas')
    }

    if (item.sectionType === 'home') {
      PRIMARY_ANALYTICS_SHEETS.forEach((sheetName) => needed.add(sheetName))
    }

    const missing = [...needed].filter((sheetName) => !getCachedSheet(sheetName))
    if (missing.length === 0) return

    setSectionLoading(true)
    setStatusMessage('')
    const loaded = await getSheetsData(missing)
    mergeSheets(loaded)
    setSectionLoading(false)
  }, [getCachedSheet, mergeSheets])

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

  const homeSheets = useMemo(() => {
    return PRIMARY_ANALYTICS_SHEETS
      .map((sheetName) => getCachedSheet(sheetName))
      .filter((sheet): sheet is RawSheetData => Boolean(sheet))
  }, [getCachedSheet])

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

  const handleCreate = useCallback(async (sheetName: string, rowValues: string[]) => {
    await executeMutation(async () => {
      await appendSheetRow(sheetName, rowValues)
      await loadSheet(sheetName, true)
    })
  }, [executeMutation, loadSheet])

  const handleUpdate = useCallback(async (sheetName: string, rowNumber: number, rowValues: string[]) => {
    await executeMutation(async () => {
      await updateSheetRow(sheetName, rowNumber, rowValues)
      await loadSheet(sheetName, true)
    })
  }, [executeMutation, loadSheet])

  const handleDelete = useCallback(async (sheetName: string, rowNumber: number) => {
    await executeMutation(async () => {
      await deleteSheetRow(sheetName, rowNumber)
      await loadSheet(sheetName, true)
    })
  }, [executeMutation, loadSheet])

  const refreshCurrentSection = useCallback(async () => {
    if (!activeItem) return

    setSectionLoading(true)
    setStatusMessage('')

    const toForce = new Set<string>()
    if (activeItem.sheetName) toForce.add(activeItem.sheetName)

    if (activeItem.sectionType === 'home') {
      PRIMARY_ANALYTICS_SHEETS.forEach((sheetName) => toForce.add(sheetName))
    }

    if (activeItem.sectionType === 'ranking') {
      toForce.add('DATA ENVIOS')
      toForce.add('Tiendas')
    }

    for (const name of toForce) {
      await loadSheet(name, true)
    }

    setSectionLoading(false)
    setStatusMessage('Datos actualizados para la seccion actual.')
  }, [activeItem, loadSheet])

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
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => void initializeDashboard()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <RefreshCcw size={15} />
              Reintentar
            </button>
          </div>
        </section>
      </main>
    )
  }

  const activeSheet = activeItem?.sheetName ? getCachedSheet(activeItem.sheetName) : null

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto grid max-w-[1500px] gap-4 md:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:sticky md:top-6 md:h-[calc(100vh-3rem)] md:overflow-auto">
          <div className="mb-4 rounded-2xl bg-slate-900 px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-300">Admin Profesional</p>
            <h1 className="mt-1 text-lg font-bold">Clientes Nuevos Data</h1>
            <p className="mt-1 text-xs text-slate-300">{user?.name || 'Usuario'}</p>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = item.id === activeSection
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id)
                    setStatusMessage('')
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                    active
                      ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Carga optimizada</p>
            <p className="mt-1">Las hojas se cargan por seccion y se cachean temporalmente.</p>
            <p className="mt-1">Hojas detectadas: {formatInt(availableSheetNames.length)}</p>
          </div>
        </aside>

        <section className="space-y-4">
          <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-600">Panel Administrativo</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">{activeItem?.label || 'Inicio'}</h2>
                <p className="mt-2 text-sm text-slate-600">{spreadsheetTitle || 'Google Sheet'}</p>
                <p className="mt-1 break-all text-xs text-slate-500">{spreadsheetId}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void refreshCurrentSection()}
                  disabled={sectionLoading || busyMutation}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <RefreshCcw size={15} />
                  Actualizar seccion
                </button>
                <button
                  onClick={signOut}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <LogOut size={15} />
                  Cerrar sesion
                </button>
              </div>
            </div>

            {sectionLoading && (
              <p className="mt-3 text-sm text-slate-500">Cargando informacion de la seccion...</p>
            )}
            {statusMessage && (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p>
            )}
            {error && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            )}
          </header>

          {activeItem?.sectionType === 'home' && (
            <HomeSection sheets={homeSheets} />
          )}

          {activeItem?.sectionType === 'sheet' && activeSheet && (
            <GenericSheetModule
              sheet={activeSheet}
              onCreate={handleCreate}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              busy={busyMutation}
            />
          )}

          {activeItem?.sectionType === 'vendor' && activeSheet && (
            <FilteredEntityModule
              sheet={activeSheet}
              title="Apartado de informacion por vendedor"
              keyCandidates={VENDOR_KEYS}
              onCreate={handleCreate}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              busy={busyMutation}
            />
          )}

          {activeItem?.sectionType === 'commissions' && activeSheet && (
            <FilteredEntityModule
              sheet={activeSheet}
              title="Comisiones y leads por vendedor"
              keyCandidates={VENDOR_KEYS}
              onCreate={handleCreate}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              busy={busyMutation}
            />
          )}

          {activeItem?.sectionType === 'store' && activeSheet && (
            <FilteredEntityModule
              sheet={activeSheet}
              title="Informacion de tienda por selector"
              keyCandidates={STORE_KEYS}
              onCreate={handleCreate}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              busy={busyMutation}
            />
          )}

          {activeItem?.sectionType === 'monthly' && activeSheet && (
            <MonthlySummaryModule
              sheet={activeSheet}
              onCreate={handleCreate}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              busy={busyMutation}
            />
          )}

          {activeItem?.sectionType === 'ranking' && (
            <RankingModule enviosSheet={getCachedSheet('DATA ENVIOS')} />
          )}

          {activeItem?.sheetName && !activeSheet && !sectionLoading && (
            <article className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <CircleAlert size={16} />
                No se pudo cargar la hoja {activeItem.sheetName}. Verifica que exista y tenga permisos.
              </div>
            </article>
          )}
        </section>
      </div>
    </main>
  )
}
