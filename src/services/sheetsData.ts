import { GOOGLE_CONFIG } from '../config/google'

const CACHE_TTL_MS = 2 * 60 * 1000

export const PRIMARY_ANALYTICS_SHEETS = [
  'Tiendas',
  'DATA ENVIOS',
  'DATA RECOJOS',
  'DATA DE TARIFA',
] as const

// Hojas tipo tabla (tabs azules) usadas para CRUD relacional.
export const RELATIONAL_CRUD_SHEETS = [
  'LEADS GANADOS',
  'DATA ENVIOS',
  'TARIFAS',
  'RECOJOS',
  'TIPO RECOJO',
  'APLICATIVOS',
  'COURIER',
  'TIENDAS',
  'FULLFILMENT',
  'ORIGEN',
  'TIPO DE PUNTO',
  'VENDEDORES',
  'RESULTADOS',
  'DESTINOS',
] as const

interface SheetCacheEntry {
  data: RawSheetData
  fetchedAt: number
}

type FormulaCell = {
  columnIndex: number
  formula: string
}

let metadataCache: SpreadsheetSheetMeta[] | null = null
let metadataFetchedAt = 0
const sheetDataCache = new Map<string, SheetCacheEntry>()

export interface SpreadsheetSheetMeta {
  sheetId: number
  title: string
}

export interface RawSheetData {
  sheetName: string
  sheetId: number | null
  headers: string[]
  rows: string[][]
  rowNumbers: number[]
  fetchedAt: number
}

function quoteSheetName(sheetName: string): string {
  const escaped = sheetName.replace(/'/g, "''")
  return `'${escaped}'`
}

function toColumnLetter(columnNumber: number): string {
  let num = Math.max(1, Math.floor(columnNumber))
  let result = ''

  while (num > 0) {
    const remainder = (num - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    num = Math.floor((num - 1) / 26)
  }

  return result
}

function normalizeWriteValues(rowValues: string[], columnCount: number): string[] {
  const safeCount = Math.max(1, Math.floor(columnCount))
  return Array.from({ length: safeCount }, (_, index) => String(rowValues[index] ?? '').trim())
}

function normalizeRowValues(values: string[] | undefined): string[] {
  if (!values) {
    return []
  }

  return values.map((value) => String(value ?? '').trim())
}

function findHeaderRowIndex(values: string[][]): number {
  if (values.length === 0) return 0

  const probeLimit = Math.min(values.length, 20)
  let bestIndex = 0
  let bestScore = -1

  for (let index = 0; index < probeLimit; index += 1) {
    const row = normalizeRowValues(values[index])
    const nonEmptyCount = row.filter((cell) => cell.length > 0).length
    if (nonEmptyCount === 0) continue

    // Prefer rows that look like tabular headers (many filled cells).
    const score = nonEmptyCount

    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  }

  return bestScore > 0 ? bestIndex : 0
}

function ensureSheetsClient(): void {
  if (!window.gapi?.client?.sheets?.spreadsheets) {
    throw new Error('Google Sheets API no esta disponible en gapi.client.')
  }

  if (!GOOGLE_CONFIG.SPREADSHEET_ID) {
    throw new Error('No se encontro VITE_SPREADSHEET_ID en .env')
  }
}

function isFresh(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL_MS
}

function normalizeSheetNameKey(name: string): string {
  return name.trim().toLowerCase()
}

const FRONTEND_COMPUTED_SHEETS = new Set([normalizeSheetNameKey('ENVIOS')])

function shouldPreserveSheetFormulas(sheetName: string): boolean {
  return !FRONTEND_COMPUTED_SHEETS.has(normalizeSheetNameKey(sheetName))
}

function parseRowNumberFromUpdatedRange(updatedRange: string | undefined): number | null {
  if (!updatedRange) return null

  const match = updatedRange.match(/![A-Z]+(\d+):[A-Z]+(\d+)/i)
  if (!match) return null

  const startRow = Number(match[1])
  const endRow = Number(match[2])

  if (!Number.isFinite(startRow) || startRow <= 0) return null
  if (!Number.isFinite(endRow) || endRow <= 0) return null

  return Math.min(startRow, endRow)
}

function mergeFormulaCellsIntoValues(rowValues: string[], formulaCells: FormulaCell[]): string[] {
  if (formulaCells.length === 0) return rowValues

  const next = [...rowValues]
  formulaCells.forEach((cell) => {
    if (cell.columnIndex < 0 || cell.columnIndex >= next.length) return
    next[cell.columnIndex] = cell.formula
  })

  return next
}

async function getFormulaCellsForRow(
  sheetName: string,
  rowNumber: number,
  columnCount: number,
): Promise<FormulaCell[]> {
  if (rowNumber <= 1) return []
  ensureSheetsClient()

  const valuesClient = window.gapi?.client?.sheets?.spreadsheets?.values
  if (!valuesClient?.get) {
    throw new Error('Google Sheets values.get no esta disponible en gapi.client.')
  }

  const endColumn = toColumnLetter(columnCount)
  const response = await valuesClient.get({
    spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
    range: `${quoteSheetName(sheetName)}!A${rowNumber}:${endColumn}${rowNumber}`,
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMULA',
  })

  const row = response.result?.values?.[0] || []
  const formulaCells: FormulaCell[] = []

  row.forEach((value, columnIndex) => {
    const normalized = String(value ?? '').trim()
    if (!normalized.startsWith('=')) return

    formulaCells.push({ columnIndex, formula: normalized })
  })

  return formulaCells
}

async function copyFormulaCellsBetweenRows(
  sheetName: string,
  sourceRowNumber: number,
  targetRowNumber: number,
  formulaCells: FormulaCell[],
  columnCount: number,
): Promise<void> {
  if (sourceRowNumber <= 1 || targetRowNumber <= 1 || formulaCells.length === 0) {
    return
  }

  ensureSheetsClient()

  if (!window.gapi?.client?.sheets?.spreadsheets?.batchUpdate) {
    throw new Error('Google Sheets batchUpdate no esta disponible en gapi.client.')
  }

  const metadata = await getSpreadsheetSheetsMetadata()
  const key = normalizeSheetNameKey(sheetName)
  const sheetMeta = metadata.find((item) => normalizeSheetNameKey(item.title) === key)

  if (!sheetMeta) {
    throw new Error(`No se encontro metadata para la hoja: ${sheetName}`)
  }

  const safeColumnLimit = Math.max(1, Math.floor(columnCount))
  const uniqueFormulaColumns = [...new Set(formulaCells.map((cell) => cell.columnIndex))]
    .filter((columnIndex) => columnIndex >= 0 && columnIndex < safeColumnLimit)

  if (uniqueFormulaColumns.length === 0) return

  await window.gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
    resource: {
      requests: uniqueFormulaColumns.map((columnIndex) => ({
        copyPaste: {
          source: {
            sheetId: sheetMeta.sheetId,
            startRowIndex: sourceRowNumber - 1,
            endRowIndex: sourceRowNumber,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          destination: {
            sheetId: sheetMeta.sheetId,
            startRowIndex: targetRowNumber - 1,
            endRowIndex: targetRowNumber,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          pasteType: 'PASTE_FORMULA',
          pasteOrientation: 'NORMAL',
        },
      })),
    },
  })
}

export function clearSheetCache(sheetName?: string): void {
  if (!sheetName) {
    sheetDataCache.clear()
    metadataCache = null
    metadataFetchedAt = 0
    return
  }

  const key = normalizeSheetNameKey(sheetName)
  sheetDataCache.delete(key)
}

export async function getSpreadsheetSheetsMetadata(force = false): Promise<SpreadsheetSheetMeta[]> {
  ensureSheetsClient()
  const gapi = window.gapi

  if (!gapi) {
    throw new Error('Google SDK no esta disponible en window.gapi')
  }

  if (!force && metadataCache && isFresh(metadataFetchedAt)) {
    return metadataCache
  }

  const response = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
    fields: 'sheets.properties.sheetId,sheets.properties.title',
    includeGridData: false,
  }) 

  const metadata = (response.result?.sheets ?? [])
    .map((sheet) => ({
      sheetId: sheet.properties?.sheetId ?? -1,
      title: sheet.properties?.title || '',
    }))
    .filter((item) => item.sheetId >= 0 && item.title.length > 0)

  if (metadata.length === 0) {
    throw new Error('No se encontraron hojas en el spreadsheet.')
  }

  metadataCache = metadata
  metadataFetchedAt = Date.now()
  return metadata
}

export async function getSpreadsheetSheetNames(force = false): Promise<string[]> {
  const metadata = await getSpreadsheetSheetsMetadata(force)
  return metadata.map((item) => item.title)
}

export async function getSheetData(
  sheetName: string,
  options?: { force?: boolean },
): Promise<RawSheetData> {
  const key = normalizeSheetNameKey(sheetName)
  const force = Boolean(options?.force)

  if (!force) {
    const cached = sheetDataCache.get(key)
    if (cached && isFresh(cached.fetchedAt)) {
      return cached.data
    }
  }

  ensureSheetsClient()

  if (!window.gapi?.client?.sheets?.spreadsheets?.values) {
    throw new Error('Google Sheets API values no esta disponible en gapi.client.')
  }

  const metadata = await getSpreadsheetSheetsMetadata(force)
  const sheetMeta = metadata.find((item) => normalizeSheetNameKey(item.title) === key)

  const range = `${quoteSheetName(sheetName)}!A:ZZ`

  const response = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
    range,
    majorDimension: 'ROWS',
  })

  const values = response.result?.values ?? []
  const now = Date.now()

  if (values.length === 0) {
    const emptyData: RawSheetData = {
      sheetName,
      sheetId: sheetMeta?.sheetId ?? null,
      headers: [],
      rows: [],
      rowNumbers: [],
      fetchedAt: now,
    }

    sheetDataCache.set(key, { data: emptyData, fetchedAt: now })
    return emptyData
  }

  const normalizedValues = values.map((row) => normalizeRowValues(row))
  const headerRowIndex = findHeaderRowIndex(normalizedValues)
  const headers = normalizedValues[headerRowIndex] || []
  const dataRows = normalizedValues.slice(headerRowIndex + 1)
  const rows: string[][] = []
  const rowNumbers: number[] = []

  dataRows.forEach((row, index) => {
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row)
      rowNumbers.push(headerRowIndex + index + 2)
    }
  })

  const data: RawSheetData = {
    sheetName,
    sheetId: sheetMeta?.sheetId ?? null,
    headers,
    rows,
    rowNumbers,
    fetchedAt: now,
  }

  sheetDataCache.set(key, { data, fetchedAt: now })
  return data
}

export async function getSheetsData(
  sheetNames: string[],
  options?: { force?: boolean },
): Promise<RawSheetData[]> {
  const settled = await Promise.allSettled(
    sheetNames.map((sheetName) => getSheetData(sheetName, { force: options?.force })),
  )
  const loaded = settled
    .filter((item): item is PromiseFulfilledResult<RawSheetData> => item.status === 'fulfilled')
    .map((item) => item.value)

  if (loaded.length === 0) {
    throw new Error('No fue posible leer ninguna hoja del spreadsheet.')
  }

  return loaded
}

export async function getDashboardSheetsData(options?: {
  force?: boolean
  sheetNames?: string[]
}): Promise<RawSheetData[]> {
  let sheetNames: string[] = []

  if (options?.sheetNames && options.sheetNames.length > 0) {
    sheetNames = [...options.sheetNames]
  } else {
    try {
      sheetNames = await getSpreadsheetSheetNames(options?.force)
    } catch {
      sheetNames = [...PRIMARY_ANALYTICS_SHEETS]
    }
  }

  return getSheetsData(prioritizeSheetNames(sheetNames), { force: options?.force })
}

function prioritizeSheetNames(names: string[]): string[] {
  const unique = [...new Set(names)]
  const core = PRIMARY_ANALYTICS_SHEETS.filter((name) => unique.includes(name))
  const others = unique.filter(
    (name) => !PRIMARY_ANALYTICS_SHEETS.includes(name as (typeof PRIMARY_ANALYTICS_SHEETS)[number]),
  )
  return [...core, ...others]
}

export async function appendSheetRow(
  sheetName: string,
  rowValues: string[],
  columnCount: number,
): Promise<void> {
  ensureSheetsClient()

  if (!window.gapi?.client?.sheets?.spreadsheets?.values?.append) {
    throw new Error('Google Sheets append no esta disponible en gapi.client.')
  }

  const normalizedValues = normalizeWriteValues(rowValues, columnCount)
  const endColumn = toColumnLetter(columnCount)

  const appendResponse = await window.gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
    range: `${quoteSheetName(sheetName)}!A:${endColumn}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [normalizedValues],
    },
  }) as { result?: { updates?: { updatedRange?: string } } }

  const updatedRange = appendResponse.result?.updates?.updatedRange
  const createdRowNumber = parseRowNumberFromUpdatedRange(updatedRange)
  const preserveSheetFormulas = shouldPreserveSheetFormulas(sheetName)

  if (preserveSheetFormulas && createdRowNumber && createdRowNumber > 2) {
    const sourceRowNumber = createdRowNumber - 1
    const templateFormulaCells = await getFormulaCellsForRow(sheetName, sourceRowNumber, columnCount)

    if (templateFormulaCells.length > 0) {
      await copyFormulaCellsBetweenRows(
        sheetName,
        sourceRowNumber,
        createdRowNumber,
        templateFormulaCells,
        columnCount,
      )
    }
  }

  clearSheetCache(sheetName)
}

export async function updateSheetRow(
  sheetName: string,
  rowNumber: number,
  rowValues: string[],
  columnCount: number,
): Promise<void> {
  ensureSheetsClient()

  if (!window.gapi?.client?.sheets?.spreadsheets?.values?.update) {
    throw new Error('Google Sheets update no esta disponible en gapi.client.')
  }

  if (rowNumber <= 1) {
    throw new Error('No se puede actualizar la fila de encabezado.')
  }

  const normalizedValues = normalizeWriteValues(rowValues, columnCount)
  const preserveSheetFormulas = shouldPreserveSheetFormulas(sheetName)
  const existingRowFormulaCells = preserveSheetFormulas
    ? await getFormulaCellsForRow(sheetName, rowNumber, columnCount)
    : []
  const valuesForUpdate = preserveSheetFormulas
    ? mergeFormulaCellsIntoValues(normalizedValues, existingRowFormulaCells)
    : normalizedValues
  const endColumn = toColumnLetter(columnCount)

  await window.gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
    range: `${quoteSheetName(sheetName)}!A${rowNumber}:${endColumn}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [valuesForUpdate],
    },
  })

  // Si la fila no tenia formulas (por ediciones historicas), intenta restaurarlas usando la fila anterior.
  if (preserveSheetFormulas && existingRowFormulaCells.length === 0 && rowNumber > 2) {
    const sourceRowNumber = rowNumber - 1
    const fallbackFormulaCells = await getFormulaCellsForRow(sheetName, sourceRowNumber, columnCount)

    if (fallbackFormulaCells.length > 0) {
      await copyFormulaCellsBetweenRows(
        sheetName,
        sourceRowNumber,
        rowNumber,
        fallbackFormulaCells,
        columnCount,
      )
    }
  }

  clearSheetCache(sheetName)
}

export async function deleteSheetRow(sheetName: string, rowNumber: number): Promise<void> {
  ensureSheetsClient()

  if (!window.gapi?.client?.sheets?.spreadsheets?.batchUpdate) {
    throw new Error('Google Sheets batchUpdate no esta disponible en gapi.client.')
  }

  if (rowNumber <= 1) {
    throw new Error('No se puede eliminar la fila de encabezado.')
  }

  const metadata = await getSpreadsheetSheetsMetadata(true)
  const key = normalizeSheetNameKey(sheetName)
  const sheetMeta = metadata.find((item) => normalizeSheetNameKey(item.title) === key)

  if (!sheetMeta) {
    throw new Error(`No se encontro metadata para la hoja: ${sheetName}`)
  }

  await window.gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
    resource: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetMeta.sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  })

  clearSheetCache(sheetName)
}
