import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
    CircleAlert,
    LayoutDashboard,
    LogOut,
    RefreshCcw,
    Table2,
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
    PRIMARY_ANALYTICS_SHEETS,
    type RawSheetData,
    updateSheetRow,
} from '../../services/sheetsData'

interface NavItem {
    id: string
    label: string
    icon: ReactNode
    sectionType: 'home' | 'sheet' | 'vendor' | 'commissions' | 'monthly' | 'store' | 'ranking'
    sheetName?: string
}

interface NavSection {
    id: string
    title: string
    items: NavItem[]
}

interface RowRecord {
    rowNumber: number
    row: string[]
}

interface DataPoint {
    name: string
    value: number
}

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

const SPECIAL_SHEETS = {
    vendorInfo: 'INFO VENDEDOR',
    commissionsLeads: 'COMISIONES Y LEADS',
    monthlySummary: 'RESUMEN MENSUAL',
    storeInfo: 'INFO TIENDA',
} as const

const MONTH_DATE_KEYS = ['fecha', 'date', 'dia', 'created', 'registro', 'mes']
const VENDOR_KEYS = ['Vendedor']
const STORE_KEYS = ['Nombre tienda']
const STATUS_KEYS = ['estado', 'status', 'resultado', 'situacion']
const INGRESO_ENVIOS_KEYS = ['ingreso total fila (s/)']
const INGRESO_RECOJO_KEYS = ['ingreso recojo total (s/)']
const COSTO_ENVIO_KEYS = ['costo total operativo', 'costo operativo envios', 'costo total envios', 'costo envios']
const COSTO_RECOJO_TOTAL_KEYS = ['costos recojo total', 'costo recojo total', 'pago motorizado recojo']
const ANULADOS_FILMENT_KEYS = ['ingresos anulados filment', 'ingresos anulados', 'ingreso anulados', 'anulados filment']
const TIPO_RECOJO_KEYS = ['tipo recojo', 'tipo de recojo']
const RECOJO_VECES_KEYS = ['veces']
const COMISIONES_TOTALES_KEYS = ['comisiones totales', 'comision total', 'total comisiones', 'comisiones_total']
const DISTRITO_KEYS = ['distrito', 'district']

const SECTION_DESCRIPTIONS: Record<NavItem['sectionType'], string> = {
    home: 'Vista ejecutiva consolidada de metricas operativas y financieras.',
    sheet: 'Exploracion y gestion CRUD sobre la hoja seleccionada.',
    vendor: 'Analisis y gestion de registros agrupados por vendedor.',
    commissions: 'Seguimiento de comisiones y leads por vendedor.',
    monthly: 'Resumen operativo diario dentro del rango de fechas activo.',
    store: 'Consulta y mantenimiento de informacion por tienda.',
    ranking: 'Ranking de rendimiento por tiendas filtrado por vendedor.',
}

function normalizeKey(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

function normalizeColumnKey(value: string): string {
    return normalizeKey(value).replace(/[^a-z0-9]/g, '')
}

function tokenizeKey(value: string): string[] {
    return normalizeKey(value)
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
}

function formatInt(value: number): string {
    return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 }).format(value)
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN',
        maximumFractionDigits: 2,
    }).format(value)
}

function parseDateValue(value: string): Date | null {
    if (!value) return null

    const trimmed = value.trim()
    const normalizedNumeric = trimmed.replace(',', '.')

    if (/^\d{5}(?:[\.,]\d+)?$/.test(trimmed)) {
        const serial = Number(normalizedNumeric)
        if (!Number.isNaN(serial)) {
            // Convert Excel serial days to a local calendar date without UTC shift.
            const days = Math.floor(serial)
            const date = new Date(1899, 11, 30)
            date.setHours(0, 0, 0, 0)
            date.setDate(date.getDate() + days)
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

function formatDateInputValue(date: Date): string {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
}

function parseDateInputValue(value: string, endOfDay = false): Date | null {
    if (!value) return null
    const [yearStr, monthStr, dayStr] = value.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)

    if (!year || !month || !day) return null

    return endOfDay
        ? new Date(year, month - 1, day, 23, 59, 59, 999)
        : new Date(year, month - 1, day, 0, 0, 0, 0)
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
    const normalizedHeaders = headers.map((header, index) => ({
        index,
        raw: normalizeKey(header),
        compact: normalizeColumnKey(header),
        tokens: tokenizeKey(header),
    }))

    const normalizedCandidates = candidates
        .map((candidate) => ({
            raw: normalizeKey(candidate),
            compact: normalizeColumnKey(candidate),
            tokens: tokenizeKey(candidate),
        }))
        .filter((candidate) => candidate.raw.length > 0 && candidate.compact.length > 0)

    for (const candidate of normalizedCandidates) {
        const exact = normalizedHeaders.findIndex(
            (header) => header.raw === candidate.raw || header.compact === candidate.compact,
        )
        if (exact >= 0) return exact
    }

    let bestIndex = -1
    let bestScore = -1

    normalizedHeaders.forEach((header) => {
        normalizedCandidates.forEach((candidate) => {
            let score = 0

            if (header.compact.includes(candidate.compact) || candidate.compact.includes(header.compact)) {
                score += 6
            }

            if (header.raw.includes(candidate.raw) || candidate.raw.includes(header.raw)) {
                score += 4
            }

            const candidateTokenSet = new Set(candidate.tokens)
            const sharedTokens = header.tokens.filter((token) => candidateTokenSet.has(token)).length
            if (sharedTokens > 0) {
                score += sharedTokens
            }

            if (candidate.tokens.length > 1 && sharedTokens === candidate.tokens.length) {
                score += 5
            }

            if (candidate.compact.length <= 5) {
                score -= 2
            }

            if (score > bestScore) {
                bestScore = score
                bestIndex = header.index
            }
        })
    })

    if (bestScore >= 4) {
        return bestIndex
    }

    return -1
}

function findColumnByTokenGroups(headers: string[], tokenGroups: string[][]): number {
    const normalizedHeaders = headers.map((header, index) => ({
        index,
        compact: normalizeColumnKey(header),
    }))

    const normalizedGroups = tokenGroups
        .map((group) => group.map((token) => normalizeColumnKey(token)).filter((token) => token.length > 0))
        .filter((group) => group.length > 0)

    let bestIndex = -1
    let bestScore = -1

    normalizedHeaders.forEach((header) => {
        normalizedGroups.forEach((group) => {
            const matched = group.filter((token) => header.compact.includes(token)).length
            if (matched === 0) return

            const allMatched = matched === group.length
            const score = (allMatched ? 100 : 0) + matched * 10

            if (score > bestScore) {
                bestScore = score
                bestIndex = header.index
            }
        })
    })

    return bestScore >= 20 ? bestIndex : -1
}

function findMetricColumnIndex(headers: string[], aliases: string[], tokenGroups: string[][]): number {
    const primary = findColumnIndex(headers, aliases)
    if (primary >= 0) return primary
    return findColumnByTokenGroups(headers, tokenGroups)
}

function toRowRecords(sheet: RawSheetData | null): RowRecord[] {
    if (!sheet) return []

    return sheet.rows.map((row, index) => ({
        row,
        rowNumber: sheet.rowNumbers[index] || index + 2,
    }))
}

function filterRowRecordsByDateRange(
    records: RowRecord[],
    headers: string[],
    startDate: Date | null,
    endDate: Date | null,
    dateCandidates: string[] = MONTH_DATE_KEYS,
): RowRecord[] {
    if (records.length === 0) return []

    const dateIndex = findColumnIndex(headers, dateCandidates)
    if (dateIndex < 0) return records

    const parsed = records
        .map((record) => ({ record, date: parseDateValue(record.row[dateIndex] || '') }))
        .filter((item) => item.date)

    if (parsed.length === 0) return records

    return parsed
        .filter((item) => {
            const value = item.date as Date
            if (startDate && value < startDate) return false
            if (endDate && value > endDate) return false
            return true
        })
        .map((item) => item.record)
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

function buildSheetOverview(sheet: RawSheetData, recordsOverride?: RowRecord[]) {
    const headers = sheet.headers
    const records = recordsOverride ?? toRowRecords(sheet)

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
        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
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

type HomeMetrics = {
    periodLabel: string
    tiendasRegistradas: number
    leadsGanados: number
    enviosTotales: number
    promedioEnviosPorTienda: number
    ingresoTotalOperativo: number
    costoTotalOperativo: number
    margen: number
    ticketPromedioMes: number
    costoOperativoPorLeadGanado: number
    ingresoPorLeadGanado: number
    ingresoTotalAnuladosFilment: number
    recojosCobrados: number
    recojosGratis: number
    pagoTotalMotorizadoRecojos: number
    comisionTotalVendedores: number
    costoTotalMasComision: number
    margenMenosComision: number
    costoPorLeadGanadoMasComision: number
    distritoLeadMasFrecuente: string
    topDistritosLeads: DataPoint[]
}

function getRowsForDateRange(
    sheet: RawSheetData | undefined,
    startDate: Date | null,
    endDate: Date | null,
    dateCandidates: string[] = MONTH_DATE_KEYS,
): string[][] {
    if (!sheet || sheet.rows.length === 0) return []

    const dateIndex = findColumnIndex(sheet.headers, dateCandidates)
    if (dateIndex < 0) return sheet.rows

    const parsedRows = sheet.rows
        .map((row) => ({ row, date: parseDateValue(row[dateIndex] || '') }))
        .filter((item) => item.date)

    if (parsedRows.length === 0) return sheet.rows

    return parsedRows
        .filter((item) => {
            const value = item.date as Date
            if (startDate && value < startDate) return false
            if (endDate && value > endDate) return false
            return true
        })
        .map((item) => item.row)
}

function getDateBoundsFromSheet(
    sheet: RawSheetData | undefined,
    dateCandidates: string[] = MONTH_DATE_KEYS,
): { min: Date | null; max: Date | null } {
    if (!sheet || sheet.rows.length === 0) {
        return { min: null, max: null }
    }

    const dateIndex = findColumnIndex(sheet.headers, dateCandidates)
    if (dateIndex < 0) {
        return { min: null, max: null }
    }

    const dates = sheet.rows
        .map((row) => parseDateValue(row[dateIndex] || ''))
        .filter((value): value is Date => Boolean(value))

    if (dates.length === 0) {
        return { min: null, max: null }
    }

    let min = dates[0]
    let max = dates[0]

    dates.forEach((date) => {
        if (date < min) min = date
        if (date > max) max = date
    })

    return { min, max }
}

function sumFromColumn(rows: string[][], index: number): number {
    if (index < 0) return 0
    return rows.reduce((accumulator, row) => accumulator + (parseNumeric(row[index]) || 0), 0)
}

function buildHomeMetrics({
    tiendasSheet,
    enviosSheet,
    recojosSheet,
    comisionesSheet,
    startDate,
    endDate,
}: {
    tiendasSheet?: RawSheetData
    enviosSheet?: RawSheetData
    recojosSheet?: RawSheetData
    comisionesSheet?: RawSheetData
    startDate: Date | null
    endDate: Date | null
}): HomeMetrics {
    const tiendasRows = getRowsForDateRange(tiendasSheet, startDate, endDate)
    const enviosRows = getRowsForDateRange(enviosSheet, startDate, endDate)
    const recojosRows = getRowsForDateRange(recojosSheet, startDate, endDate)
    const comisionesRows = getRowsForDateRange(comisionesSheet, startDate, endDate)

    const tiendaIndex = findColumnIndex(tiendasSheet?.headers || [], STORE_KEYS)
    const tiendasRegistradas =
        tiendaIndex >= 0
            ? new Set(tiendasRows.map((row) => (row[tiendaIndex] || '').trim()).filter((value) => value.length > 0)).size
            : tiendasRows.length

    const leadsGanados = tiendasRows.length
    const leadWeightByRow = tiendasRows.map(() => 1)

    const enviosTotales = enviosRows.length
    const ingresoEnviosIndex = findMetricColumnIndex(
        enviosSheet?.headers || [],
        INGRESO_ENVIOS_KEYS,
        [
            ['ingreso', 'fila'],
            ['ingreso', 'envio'],
            ['total', 'envio'],
        ],
    )
    const costoEnviosIndex = findMetricColumnIndex(
        enviosSheet?.headers || [],
        COSTO_ENVIO_KEYS,
        [
            ['Costo total fila (S/)'],
        ],
    )
    const ingresoRecojoIndex = findMetricColumnIndex(
        recojosSheet?.headers || [],
        INGRESO_RECOJO_KEYS,
        [
            ['ingreso', 'recojo'],
            ['total', 'recojo'],
        ],
    )
    const costoRecojoTotalIndex = findMetricColumnIndex(
        recojosSheet?.headers || [],
        COSTO_RECOJO_TOTAL_KEYS,
        [
            ['Costo recojo total (S/)'],
        ],
    )
    const ingresosAnuladosIndex = findMetricColumnIndex(
        tiendasSheet?.headers || [],
        ANULADOS_FILMENT_KEYS,
        [
            ['ingreso', 'anulado'],
            ['anulados', 'filment'],
            ['anulado'],
        ],
    )
    const tipoRecojoIndex = findMetricColumnIndex(
        recojosSheet?.headers || [],
        TIPO_RECOJO_KEYS,
        [['Tipo recojo']],
    )
    const recojoVecesIndex = findMetricColumnIndex(
        recojosSheet?.headers || [],
        RECOJO_VECES_KEYS,
        [
            ['veces'],
            ['cantidad', 'veces'],
        ],
    )
    const comisionesTotalesIndex = findMetricColumnIndex(
        comisionesSheet?.headers || [],
        COMISIONES_TOTALES_KEYS,
        [
            ['comision', 'total'],
            ['comisiones', 'totales'],
        ],
    )
    const distritoIndex = findMetricColumnIndex(
        tiendasSheet?.headers || [],
        DISTRITO_KEYS,
        [['distrito']],
    )

    const ingresoTotalEnvios = sumFromColumn(enviosRows, ingresoEnviosIndex)
    const ingresoTotalRecojos = sumFromColumn(recojosRows, ingresoRecojoIndex)
    const costoTotalEnvios = sumFromColumn(enviosRows, costoEnviosIndex)
    const costoRecojoTotal = sumFromColumn(recojosRows, costoRecojoTotalIndex)
    const pagoTotalMotorizadoRecojos = sumFromColumn(recojosRows, costoRecojoTotalIndex)
    const ingresoTotalAnuladosFilment = sumFromColumn(tiendasRows, ingresosAnuladosIndex)

    const ingresoTotalOperativo = ingresoTotalEnvios + ingresoTotalRecojos + ingresoTotalAnuladosFilment
    const costoTotalOperativo = costoTotalEnvios + costoRecojoTotal
    const margen = ingresoTotalOperativo - costoTotalOperativo

    const enviosConIngresoPositivo = enviosRows.filter((row) => (parseNumeric(row[ingresoEnviosIndex]) || 0) > 0).length
    const ticketPromedioMes = enviosConIngresoPositivo > 0 ? ingresoTotalEnvios / enviosConIngresoPositivo : 0
    const promedioEnviosPorTienda = tiendasRegistradas > 0 ? enviosTotales / tiendasRegistradas : 0

    const costoOperativoPorLeadGanado = leadsGanados > 0 ? costoTotalOperativo / leadsGanados : 0
    const ingresoPorLeadGanado = leadsGanados > 0 ? ingresoTotalOperativo / leadsGanados : 0

    const recojoCobradoKey = normalizeKey('1 pedido (cobra S/8)')
    const recojoGratisKey = normalizeKey('2+ entregados (gratis)')

    const recojoTypeTotals = tipoRecojoIndex >= 0 && recojoVecesIndex >= 0
        ? recojosRows.reduce(
            (accumulator, row) => {
                const recojoTypeValue = normalizeKey(row[tipoRecojoIndex] || '')
                const veces = parseNumeric(row[recojoVecesIndex] || '') || 0

                if (veces <= 0) {
                    return accumulator
                }

                if (recojoTypeValue.includes(recojoCobradoKey)) {
                    accumulator.cobrados += veces
                }

                if (recojoTypeValue.includes(recojoGratisKey)) {
                    accumulator.gratis += veces
                }

                return accumulator
            },
            { cobrados: 0, gratis: 0 },
        )
        : { cobrados: 0, gratis: 0 }

    const recojosCobrados = recojoTypeTotals.cobrados
    const recojosGratis = recojoTypeTotals.gratis

    const comisionTotalVendedores = sumFromColumn(comisionesRows, comisionesTotalesIndex)
    const costoTotalMasComision = costoTotalOperativo + comisionTotalVendedores
    const margenMenosComision = ingresoTotalOperativo - costoTotalMasComision
    const costoPorLeadGanadoMasComision = leadsGanados > 0 ? costoTotalMasComision / leadsGanados : 0

    const distritoCounter = new Map<string, number>()
    if (distritoIndex >= 0) {
        tiendasRows.forEach((row, index) => {
            const distrito = (row[distritoIndex] || '').trim()
            if (!distrito) return
            const weight = leadWeightByRow[index] || 0
            if (weight <= 0) return
            distritoCounter.set(distrito, (distritoCounter.get(distrito) || 0) + weight)
        })
    }

    const topDistritosLeads = [...distritoCounter.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 10)

    return {
        periodLabel: `${(startDate || new Date(0)).toLocaleDateString('es-PE')} - ${(endDate || new Date()).toLocaleDateString('es-PE')}`,
        tiendasRegistradas,
        leadsGanados,
        enviosTotales,
        promedioEnviosPorTienda,
        ingresoTotalOperativo,
        costoTotalOperativo,
        margen,
        ticketPromedioMes,
        costoOperativoPorLeadGanado,
        ingresoPorLeadGanado,
        ingresoTotalAnuladosFilment,
        recojosCobrados,
        recojosGratis,
        pagoTotalMotorizadoRecojos,
        comisionTotalVendedores,
        costoTotalMasComision,
        margenMenosComision,
        costoPorLeadGanadoMasComision,
        distritoLeadMasFrecuente: topDistritosLeads[0]?.name || 'Sin datos',
        topDistritosLeads,
    }
}

function HomeSection({
    tiendasSheet,
    enviosSheet,
    recojosSheet,
    comisionesSheet,
    startDate,
    endDate,
}: {
    tiendasSheet?: RawSheetData
    enviosSheet?: RawSheetData
    recojosSheet?: RawSheetData
    comisionesSheet?: RawSheetData
    startDate: Date | null
    endDate: Date | null
}) {
    const metrics = useMemo(
        () => buildHomeMetrics({ tiendasSheet, enviosSheet, recojosSheet, comisionesSheet, startDate, endDate }),
        [tiendasSheet, enviosSheet, recojosSheet, comisionesSheet, startDate, endDate],
    )

    return (
        <div className="space-y-5">

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tiendas registradas</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatInt(metrics.tiendasRegistradas)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Leads ganados</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatInt(metrics.leadsGanados)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Envios totales</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatInt(metrics.enviosTotales)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Promedio envios por tienda</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{metrics.promedioEnviosPorTienda.toFixed(0)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ingreso total operativo</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(metrics.ingresoTotalOperativo)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Costo total operativo</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(metrics.costoTotalOperativo)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Margen</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(metrics.margen)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ticket promedio mes</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(metrics.ticketPromedioMes)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Costo operativo por lead ganado</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(metrics.costoOperativoPorLeadGanado)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ingreso por lead ganado</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(metrics.ingresoPorLeadGanado)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ingreso total anulados filment</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(metrics.ingresoTotalAnuladosFilment)}</p>
                </article>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Recojos cobrados</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatInt(metrics.recojosCobrados)}</p>
                    <p className="mt-1 text-xs text-slate-500">Tipo: 1 pedido (cobra S/8)</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Recojos gratis</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatInt(metrics.recojosGratis)}</p>
                    <p className="mt-1 text-xs text-slate-500">Tipo: 2+ entregados (gratis)</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pago total motorizado por recojos</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(metrics.pagoTotalMotorizadoRecojos)}</p>
                </article>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Comision total vendedores</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(metrics.comisionTotalVendedores)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Costo total + comision</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(metrics.costoTotalMasComision)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Margen - comision</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(metrics.margenMenosComision)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Costo por lead ganado + comision</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(metrics.costoPorLeadGanadoMasComision)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Distrito lead mas frecuente</p>
                    <p className="mt-2 text-xl font-bold text-slate-900">{metrics.distritoLeadMasFrecuente}</p>
                </article>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Top 10 distritos con mas leads ganados</h3>
                <div className="h-80">
                    {metrics.topDistritosLeads.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={metrics.topDistritosLeads} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-10} height={56} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Bar dataKey="value" fill="#c70202" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="grid h-full place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                            No se encontraron leads ganados por distrito en el periodo actual.
                        </div>
                    )}
                </div>
            </section>
        </div>
    )
}

function GenericSheetModule({
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
    const overview = useMemo(() => buildSheetOverview(sheet, visibleRecords), [sheet, visibleRecords])

    return (
        <div className="space-y-5">
            <section className="grid gap-4 md:grid-cols-3">
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Filas</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatInt(visibleRecords.length)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Columnas</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatInt(sheet.headers.length)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Completitud</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatPercent(overview.fillRate)}</p>
                </article>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
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

                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
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
                visibleRecords={visibleRecords}
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
    startDate,
    endDate,
    onCreate,
    onUpdate,
    onDelete,
    busy,
}: {
    sheet: RawSheetData
    title: string
    keyCandidates: string[]
    startDate: Date | null
    endDate: Date | null
    onCreate: (sheetName: string, rowValues: string[]) => Promise<void>
    onUpdate: (sheetName: string, rowNumber: number, rowValues: string[]) => Promise<void>
    onDelete: (sheetName: string, rowNumber: number) => Promise<void>
    busy: boolean
}) {
    const records = useMemo(
        () => filterRowRecordsByDateRange(toRowRecords(sheet), sheet.headers, startDate, endDate),
        [sheet, startDate, endDate],
    )
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
            <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
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
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Registros filtrados</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{formatInt(filtered.length)}</p>
                    <p className="mt-1 text-xs text-slate-500">Total en hoja: {formatInt(records.length)}</p>
                </article>

                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
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
    const records = useMemo(
        () => filterRowRecordsByDateRange(toRowRecords(sheet), sheet.headers, startDate, endDate),
        [sheet, startDate, endDate],
    )
    const dateColumn = useMemo(() => findColumnIndex(sheet.headers, MONTH_DATE_KEYS), [sheet.headers])

    const scopedRecords = useMemo(() => {
        if (dateColumn < 0) return records

        return records.filter((record) => {
            const date = parseDateValue(record.row[dateColumn] || '')
            return Boolean(date)
        })
    }, [records, dateColumn])

    const dailySeries = useMemo(() => {
        if (dateColumn < 0) return []

        const map = new Map<string, number>()
        scopedRecords.forEach((record) => {
            const date = parseDateValue(record.row[dateColumn] || '')
            if (!date) return
            const key = `${date.getDate()}`.padStart(2, '0')
            map.set(key, (map.get(key) || 0) + 1)
        })

        return [...map.entries()]
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([day, value]) => ({ day, value }))
    }, [scopedRecords, dateColumn])

    return (
        <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                <h3 className="text-lg font-bold text-slate-900">Resumen por rango</h3>
                <p className="mt-1 text-sm text-slate-600">
                    Datos desde {(startDate || new Date(0)).toLocaleDateString('es-PE')} hasta {(endDate || new Date()).toLocaleDateString('es-PE')}.
                </p>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Registros del rango</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{formatInt(scopedRecords.length)}</p>
                    <p className="mt-1 text-xs text-slate-500">Total filtrado por rango global</p>
                </article>

                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
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
                description="Gestion por rango de fechas con alcance completo de la hoja."
                visibleRecords={scopedRecords}
                onCreate={onCreate}
                onUpdate={onUpdate}
                onDelete={onDelete}
                busy={busy}
            />
        </div>
    )
}

function RankingModule({
    enviosSheet,
    tiendasSheet,
    startDate,
    endDate,
}: {
    enviosSheet: RawSheetData | null
    tiendasSheet: RawSheetData | null
    startDate: Date | null
    endDate: Date | null
}) {
    const rankingData = useMemo(() => {
        if (!tiendasSheet || !enviosSheet) return [] as Array<{ vendedor: string; tienda: string; entregados: number; key: string }>

        const tiendasHeaders = tiendasSheet.headers
        const tiendaColTiendas = findColumnIndex(tiendasHeaders, STORE_KEYS)
        const vendedorColTiendas = findColumnIndex(tiendasHeaders, VENDOR_KEYS)

        if (tiendaColTiendas < 0 || vendedorColTiendas < 0) return []

        const basePairs = new Map<string, { vendedor: string; tienda: string }>()
        toRowRecords(tiendasSheet).forEach((record) => {
            const tienda = (record.row[tiendaColTiendas] || '').trim()
            const vendedor = (record.row[vendedorColTiendas] || '').trim()

            if (!tienda || !vendedor) return

            const normalizedPair = `${normalizeKey(vendedor)}::${normalizeKey(tienda)}`
            if (!basePairs.has(normalizedPair)) {
                basePairs.set(normalizedPair, { vendedor, tienda })
            }
        })

        if (basePairs.size === 0) return []

        const enviosHeaders = enviosSheet.headers
        const tiendaColEnvios = findColumnIndex(enviosHeaders, STORE_KEYS)
        const vendedorColEnvios = findColumnIndex(enviosHeaders, VENDOR_KEYS)
        const statusColEnvios = findColumnIndex(enviosHeaders, STATUS_KEYS)

        if (tiendaColEnvios < 0 || vendedorColEnvios < 0 || statusColEnvios < 0) return []

        const deliveredKey = normalizeKey('Entregado')
        const deliveredCounter = new Map<string, number>()

        const enviosRecords = filterRowRecordsByDateRange(
            toRowRecords(enviosSheet),
            enviosHeaders,
            startDate,
            endDate,
        )

        enviosRecords.forEach((record) => {
            const status = normalizeKey(record.row[statusColEnvios] || '')
            if (status !== deliveredKey) return

            const tienda = normalizeKey(record.row[tiendaColEnvios] || '')
            const vendedor = normalizeKey(record.row[vendedorColEnvios] || '')
            if (!tienda || !vendedor) return

            const normalizedPair = `${vendedor}::${tienda}`
            if (!basePairs.has(normalizedPair)) return

            deliveredCounter.set(normalizedPair, (deliveredCounter.get(normalizedPair) || 0) + 1)
        })

        return [...basePairs.entries()]
            .map(([normalizedPair, base]) => ({
                vendedor: base.vendedor,
                tienda: base.tienda,
                entregados: deliveredCounter.get(normalizedPair) || 0,
                key: normalizedPair,
            }))
            .filter((item) => item.entregados > 0)
            .sort((a, b) => b.entregados - a.entregados)
    }, [tiendasSheet, enviosSheet, startDate, endDate])

    const filtered = useMemo(() => rankingData.slice(0, 10), [rankingData])
    const totalEntregados = useMemo(
        () => rankingData.reduce((accumulator, item) => accumulator + item.entregados, 0),
        [rankingData],
    )
    const totalTiendas = useMemo(() => new Set(rankingData.map((item) => normalizeKey(item.tienda))).size, [rankingData])
    const totalVendedores = useMemo(() => new Set(rankingData.map((item) => normalizeKey(item.vendedor))).size, [rankingData])

    const chartData = filtered.map((item) => ({
        name: truncateLabel(`${item.tienda} - ${item.vendedor}`, 28),
        entregados: item.entregados,
    }))

    return (
        <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                <h3 className="text-lg font-bold text-slate-900">Ranking x tiendas</h3>
                <p className="mt-1 text-sm text-slate-600">
                    Base: cruza tienda y vendedor desde hoja Tiendas y cuenta en DATA ENVIOS solo filas con resultado Entregado.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <article className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Envios entregados</p>
                        <p className="mt-1 text-xl font-bold text-slate-900">{formatInt(totalEntregados)}</p>
                    </article>
                    <article className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tiendas en ranking</p>
                        <p className="mt-1 text-xl font-bold text-slate-900">{formatInt(totalTiendas)}</p>
                    </article>
                    <article className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Vendedores</p>
                        <p className="mt-1 text-xl font-bold text-slate-900">{formatInt(totalVendedores)}</p>
                    </article>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Top tiendas y vendedores</h3>
                    <div className="h-72">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-10} height={50} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip />
                                    <Bar dataKey="entregados" fill="#c70202" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="grid h-full place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                                No hay registros entregados para el ranking.
                            </div>
                        )}
                    </div>
                </article>

                <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Tabla ranking</h3>
                    <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
                        <table className="min-w-full text-xs">
                            <thead className="sticky top-0 bg-slate-100">
                                <tr>
                                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">#</th>
                                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">Tienda</th>
                                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">Vendedor</th>
                                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">Envios entregados</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((item, index) => (
                                    <tr key={item.key} className="odd:bg-white even:bg-slate-50">
                                        <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{index + 1}</td>
                                        <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{item.tienda}</td>
                                        <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{item.vendedor}</td>
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

            const initialNames = [...PRIMARY_ANALYTICS_SHEETS, SPECIAL_SHEETS.commissionsLeads].filter((sheetName) => names.includes(sheetName))
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

    const homeItem = useMemo<NavItem>(
        () => ({ id: 'home', label: 'Inicio', icon: <LayoutDashboard size={16} />, sectionType: 'home' }),
        [],
    )
    const rankingItem = useMemo<NavItem>(
        () => ({ id: 'special-ranking', label: 'Ranking tiendas x vendedor', icon: <Table2 size={16} />, sectionType: 'ranking' }),
        [],
    )

    const primarySheetItems = useMemo<NavItem[]>(() => {
        // Lista de hojas principales visibles en el menu.
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
        // Seccion simplificada: Inicio + Ranking + Hojas principales.
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

    const ensureRequiredSheets = useCallback(async (item: NavItem | null) => {
        if (!item) return

        // Carga unicamente los datos necesarios para la seccion activa.
        const needed = new Set<string>()

        if (item.sectionType === 'sheet' && item.sheetName) {
            needed.add(item.sheetName)
        }

        if (item.sectionType === 'home') {
            PRIMARY_ANALYTICS_SHEETS.forEach((sheetName) => needed.add(sheetName))
            needed.add(SPECIAL_SHEETS.commissionsLeads)
        }

        if (item.sectionType === 'ranking') {
            needed.add('DATA ENVIOS')
            needed.add('Tiendas')
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

        // Refresca solo el contexto de la seccion activa.
        setSectionLoading(true)
        setStatusMessage('')

        const toForce = new Set<string>()
        if (activeItem.sheetName) toForce.add(activeItem.sheetName)

        if (activeItem.sectionType === 'home') {
            PRIMARY_ANALYTICS_SHEETS.forEach((sheetName) => toForce.add(sheetName))
            toForce.add(SPECIAL_SHEETS.commissionsLeads)
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
    const activeSectionLabel = activeItem?.label || 'Panel'
    const activeSectionDescription = activeItem
        ? SECTION_DESCRIPTIONS[activeItem.sectionType]
        : 'Explora los modulos disponibles y selecciona una seccion.'
    const globalRangeLabel = `${globalRangeStart.toLocaleDateString('es-PE')} - ${globalRangeEnd.toLocaleDateString('es-PE')}`
    const loadedSheetsCount = Object.keys(sheetCache).length

    return (
        <main className="min-h-screen p-4 md:p-6">
            <div className="mx-auto w-full max-w-[1540px] rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_26px_56px_-34px_rgba(15,23,42,0.75)] md:p-4">
                <div className="grid gap-4 xl:grid-cols-[310px_1fr]">
                    <aside className="rounded-2xl border border-red-200/80 bg-white p-4 shadow-[0_18px_36px_-26px_rgba(15,23,42,0.75)] md:sticky md:top-4 md:h-[calc(100vh-5rem)] md:overflow-auto">
                        <div className="mb-4 rounded-2xl bg-gradient-to-br from-red-900 via-red-800 to-red-700 px-4 py-4 text-white">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-red-200">Panel Administracion</p>
                            <h1 className="mt-1 text-xl font-extrabold tracking-tight">Clientes Nuevos</h1>
                            <p className="mt-1 text-xs text-red-100">{user?.name || 'Usuario'}</p>
                        </div>

                        <nav className="space-y-4">
                            {navSections
                                .filter((section) => section.items.length > 0)
                                .map((section) => (
                                    <section key={section.id} className="space-y-2">
                                        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{section.title}</p>
                                        <div className="space-y-1.5 rounded-2xl border border-slate-200/80 bg-slate-50/65 p-2">
                                            {section.items.map((item) => {
                                                const active = item.id === activeSection
                                                return (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => {
                                                            setActiveSection(item.id)
                                                            setStatusMessage('')
                                                        }}
                                                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${active
                                                            ? 'bg-white text-red-700 ring-1 ring-red-200 shadow-[0_10px_18px_-12px_rgba(185,28,28,0.65)]'
                                                            : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                                            }`}
                                                    >
                                                        {item.icon}
                                                        <span className="truncate">{item.label}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </section>
                                ))}
                        </nav>
                    </aside>

                    <section className="space-y-4">
                        <header className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_18px_36px_-26px_rgba(15,23,42,0.75)]">
                            <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Seccion activa</p>
                                    <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{activeSectionLabel}</h2>
                                    <p className="mt-2 max-w-2xl text-sm text-slate-600">{activeSectionDescription}</p>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700">
                                            Rango: {globalRangeLabel}
                                        </span>
                                        <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700">
                                            Hojas cargadas: {loadedSheetsCount}
                                        </span>
                                    </div>

                                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Filtro global de fecha</p>
                                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:max-w-lg">
                                            <label className="text-xs text-slate-600">
                                                Desde
                                                <input
                                                    type="date"
                                                    value={globalStartInput}
                                                    onChange={(event) => {
                                                        setHasUserSetGlobalRange(true)
                                                        setGlobalStartInput(event.target.value)
                                                    }}
                                                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
                                                />
                                            </label>
                                            <label className="text-xs text-slate-600">
                                                Hasta
                                                <input
                                                    type="date"
                                                    value={globalEndInput}
                                                    onChange={(event) => {
                                                        setHasUserSetGlobalRange(true)
                                                        setGlobalEndInput(event.target.value)
                                                    }}
                                                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2 max-h-14 lg:justify-end">
                                    <button
                                        onClick={() => void refreshCurrentSection()}
                                        disabled={sectionLoading || busyMutation}
                                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-900 to-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                                    >
                                        <RefreshCcw size={15} />
                                        Actualizar seccion
                                    </button>
                                    <button
                                        onClick={signOut}
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
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

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4">

                            {activeItem?.sectionType === 'home' && (
                                <HomeSection
                                    tiendasSheet={getCachedSheet('Tiendas') || undefined}
                                    enviosSheet={getCachedSheet('DATA ENVIOS') || undefined}
                                    recojosSheet={getCachedSheet('DATA RECOJOS') || undefined}
                                    comisionesSheet={getCachedSheet(SPECIAL_SHEETS.commissionsLeads) || undefined}
                                    startDate={globalRangeStart}
                                    endDate={globalRangeEnd}
                                />
                            )}

                            {activeItem?.sectionType === 'sheet' && activeSheet && (
                                <GenericSheetModule
                                    sheet={activeSheet}
                                    startDate={globalRangeStart}
                                    endDate={globalRangeEnd}
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
                                    startDate={globalRangeStart}
                                    endDate={globalRangeEnd}
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
                                    startDate={globalRangeStart}
                                    endDate={globalRangeEnd}
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
                                    startDate={globalRangeStart}
                                    endDate={globalRangeEnd}
                                    onCreate={handleCreate}
                                    onUpdate={handleUpdate}
                                    onDelete={handleDelete}
                                    busy={busyMutation}
                                />
                            )}

                            {activeItem?.sectionType === 'monthly' && activeSheet && (
                                <MonthlySummaryModule
                                    sheet={activeSheet}
                                    startDate={globalRangeStart}
                                    endDate={globalRangeEnd}
                                    onCreate={handleCreate}
                                    onUpdate={handleUpdate}
                                    onDelete={handleDelete}
                                    busy={busyMutation}
                                />
                            )}

                            {activeItem?.sectionType === 'ranking' && (
                                <RankingModule
                                    enviosSheet={getCachedSheet('DATA ENVIOS')}
                                    tiendasSheet={getCachedSheet('Tiendas')}
                                    startDate={globalRangeStart}
                                    endDate={globalRangeEnd}
                                />
                            )}

                            {activeItem?.sheetName && !activeSheet && !sectionLoading && (
                                <article className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                                    <div className="flex items-center gap-2">
                                        <CircleAlert size={16} />
                                        No se pudo cargar la hoja {activeItem.sheetName}. Verifica que exista y tenga permisos.
                                    </div>
                                </article>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </main>
    )
}

