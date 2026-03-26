import type { RawSheetData } from '../services/sheetsData'

interface SheetRow {
  sheetName: string
  raw: Record<string, string>
}

interface SeriesItem {
  name: string
  value: number
}

interface TimelineItem {
  period: string
  value: number
}

interface EnviosRecojosItem {
  period: string
  envios: number
  recojos: number
}

interface TariffMetrics {
  count: number
  total: number
  min: number
  max: number
  average: number
}

export interface DashboardData {
  totalRecords: number
  sheetStats: SeriesItem[]
  statusDistribution: SeriesItem[]
  storeDistribution: SeriesItem[]
  appDistribution: SeriesItem[]
  globalTimeline: TimelineItem[]
  enviosRecojosTimeline: EnviosRecojosItem[]
  tariffDistribution: SeriesItem[]
  tariffMetrics: TariffMetrics
  lastUpdated: string
}

const DATE_KEYS = [
  'fecha',
  'fecha_envio',
  'fecha_recojo',
  'fecha_creacion',
  'created_at',
  'dia',
]

const STATUS_KEYS = ['estado', 'status', 'resultado', 'situacion']
const STORE_KEYS = ['tienda', 'tiendas', 'store', 'sucursal', 'local', 'pdv', 'punto_venta']
const APP_KEYS = ['aplicativo', 'app', 'plataforma', 'canal']
const AMOUNT_KEYS = ['tarifa', 'monto', 'total', 'precio', 'importe', 'valor', 'costo']

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function prettifyLabel(value: string): string {
  if (!value) return 'Sin dato'
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function toSheetRows(sheets: RawSheetData[]): SheetRow[] {
  const allRows: SheetRow[] = []

  for (const sheet of sheets) {
    const normalizedHeaders = sheet.headers.map((header, index) => {
      const normalized = normalizeHeader(header)
      return normalized || `col_${index + 1}`
    })

    for (const row of sheet.rows) {
      const mapped: Record<string, string> = {}
      const maxCols = Math.max(normalizedHeaders.length, row.length)

      for (let index = 0; index < maxCols; index += 1) {
        const key = normalizedHeaders[index] || `col_${index + 1}`
        mapped[key] = (row[index] || '').trim()
      }

      allRows.push({
        sheetName: sheet.sheetName,
        raw: mapped,
      })
    }
  }

  return allRows
}

function findKeyByCandidates(row: Record<string, string>, candidates: string[]): string | null {
  const keys = Object.keys(row)

  for (const candidate of candidates) {
    const exact = keys.find((key) => key === candidate)
    if (exact) return exact
  }

  for (const candidate of candidates) {
    const partial = keys.find((key) => key.includes(candidate))
    if (partial) return partial
  }

  return null
}

function parseDateValue(value: string): Date | null {
  if (!value) return null

  const trimmed = value.trim()

  if (/^\d{5}(?:\.\d+)?$/.test(trimmed)) {
    const excelSerial = Number(trimmed)
    if (!Number.isNaN(excelSerial)) {
      const date = new Date(Math.round((excelSerial - 25569) * 86400 * 1000))
      if (!Number.isNaN(date.getTime())) {
        return date
      }
    }
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slashMatch) {
    const day = Number(slashMatch[1])
    const month = Number(slashMatch[2]) - 1
    const yearRaw = Number(slashMatch[3])
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw
    const date = new Date(year, month, day)
    if (!Number.isNaN(date.getTime())) return date
  }

  const date = new Date(trimmed)
  if (!Number.isNaN(date.getTime())) {
    return date
  }

  return null
}

function toMonthKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

function monthKeyToLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  return `${month}/${year}`
}

function parseNumeric(value: string): number | null {
  if (!value) return null

  let cleaned = value.trim().replace(/[^\d,.-]/g, '')
  if (!cleaned) return null

  const hasComma = cleaned.includes(',')
  const hasDot = cleaned.includes('.')

  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (hasComma) {
    const commaCount = cleaned.split(',').length - 1
    if (commaCount === 1) {
      const [, decimals] = cleaned.split(',')
      if ((decimals || '').length <= 2) {
        cleaned = cleaned.replace(',', '.')
      } else {
        cleaned = cleaned.replace(',', '')
      }
    } else {
      cleaned = cleaned.replace(/,/g, '')
    }
  }

  const numeric = Number(cleaned)
  if (Number.isNaN(numeric)) return null
  return numeric
}

function toSortedSeries(counter: Map<string, number>, limit = 10): SeriesItem[] {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }))
}

function calculateTariffDistribution(values: number[]): SeriesItem[] {
  if (values.length === 0) return []

  const min = Math.min(...values)
  const max = Math.max(...values)

  if (min === max) {
    return [{ name: `${min.toFixed(2)}`, value: values.length }]
  }

  const bucketCount = 5
  const step = (max - min) / bucketCount
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    from: min + step * index,
    to: min + step * (index + 1),
    count: 0,
  }))

  for (const value of values) {
    let bucketIndex = Math.floor((value - min) / step)
    if (bucketIndex >= bucketCount) bucketIndex = bucketCount - 1
    buckets[bucketIndex].count += 1
  }

  return buckets.map((bucket) => ({
    name: `${bucket.from.toFixed(0)}-${bucket.to.toFixed(0)}`,
    value: bucket.count,
  }))
}

export function buildDashboardData(sheets: RawSheetData[]): DashboardData {
  const rows = toSheetRows(sheets)

  const sheetStats = sheets.map((sheet) => ({
    name: sheet.sheetName,
    value: sheet.rows.length,
  }))

  const totalRecords = sheetStats.reduce((acc, item) => acc + item.value, 0)

  const statusCounter = new Map<string, number>()
  const storeCounter = new Map<string, number>()
  const monthCounter = new Map<string, number>()
  const enviosByMonth = new Map<string, number>()
  const recojosByMonth = new Map<string, number>()
  const appCounter = new Map<string, number>()
  const tariffValues: number[] = []

  for (const row of rows) {
    const statusKey = findKeyByCandidates(row.raw, STATUS_KEYS)
    if (statusKey) {
      const value = prettifyLabel(row.raw[statusKey])
      statusCounter.set(value, (statusCounter.get(value) || 0) + 1)
    }

    const storeKey = findKeyByCandidates(row.raw, STORE_KEYS)
    if (storeKey) {
      const value = prettifyLabel(row.raw[storeKey])
      storeCounter.set(value, (storeCounter.get(value) || 0) + 1)
    }

    const dateKey = findKeyByCandidates(row.raw, DATE_KEYS)
    if (dateKey) {
      const parsedDate = parseDateValue(row.raw[dateKey])
      if (parsedDate) {
        const monthKey = toMonthKey(parsedDate)
        monthCounter.set(monthKey, (monthCounter.get(monthKey) || 0) + 1)

        if (row.sheetName === 'DATA ENVIOS') {
          enviosByMonth.set(monthKey, (enviosByMonth.get(monthKey) || 0) + 1)
        }

        if (row.sheetName === 'DATA RECOJOS') {
          recojosByMonth.set(monthKey, (recojosByMonth.get(monthKey) || 0) + 1)
        }
      }
    }

    if (row.sheetName === 'DATA APLICATIVOS') {
      const appKey = findKeyByCandidates(row.raw, APP_KEYS)
      const appValue = appKey ? prettifyLabel(row.raw[appKey]) : 'Sin dato'
      appCounter.set(appValue, (appCounter.get(appValue) || 0) + 1)
    }

    if (row.sheetName === 'DATA DE TARIFA') {
      const amountKey = findKeyByCandidates(row.raw, AMOUNT_KEYS)
      if (amountKey) {
        const number = parseNumeric(row.raw[amountKey])
        if (number !== null) tariffValues.push(number)
      } else {
        for (const value of Object.values(row.raw)) {
          const number = parseNumeric(value)
          if (number !== null) {
            tariffValues.push(number)
            break
          }
        }
      }
    }
  }

  const globalTimeline = [...monthCounter.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, value]) => ({
      period: monthKeyToLabel(period),
      value,
    }))

  const mergedPeriods = new Set([...enviosByMonth.keys(), ...recojosByMonth.keys()])
  const enviosRecojosTimeline = [...mergedPeriods]
    .sort((a, b) => a.localeCompare(b))
    .map((period) => ({
      period: monthKeyToLabel(period),
      envios: enviosByMonth.get(period) || 0,
      recojos: recojosByMonth.get(period) || 0,
    }))

  const tariffCount = tariffValues.length
  const tariffTotal = tariffValues.reduce((acc, value) => acc + value, 0)

  const tariffMetrics: TariffMetrics = {
    count: tariffCount,
    total: tariffTotal,
    min: tariffCount > 0 ? Math.min(...tariffValues) : 0,
    max: tariffCount > 0 ? Math.max(...tariffValues) : 0,
    average: tariffCount > 0 ? tariffTotal / tariffCount : 0,
  }

  return {
    totalRecords,
    sheetStats,
    statusDistribution: toSortedSeries(statusCounter, 8),
    storeDistribution: toSortedSeries(storeCounter, 10),
    appDistribution: toSortedSeries(appCounter, 8),
    globalTimeline,
    enviosRecojosTimeline,
    tariffDistribution: calculateTariffDistribution(tariffValues),
    tariffMetrics,
    lastUpdated: new Date().toLocaleString('es-PE'),
  }
}
