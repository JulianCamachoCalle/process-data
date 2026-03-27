import type { ReactNode } from 'react'
import type { RawSheetData } from '../../../services/sheetsData'

export type SectionType = 'home' | 'sheet' | 'ranking'

export interface NavItem {
  id: string
  label: string
  icon: ReactNode
  sectionType: SectionType
  sheetName?: string
}

export interface NavSection {
  id: string
  title: string
  items: NavItem[]
}

export interface RowRecord {
  rowNumber: number
  row: string[]
}

export interface DataPoint {
  name: string
  value: number
}

export const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

export const SPECIAL_SHEETS = {
  commissionsLeads: 'COMISIONES Y LEADS',
} as const

// Prioriza columnas de fecha reales del Excel (Mes, Fecha, Periodo).
export const MONTH_DATE_KEYS = ['fecha', 'date', 'mes', 'periodo', 'month', 'created']
export const VENDOR_KEYS = ['Vendedor']
export const STORE_KEYS = ['Nombre tienda']
export const STATUS_KEYS = ['estado', 'status', 'resultado', 'situacion']
export const INGRESO_ENVIOS_KEYS = ['ingreso total fila (s/)']
export const INGRESO_RECOJO_KEYS = ['ingreso recojo total (s/)']
export const COSTO_ENVIO_KEYS = ['costo total operativo', 'costo operativo envios', 'costo total envios', 'costo envios']
export const COSTO_RECOJO_TOTAL_KEYS = ['costos recojo total', 'costo recojo total', 'pago motorizado recojo']
export const ANULADOS_FILMENT_KEYS = ['ingresos anulados filment', 'ingresos anulados', 'ingreso anulados', 'anulados filment']
export const TIPO_RECOJO_KEYS = ['tipo recojo', 'tipo de recojo']
export const RECOJO_VECES_KEYS = ['veces']
export const COMISIONES_TOTALES_KEYS = ['comisiones totales', 'comision total', 'total comisiones', 'comisiones_total']
export const DISTRITO_KEYS = ['distrito', 'district']

export const SECTION_DESCRIPTIONS: Record<SectionType, string> = {
  home: 'Vista ejecutiva consolidada de metricas operativas y financieras.',
  sheet: 'Exploracion y gestion CRUD sobre la hoja seleccionada.',
  ranking: 'Ranking de rendimiento por tiendas filtrado por vendedor.',
}

export function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function normalizeColumnKey(value: string): string {
  return normalizeKey(value).replace(/[^a-z0-9]/g, '')
}

export function tokenizeKey(value: string): string[] {
  return normalizeKey(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

export function formatInt(value: number): string {
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 }).format(value)
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    maximumFractionDigits: 2,
  }).format(value)
}

export function parseDateValue(value: string): Date | null {
  if (!value) return null

  const trimmed = value.trim()
  const normalizedNumeric = trimmed.replace(',', '.')

  if (/^\d{5}(?:[.,]\d+)?$/.test(trimmed)) {
    const serial = Number(normalizedNumeric)
    if (!Number.isNaN(serial)) {
      const days = Math.floor(serial)
      const date = new Date(1899, 11, 30)
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() + days)
      if (!Number.isNaN(date.getTime())) return date
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

  const monthYearNumeric = trimmed.match(/^(\d{1,2})[/-](\d{2,4})$/)
  if (monthYearNumeric) {
    const month = Number(monthYearNumeric[1]) - 1
    const yearRaw = Number(monthYearNumeric[2])
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw
    const date = new Date(year, month, 1)
    if (!Number.isNaN(date.getTime())) return date
  }

  const normalized = normalizeKey(trimmed)
  const monthYearByName = normalized.match(
    /^(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|setiembre|sep|set|octubre|oct|noviembre|nov|diciembre|dic)\s+(\d{2,4})$/,
  )
  if (monthYearByName) {
    const monthMap: Record<string, number> = {
      enero: 0,
      ene: 0,
      febrero: 1,
      feb: 1,
      marzo: 2,
      mar: 2,
      abril: 3,
      abr: 3,
      mayo: 4,
      may: 4,
      junio: 5,
      jun: 5,
      julio: 6,
      jul: 6,
      agosto: 7,
      ago: 7,
      septiembre: 8,
      setiembre: 8,
      sep: 8,
      set: 8,
      octubre: 9,
      oct: 9,
      noviembre: 10,
      nov: 10,
      diciembre: 11,
      dic: 11,
    }

    const month = monthMap[monthYearByName[1]]
    const yearRaw = Number(monthYearByName[2])
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw
    const date = new Date(year, month, 1)
    if (!Number.isNaN(date.getTime())) return date
  }

  const date = new Date(trimmed)
  if (!Number.isNaN(date.getTime())) return date
  return null
}

export function formatDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDateInputValue(value: string, endOfDay = false): Date | null {
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

export function parseNumeric(value: string): number | null {
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

export function findColumnIndex(headers: string[], candidates: string[]): number {
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

  if (bestScore >= 4) return bestIndex
  return -1
}

export function findColumnByTokenGroups(headers: string[], tokenGroups: string[][]): number {
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

export function findMetricColumnIndex(headers: string[], aliases: string[], tokenGroups: string[][]): number {
  const primary = findColumnIndex(headers, aliases)
  if (primary >= 0) return primary
  return findColumnByTokenGroups(headers, tokenGroups)
}

export function toRowRecords(sheet: RawSheetData | null): RowRecord[] {
  if (!sheet) return []

  return sheet.rows.map((row, index) => ({
    row,
    rowNumber: sheet.rowNumbers[index] || index + 2,
  }))
}

export function filterRowRecordsByDateRange(
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

export function truncateLabel(value: string, max = 22): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}...`
}

export function categorySeriesFromColumn(records: RowRecord[], columnIndex: number, limit = 8): Array<{ name: string; value: number }> {
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

export function buildSheetOverview(sheet: RawSheetData, recordsOverride?: RowRecord[]) {
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

export function getRowsForDateRange(
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

export function getDateBoundsFromSheet(
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

export function sumFromColumn(rows: string[][], index: number): number {
  if (index < 0) return 0
  return rows.reduce((accumulator, row) => accumulator + (parseNumeric(row[index]) || 0), 0)
}
