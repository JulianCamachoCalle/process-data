import { useCallback, useEffect, useMemo, useState } from 'react'
import { PencilLine, Trash2 } from 'lucide-react'
import type { RawSheetData } from '../../../services/sheetsData'
import { findRelationRuleForField } from '../../../config/relationalMapping'
import type { RowRecord } from './shared'
import { findColumnIndex, formatDateInputValue, formatInt, normalizeKey, parseDateValue, parseNumeric } from './shared'

type CrudModalMode = 'create' | 'edit' | null

type ColumnInputType = 'text' | 'multiline' | 'date' | 'integer' | 'decimal'

type ColumnSpec = {
  header: string
  inputType: ColumnInputType
  suggestions: string[]
  relationTableName: string | null
  relationOptions: RelationOption[]
}

type RelatedSheetMap = Record<string, RawSheetData>
type DisplayRecord = RowRecord & { displayRow: string[] }
type RelationOption = { idValue: string; displayValue: string }

const DATE_HEADER_HINTS = ['fecha', 'mes', 'periodo', 'date']
const DECIMAL_HEADER_HINTS = ['costo', 'ingreso', 'pago', 'cobro', 'comision', 'tarifa', 'margen', 'extra', 'monto']
const INTEGER_HEADER_HINTS = ['cantidad', 'veces', 'dias', 'envios', 'leads', 'rank', 'id']
const MULTILINE_HEADER_HINTS = ['nota', 'observacion', 'comentario', 'detalle']

const DEFAULT_VALUE_COLUMN_HINTS = ['nombre', 'descripcion', 'detalle', 'tipo', 'codigo', 'code']
const ID_COLUMN_HINTS = ['id']
const COBRO_ENTREGA_HEADER_HINTS = ['Cobro entrega']
const PAGO_MOTO_HEADER_HINTS = ['Pago moto']
const INGRESO_TOTAL_FILA_HEADER_HINTS = ['Ingreso total fila']
const COSTO_TOTAL_FILA_HEADER_HINTS = ['Costo total fila']
const EXTRA_PUNTO_EMPRESA_HEADER_HINTS = ['Extra punto empresa']
const EXTRA_PUNTO_MOTO_HEADER_HINTS = ['Extra punto moto']
const EXCEDENTE_PAGADO_MOTO_HEADER_HINTS = ['Excedente pagado moto']
const TIENDA_FULLFILMENT_HEADER_HINTS = ['¿Es tienda Fulfillment?', 'Tienda fullfilment', 'Es tienda fulfillment', 'Es tienda fullfilment']
const ID_TIENDA_HEADER_HINTS = ['IdTienda', 'IdTiendas', 'Tienda_ID', 'Tienda ID']
const NOMBRE_TIENDA_HEADER_HINTS = ['Nombre tienda']
const ID_DESTINO_HEADER_HINTS = ['IdDestino']
const TARIFA_DESTINO_LOOKUP_HINTS = ['IdDestino']
const TARIFA_COBRO_ENTREGA_HINTS = ['Cobro entrega']
const TARIFA_PAGO_MOTO_HINTS = ['Pago moto']
const LEADS_TIENDA_HEADER_HINTS = ['Nombre tienda', 'Tienda', 'IdTienda', 'Tienda_ID']
const LEADS_ID_FULLFILMENT_HEADER_HINTS = ['IdFullFilment', 'IdFullfillment', 'Id FullFilment', 'Id Fullfillment']
const LEADS_FULLFILMENT_FLAG_HEADER_HINTS = ['Fulfillment', 'Fullfilment']
const FULLFILMENT_ID_HEADER_HINTS = ['IdFullFilment', 'IdFullfillment', 'Id FullFilment', 'Id Fullfillment']
const IGV_DIVISOR = 1.18

function includesAny(value: string, hints: string[]): boolean {
  return hints.some((hint) => value.includes(hint))
}

function isLikelyIdLabel(value: string): boolean {
  return includesAny(normalizeKey(value), ID_COLUMN_HINTS)
}

function toTitleCaseWords(value: string): string {
  return value
    .split(' ')
    .map((word) => {
      if (!word) return word
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
    })
    .join(' ')
}

function humanizeHeader(value: string): string {
  const withSpaces = value
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()

  return toTitleCaseWords(withSpaces)
}

function toSingularTableLabel(tableName: string): string {
  const normalizedTable = normalizeKey(tableName)
  if (!normalizedTable) return ''

  const singularOverrides: Record<string, string> = {
    vendedores: 'vendedor',
    tiendas: 'tienda',
    aplicativos: 'aplicativo',
    destinos: 'destino',
    resultados: 'resultado',
    envios: 'envio',
    recojos: 'recojo',
    tarifas: 'tarifa',
    courier: 'courier',
    origen: 'origen',
    fullfilment: 'fullfilment',
    'tipo recojo': 'tipo recojo',
    'tipo de punto': 'tipo de punto',
  }

  const singular = singularOverrides[normalizedTable] || normalizedTable.replace(/s$/, '')
  return toTitleCaseWords(singular)
}

function compareMixedValuesAsc(left: string, right: string): number {
  const leftTrimmed = left.trim()
  const rightTrimmed = right.trim()

  const leftNumeric = parseNumeric(leftTrimmed)
  const rightNumeric = parseNumeric(rightTrimmed)

  if (leftNumeric !== null && rightNumeric !== null) {
    if (leftNumeric !== rightNumeric) {
      return leftNumeric - rightNumeric
    }
  }

  return leftTrimmed.localeCompare(rightTrimmed, 'es', {
    sensitivity: 'base',
    numeric: true,
  })
}

function inferColumnInputType(header: string, sampleValues: string[]): ColumnInputType {
  const normalizedHeader = normalizeKey(header)

  if (includesAny(normalizedHeader, MULTILINE_HEADER_HINTS)) {
    return 'multiline'
  }

  if (includesAny(normalizedHeader, DATE_HEADER_HINTS)) {
    return 'date'
  }

  if (includesAny(normalizedHeader, DECIMAL_HEADER_HINTS)) {
    return 'decimal'
  }

  if (includesAny(normalizedHeader, INTEGER_HEADER_HINTS)) {
    return 'integer'
  }

  if (sampleValues.length === 0) {
    return 'text'
  }

  let dateHits = 0
  let numericHits = 0
  let integerHits = 0

  sampleValues.forEach((value) => {
    if (parseDateValue(value)) {
      dateHits += 1
    }

    const numeric = parseNumeric(value)
    if (numeric !== null) {
      numericHits += 1
      if (Number.isInteger(numeric)) {
        integerHits += 1
      }
    }
  })

  const sampleCount = sampleValues.length
  if (dateHits / sampleCount >= 0.7) {
    return 'date'
  }

  if (numericHits / sampleCount >= 0.8) {
    return integerHits === numericHits ? 'integer' : 'decimal'
  }

  return 'text'
}

function buildRelationLookup(
  header: string,
  currentSheetName: string,
  relatedSheets: RelatedSheetMap,
): { values: string[]; relationTableName: string | null; relationOptions: RelationOption[] } {
  const normalizedHeader = normalizeKey(header)
  if (!normalizedHeader) {
    return { values: [], relationTableName: null, relationOptions: [] }
  }

  const relation = findRelationRuleForField(currentSheetName, header)
  if (!relation) {
    return { values: [], relationTableName: null, relationOptions: [] }
  }

  const normalizedCurrentTable = normalizeKey(currentSheetName)
  const normalizedRelatedTable = normalizeKey(relation.targetTable)
  if (normalizedCurrentTable === normalizedRelatedTable) {
    return { values: [], relationTableName: null, relationOptions: [] }
  }

  const relatedSheet = relatedSheets[normalizedRelatedTable]
  if (!relatedSheet || relatedSheet.rows.length === 0 || relatedSheet.headers.length === 0) {
    return { values: [], relationTableName: relation.targetTable, relationOptions: [] }
  }

  const idColumnHints = [header, ...(relation.targetIdHeaders || []), ...ID_COLUMN_HINTS]
  const idColumnIndex = findColumnIndex(relatedSheet.headers, idColumnHints)

  const explicitDisplayHints = relation.targetValueHeaders.filter((hint) => !isLikelyIdLabel(hint))
  const displayColumnHints = explicitDisplayHints.length > 0
    ? [...explicitDisplayHints, ...DEFAULT_VALUE_COLUMN_HINTS]
    : [...relation.targetValueHeaders, ...DEFAULT_VALUE_COLUMN_HINTS]

  const displayColumnIndex = findColumnIndex(relatedSheet.headers, displayColumnHints)

  const safeIdColumnIndex = idColumnIndex >= 0 ? idColumnIndex : 0
  const safeDisplayColumnIndex =
    displayColumnIndex >= 0
      ? displayColumnIndex
      : relatedSheet.headers.findIndex((candidateHeader) => !isLikelyIdLabel(candidateHeader))
  const resolvedDisplayColumnIndex =
    safeDisplayColumnIndex >= 0 ? safeDisplayColumnIndex : safeIdColumnIndex

  if (safeIdColumnIndex < 0 || resolvedDisplayColumnIndex < 0) {
    return { values: [], relationTableName: relation.targetTable, relationOptions: [] }
  }

  const relationOptions: RelationOption[] = []
  const idSeen = new Set<string>()

  relatedSheet.rows.forEach((row) => {
    const idValue = (row[safeIdColumnIndex] || '').trim()
    const displayValue = (row[resolvedDisplayColumnIndex] || '').trim()

    if (!idValue || !displayValue) return

    const key = normalizeKey(idValue)
    if (!key || idSeen.has(key)) return

    idSeen.add(key)
    relationOptions.push({ idValue, displayValue })
  })

  relationOptions.sort((left, right) => {
    const byDisplay = compareMixedValuesAsc(left.displayValue, right.displayValue)
    if (byDisplay !== 0) return byDisplay
    return compareMixedValuesAsc(left.idValue, right.idValue)
  })

  const values = relationOptions.map((option) => option.displayValue)

  return { values, relationTableName: relation.targetTable, relationOptions }
}

function computeNextSequentialId(rows: string[][], idColumnIndex: number): string {
  if (idColumnIndex < 0) return ''

  let maxId = 0

  rows.forEach((row) => {
    const raw = (row[idColumnIndex] || '').trim()
    if (!raw) return

    const parsed = parseNumeric(raw)
    if (parsed === null) return

    const candidate = Math.floor(Math.abs(parsed))
    if (candidate > maxId) {
      maxId = candidate
    }
  })

  return String(maxId + 1)
}

function buildColumnSpecs(
  headers: string[],
  rows: string[][],
  currentSheetName: string,
  relatedSheets: RelatedSheetMap,
): ColumnSpec[] {
  return headers.map((header, index) => {
    const nonEmptySamples = rows
      .map((row) => (row[index] || '').trim())
      .filter((value) => value.length > 0)
      .slice(0, 60)

    const inputType = inferColumnInputType(header, nonEmptySamples)
    const ownSuggestions = [...new Set(nonEmptySamples)]
    const relatedLookup = buildRelationLookup(header, currentSheetName, relatedSheets)
    const relatedSuggestions = relatedLookup.values
    const suggestions = [...new Set([...relatedSuggestions, ...ownSuggestions])]
      .sort(compareMixedValuesAsc)
      .slice(0, 25)

    return {
      header,
      inputType,
      suggestions,
      relationTableName: relatedLookup.relationTableName,
      relationOptions: relatedLookup.relationOptions,
    }
  })
}

function buildRelationDisplayMapByColumn(
  headers: string[],
  currentSheetName: string,
  relatedSheets: RelatedSheetMap,
): Record<number, Map<string, string>> {
  const displayMapByColumn: Record<number, Map<string, string>> = {}

  headers.forEach((header, index) => {
    const relation = findRelationRuleForField(currentSheetName, header)
    if (!relation) return

    const relatedSheet = relatedSheets[normalizeKey(relation.targetTable)]
    if (!relatedSheet || relatedSheet.headers.length === 0 || relatedSheet.rows.length === 0) {
      return
    }

    const idColumnHints = [header, ...(relation.targetIdHeaders || []), ...ID_COLUMN_HINTS]
    const idColumnIndex = findColumnIndex(relatedSheet.headers, idColumnHints)

    const explicitDisplayHints = relation.targetValueHeaders.filter((hint) => !isLikelyIdLabel(hint))
    const displayColumnHints = explicitDisplayHints.length > 0 ? explicitDisplayHints : relation.targetValueHeaders
    const displayColumnIndex = findColumnIndex(relatedSheet.headers, displayColumnHints)

    const safeIdColumnIndex = idColumnIndex >= 0 ? idColumnIndex : 0
    const safeDisplayColumnIndex =
      displayColumnIndex >= 0
        ? displayColumnIndex
        : relatedSheet.headers.findIndex((candidateHeader) => !isLikelyIdLabel(candidateHeader))

    const resolvedDisplayColumnIndex =
      safeDisplayColumnIndex >= 0 ? safeDisplayColumnIndex : safeIdColumnIndex

    if (safeIdColumnIndex < 0 || resolvedDisplayColumnIndex < 0) {
      return
    }

    const valueMap = new Map<string, string>()

    relatedSheet.rows.forEach((row) => {
      const idValue = (row[safeIdColumnIndex] || '').trim()
      const displayValue = (row[resolvedDisplayColumnIndex] || '').trim()

      if (!idValue || !displayValue) return
      valueMap.set(normalizeKey(idValue), displayValue)
    })

    if (valueMap.size > 0) {
      displayMapByColumn[index] = valueMap
    }
  })

  return displayMapByColumn
}

function buildDisplayHeaderByColumn(
  headers: string[],
  currentSheetName: string,
  relatedSheets: RelatedSheetMap,
): Record<number, string> {
  const displayHeaderByColumn: Record<number, string> = {}

  headers.forEach((header, index) => {
    const relation = findRelationRuleForField(currentSheetName, header)
    if (!relation || !isLikelyIdLabel(header)) {
      displayHeaderByColumn[index] = humanizeHeader(header)
      return
    }

    const relatedSheet = relatedSheets[normalizeKey(relation.targetTable)]
    const explicitDisplayHints = relation.targetValueHeaders.filter((hint) => !isLikelyIdLabel(hint))

    let preferredLabel = ''

    if (relatedSheet && explicitDisplayHints.length > 0) {
      const displayColumnIndex = findColumnIndex(relatedSheet.headers, explicitDisplayHints)
      if (displayColumnIndex >= 0) {
        preferredLabel = relatedSheet.headers[displayColumnIndex]
      }
    }

    if (!preferredLabel && explicitDisplayHints.length > 0) {
      preferredLabel = explicitDisplayHints[0]
    }

    if (!preferredLabel) {
      displayHeaderByColumn[index] = humanizeHeader(header)
      return
    }

    const normalizedPreferred = normalizeKey(preferredLabel)
    const isGenericLabel = normalizedPreferred === 'nombre' || normalizedPreferred === 'name' || normalizedPreferred === 'descripcion'

    const finalLabel = isGenericLabel
      ? `${preferredLabel} ${toSingularTableLabel(relation.targetTable)}`.trim()
      : preferredLabel

    displayHeaderByColumn[index] = humanizeHeader(finalLabel)
  })

  return displayHeaderByColumn
}

function resolveDisplayCellValue(rawValue: string, valueMap?: Map<string, string>): string {
  const trimmed = (rawValue || '').trim()
  if (!trimmed) return ''
  if (!valueMap) return trimmed

  const relatedValue = valueMap.get(normalizeKey(trimmed))
  return relatedValue || trimmed
}

function coerceValueForInput(rawValue: string, spec: ColumnSpec): string {
  const trimmed = (rawValue || '').trim()
  if (!trimmed) return ''

  if (spec.inputType === 'date') {
    const parsedDate = parseDateValue(trimmed)
    return parsedDate ? formatDateInputValue(parsedDate) : ''
  }

  return trimmed
}

function areValuesEquivalent(leftValue: string, rightValue: string): boolean {
  const leftTrimmed = (leftValue || '').trim()
  const rightTrimmed = (rightValue || '').trim()

  if (!leftTrimmed || !rightTrimmed) return false
  if (normalizeKey(leftTrimmed) === normalizeKey(rightTrimmed)) return true

  const leftNumeric = parseNumeric(leftTrimmed)
  const rightNumeric = parseNumeric(rightTrimmed)
  if (leftNumeric === null || rightNumeric === null) return false

  return Math.abs(leftNumeric - rightNumeric) < 0.000001
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100
}

function getEnviosComputedColumnIndexes(headers: string[]): Set<number> {
  const indexes = [
    findColumnIndex(headers, COBRO_ENTREGA_HEADER_HINTS),
    findColumnIndex(headers, PAGO_MOTO_HEADER_HINTS),
    findColumnIndex(headers, INGRESO_TOTAL_FILA_HEADER_HINTS),
    findColumnIndex(headers, COSTO_TOTAL_FILA_HEADER_HINTS),
    findColumnIndex(headers, TIENDA_FULLFILMENT_HEADER_HINTS),
  ].filter((index) => index >= 0)

  return new Set(indexes)
}

function resolveTiendaNombre(args: {
  rowValues: string[]
  headers: string[]
  relatedSheets: RelatedSheetMap
}): { tiendaNombre: string; tiendaId: string } {
  const tiendaNombreIndex = findColumnIndex(args.headers, NOMBRE_TIENDA_HEADER_HINTS)
  const tiendaIdIndex = findColumnIndex(args.headers, ID_TIENDA_HEADER_HINTS)

  const tiendaNombreDirecto = tiendaNombreIndex >= 0 ? (args.rowValues[tiendaNombreIndex] || '').trim() : ''
  const tiendaId = tiendaIdIndex >= 0 ? (args.rowValues[tiendaIdIndex] || '').trim() : ''

  if (tiendaNombreDirecto) {
    return { tiendaNombre: tiendaNombreDirecto, tiendaId }
  }

  if (!tiendaId) {
    return { tiendaNombre: '', tiendaId: '' }
  }

  const tiendasSheet = args.relatedSheets[normalizeKey('TIENDAS')]
  if (!tiendasSheet || tiendasSheet.headers.length === 0 || tiendasSheet.rows.length === 0) {
    return { tiendaNombre: '', tiendaId }
  }

  const tiendasIdIndex = findColumnIndex(tiendasSheet.headers, ID_TIENDA_HEADER_HINTS)
  const tiendasNombreIndex = findColumnIndex(tiendasSheet.headers, ['Nombre tienda', 'Nombre'])

  const safeTiendasIdIndex = tiendasIdIndex >= 0 ? tiendasIdIndex : 0
  const safeTiendasNombreIndex = tiendasNombreIndex >= 0 ? tiendasNombreIndex : safeTiendasIdIndex

  const tiendaRow = tiendasSheet.rows.find((row) => {
    const candidateId = (row[safeTiendasIdIndex] || '').trim()
    return areValuesEquivalent(candidateId, tiendaId)
  })

  if (!tiendaRow) {
    return { tiendaNombre: '', tiendaId }
  }

  return {
    tiendaNombre: (tiendaRow[safeTiendasNombreIndex] || '').trim(),
    tiendaId,
  }
}

function applyEnviosCobroEntregaFormula(args: {
  rowValues: string[]
  headers: string[]
  relatedSheets: RelatedSheetMap
}): { rowValues: string[]; error: string | null } {
  const result = applyEnviosDerivedValues({
    rowValues: args.rowValues,
    headers: args.headers,
    relatedSheets: args.relatedSheets,
    strict: true,
  })

  return result
}

function applyEnviosDerivedValues(args: {
  rowValues: string[]
  headers: string[]
  relatedSheets: RelatedSheetMap
  strict: boolean
}): { rowValues: string[]; error: string | null } {
  const nextRowValues = [...args.rowValues]

  const destinoIndex = findColumnIndex(args.headers, ID_DESTINO_HEADER_HINTS)
  const cobroEntregaIndex = findColumnIndex(args.headers, COBRO_ENTREGA_HEADER_HINTS)
  const pagoMotoIndex = findColumnIndex(args.headers, PAGO_MOTO_HEADER_HINTS)
  const ingresoTotalFilaIndex = findColumnIndex(args.headers, INGRESO_TOTAL_FILA_HEADER_HINTS)
  const costoTotalFilaIndex = findColumnIndex(args.headers, COSTO_TOTAL_FILA_HEADER_HINTS)
  const extraPuntoEmpresaIndex = findColumnIndex(args.headers, EXTRA_PUNTO_EMPRESA_HEADER_HINTS)
  const extraPuntoMotoIndex = findColumnIndex(args.headers, EXTRA_PUNTO_MOTO_HEADER_HINTS)
  const excedentePagadoMotoIndex = findColumnIndex(args.headers, EXCEDENTE_PAGADO_MOTO_HEADER_HINTS)
  const tiendaFullfilmentIndex = findColumnIndex(args.headers, TIENDA_FULLFILMENT_HEADER_HINTS)

  let cobroEntrega = cobroEntregaIndex >= 0 ? parseNumeric(nextRowValues[cobroEntregaIndex] || '') : null
  let pagoMoto = pagoMotoIndex >= 0 ? parseNumeric(nextRowValues[pagoMotoIndex] || '') : null

  const destinoId = destinoIndex >= 0 ? (nextRowValues[destinoIndex] || '').trim() : ''

  if (destinoIndex >= 0 && destinoId) {
    const tarifasSheet = args.relatedSheets[normalizeKey('TARIFAS')]
    if (!tarifasSheet || tarifasSheet.headers.length === 0 || tarifasSheet.rows.length === 0) {
      if (args.strict) {
        return {
          rowValues: [],
          error: 'No se pudo calcular ENVIOS porque la hoja TARIFAS no esta disponible.',
        }
      }
    } else {
      const tarifaDestinoIndex = findColumnIndex(tarifasSheet.headers, TARIFA_DESTINO_LOOKUP_HINTS)
      const tarifaCobroIndex = findColumnIndex(tarifasSheet.headers, TARIFA_COBRO_ENTREGA_HINTS)
      const tarifaPagoMotoIndex = findColumnIndex(tarifasSheet.headers, TARIFA_PAGO_MOTO_HINTS)
      const safeTarifaDestinoIndex = tarifaDestinoIndex >= 0 ? tarifaDestinoIndex : 0

      if (tarifaCobroIndex < 0 || tarifaPagoMotoIndex < 0) {
        if (args.strict) {
          return {
            rowValues: [],
            error: 'No se pudieron identificar las columnas Cobro entrega y/o Pago moto en TARIFAS.',
          }
        }
      } else {
        const tarifaRow = tarifasSheet.rows.find((row) => {
          const candidateDestinoId = (row[safeTarifaDestinoIndex] || '').trim()
          return areValuesEquivalent(candidateDestinoId, destinoId)
        })

        if (!tarifaRow) {
          if (args.strict) {
            return {
              rowValues: [],
              error: `No se encontro tarifa para el destino ID "${destinoId}" en TARIFAS.`,
            }
          }
        } else {
          const tarifaCobroEntrega = parseNumeric(tarifaRow[tarifaCobroIndex] || '')
          cobroEntrega = tarifaCobroEntrega === null ? null : tarifaCobroEntrega / IGV_DIVISOR
          pagoMoto = parseNumeric(tarifaRow[tarifaPagoMotoIndex] || '')

          if ((cobroEntrega === null || pagoMoto === null) && args.strict) {
            return {
              rowValues: [],
              error: `La tarifa del destino ID "${destinoId}" no es valida para calcular Cobro entrega/Pago moto.`,
            }
          }
        }
      }
    }
  }

  if (cobroEntregaIndex >= 0) {
    nextRowValues[cobroEntregaIndex] = cobroEntrega === null ? '' : String(roundToTwoDecimals(cobroEntrega))
  }

  if (pagoMotoIndex >= 0) {
    nextRowValues[pagoMotoIndex] = pagoMoto === null ? '' : String(roundToTwoDecimals(pagoMoto))
  }

  if (ingresoTotalFilaIndex >= 0) {
    const extraPuntoEmpresa = extraPuntoEmpresaIndex >= 0 ? parseNumeric(nextRowValues[extraPuntoEmpresaIndex] || '') : null
    const hasAnyValue = cobroEntrega !== null || extraPuntoEmpresa !== null
    const ingresoTotalFila = (cobroEntrega || 0) + (extraPuntoEmpresa || 0)
    nextRowValues[ingresoTotalFilaIndex] = hasAnyValue ? String(roundToTwoDecimals(ingresoTotalFila)) : ''
  }

  if (costoTotalFilaIndex >= 0) {
    const extraPuntoMoto = extraPuntoMotoIndex >= 0 ? parseNumeric(nextRowValues[extraPuntoMotoIndex] || '') : null
    const excedentePagadoMoto = excedentePagadoMotoIndex >= 0 ? parseNumeric(nextRowValues[excedentePagadoMotoIndex] || '') : null
    const hasAnyValue = pagoMoto !== null || extraPuntoMoto !== null || excedentePagadoMoto !== null
    const costoTotalFila = (pagoMoto || 0) + (extraPuntoMoto || 0) + (excedentePagadoMoto || 0)
    nextRowValues[costoTotalFilaIndex] = hasAnyValue ? String(roundToTwoDecimals(costoTotalFila)) : ''
  }

  if (tiendaFullfilmentIndex >= 0) {
    const { tiendaNombre, tiendaId } = resolveTiendaNombre({
      rowValues: nextRowValues,
      headers: args.headers,
      relatedSheets: args.relatedSheets,
    })

    if (!tiendaNombre && !tiendaId) {
      nextRowValues[tiendaFullfilmentIndex] = ''
      return { rowValues: nextRowValues, error: null }
    }

    const leadsSheet = args.relatedSheets[normalizeKey('LEADS GANADOS')]
    const fullfilmentSheet = args.relatedSheets[normalizeKey('FULLFILMENT')]

    if (!leadsSheet || leadsSheet.headers.length === 0 || leadsSheet.rows.length === 0) {
      if (args.strict) {
        return {
          rowValues: [],
          error: 'No se pudo validar tienda fullfilment porque la hoja LEADS GANADOS no esta disponible.',
        }
      }

      nextRowValues[tiendaFullfilmentIndex] = ''
      return { rowValues: nextRowValues, error: null }
    }

    if (!fullfilmentSheet || fullfilmentSheet.headers.length === 0 || fullfilmentSheet.rows.length === 0) {
      if (args.strict) {
        return {
          rowValues: [],
          error: 'No se pudo validar tienda fullfilment porque la hoja FULLFILMENT no esta disponible.',
        }
      }

      nextRowValues[tiendaFullfilmentIndex] = ''
      return { rowValues: nextRowValues, error: null }
    }

    const leadsTiendaIndex = findColumnIndex(leadsSheet.headers, LEADS_TIENDA_HEADER_HINTS)
    const leadsIdFullfilmentIndex = findColumnIndex(leadsSheet.headers, LEADS_ID_FULLFILMENT_HEADER_HINTS)
    const leadsFullfilmentFlagIndex = findColumnIndex(leadsSheet.headers, LEADS_FULLFILMENT_FLAG_HEADER_HINTS)

    if (leadsTiendaIndex < 0 || (leadsIdFullfilmentIndex < 0 && leadsFullfilmentFlagIndex < 0)) {
      if (args.strict) {
        return {
          rowValues: [],
          error: 'No se encontraron columnas de tienda/fullfilment en LEADS GANADOS para validar la tienda.',
        }
      }

      nextRowValues[tiendaFullfilmentIndex] = ''
      return { rowValues: nextRowValues, error: null }
    }

    const matchingLeadRows = leadsSheet.rows.filter((row) => {
      const candidateStore = (row[leadsTiendaIndex] || '').trim()
      if (!candidateStore) return false

      if (tiendaNombre && areValuesEquivalent(candidateStore, tiendaNombre)) {
        return true
      }

      if (tiendaId && areValuesEquivalent(candidateStore, tiendaId)) {
        return true
      }

      return false
    })

    if (matchingLeadRows.length === 0) {
      nextRowValues[tiendaFullfilmentIndex] = 'No'
      return { rowValues: nextRowValues, error: null }
    }

    const leadWithIdFullfilment =
      leadsIdFullfilmentIndex >= 0
        ? matchingLeadRows.find((row) => (row[leadsIdFullfilmentIndex] || '').trim().length > 0) || matchingLeadRows[0]
        : matchingLeadRows[0]

    const leadIdFullfilment =
      leadsIdFullfilmentIndex >= 0 ? (leadWithIdFullfilment[leadsIdFullfilmentIndex] || '').trim() : ''

    if (leadIdFullfilment) {
      const fullfilmentIdIndex = findColumnIndex(fullfilmentSheet.headers, FULLFILMENT_ID_HEADER_HINTS)
      const safeFullfilmentIdIndex = fullfilmentIdIndex >= 0 ? fullfilmentIdIndex : 0

      const idExists = fullfilmentSheet.rows.some((row) => {
        const candidateId = (row[safeFullfilmentIdIndex] || '').trim()
        return areValuesEquivalent(candidateId, leadIdFullfilment)
      })

      nextRowValues[tiendaFullfilmentIndex] = idExists ? 'Si' : 'No'
      return { rowValues: nextRowValues, error: null }
    }

    if (leadsFullfilmentFlagIndex >= 0) {
      const fullfilmentFlag = normalizeKey((leadWithIdFullfilment[leadsFullfilmentFlagIndex] || '').trim())
      const enabledFlags = new Set(['si', 'sí', 'yes', 'true', '1', 'habilitado'])
      nextRowValues[tiendaFullfilmentIndex] = enabledFlags.has(fullfilmentFlag) ? 'Si' : 'No'
      return { rowValues: nextRowValues, error: null }
    }

    nextRowValues[tiendaFullfilmentIndex] = 'No'
  }

  return { rowValues: nextRowValues, error: null }
}

function applyEnviosCobroEntregaPreview(args: {
  draft: string[]
  headers: string[]
  relatedSheets: RelatedSheetMap
}): string[] {
  const result = applyEnviosDerivedValues({
    rowValues: args.draft,
    headers: args.headers,
    relatedSheets: args.relatedSheets,
    strict: false,
  })

  return result.rowValues
}

function normalizeRowForSubmit(args: {
  draft: string[]
  specs: ColumnSpec[]
  sheetName: string
  headers: string[]
  relatedSheets: RelatedSheetMap
}): { rowValues: string[]; error: string | null } {
  const rowValues: string[] = []

  for (let index = 0; index < args.specs.length; index += 1) {
    const spec = args.specs[index]
    const value = (args.draft[index] || '').trim()

    if (!value) {
      rowValues.push('')
      continue
    }

    if (spec.inputType === 'date') {
      const parsedDate = parseDateValue(value)
      if (!parsedDate) {
        return {
          rowValues: [],
          error: `La columna "${spec.header}" requiere una fecha valida.`,
        }
      }

      rowValues.push(formatDateInputValue(parsedDate))
      continue
    }

    if (spec.inputType === 'integer') {
      const parsedNumber = parseNumeric(value)
      if (parsedNumber === null) {
        return {
          rowValues: [],
          error: `La columna "${spec.header}" requiere un numero entero.`,
        }
      }

      rowValues.push(String(Math.round(parsedNumber)))
      continue
    }

    if (spec.inputType === 'decimal') {
      const parsedNumber = parseNumeric(value)
      if (parsedNumber === null) {
        return {
          rowValues: [],
          error: `La columna "${spec.header}" requiere un numero valido.`,
        }
      }

      rowValues.push(String(parsedNumber))
      continue
    }

    rowValues.push(value)
  }

  if (normalizeKey(args.sheetName) === normalizeKey('ENVIOS')) {
    return applyEnviosCobroEntregaFormula({
      rowValues,
      headers: args.headers,
      relatedSheets: args.relatedSheets,
    })
  }

  return { rowValues, error: null }
}

export default function CrudSection({
  sheet,
  relatedSheets,
  title,
  description,
  visibleRecords,
  onCreate,
  onUpdate,
  onDelete,
  busy,
}: {
  sheet: RawSheetData
  relatedSheets: RelatedSheetMap
  title: string
  description: string
  visibleRecords: RowRecord[]
  onCreate: (sheetName: string, rowValues: string[], columnCount: number) => Promise<void>
  onUpdate: (sheetName: string, rowNumber: number, rowValues: string[], columnCount: number) => Promise<void>
  onDelete: (sheetName: string, rowNumber: number) => Promise<void>
  busy: boolean
}) {
  const headers = sheet.headers
  const [createDraft, setCreateDraft] = useState<string[]>(() => headers.map(() => ''))
  const [editRowNumber, setEditRowNumber] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)
  const [crudModalMode, setCrudModalMode] = useState<CrudModalMode>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const columnSpecs = useMemo(
    () => buildColumnSpecs(headers, sheet.rows, sheet.sheetName, relatedSheets),
    [headers, sheet.rows, sheet.sheetName, relatedSheets],
  )

  const relationDisplayMapByColumn = useMemo(
    () => buildRelationDisplayMapByColumn(headers, sheet.sheetName, relatedSheets),
    [headers, sheet.sheetName, relatedSheets],
  )

  const recordsWithDisplay = useMemo<DisplayRecord[]>(() => {
    return visibleRecords.map((record) => ({
      ...record,
      displayRow: headers.map((_, index) => {
        const rawValue = record.row[index] || ''
        return resolveDisplayCellValue(rawValue, relationDisplayMapByColumn[index])
      }),
    }))
  }, [visibleRecords, headers, relationDisplayMapByColumn])

  const displayHeaderByColumn = useMemo(
    () => buildDisplayHeaderByColumn(headers, sheet.sheetName, relatedSheets),
    [headers, sheet.sheetName, relatedSheets],
  )

  const orderedColumnIndexes = useMemo(() => {
    const baseIndexes = headers.map((_, index) => index)
    const primaryIdColumnIndex = headers.findIndex((header) => isLikelyIdLabel(header))

    if (primaryIdColumnIndex < 0) {
      return baseIndexes
    }

    return [primaryIdColumnIndex, ...baseIndexes.filter((index) => index !== primaryIdColumnIndex)]
  }, [headers])

  const primaryIdColumnIndex = useMemo(
    () => headers.findIndex((header) => isLikelyIdLabel(header)),
    [headers],
  )

  const nextSequentialId = useMemo(
    () => computeNextSequentialId(sheet.rows, primaryIdColumnIndex),
    [sheet.rows, primaryIdColumnIndex],
  )

  const relationalIdColumnIndexes = useMemo(() => {
    return new Set(
      headers
        .map((header, index) => ({ index, isRelationalId: Boolean(columnSpecs[index]?.relationTableName) && isLikelyIdLabel(header) }))
        .filter((item) => item.isRelationalId)
        .map((item) => item.index),
    )
  }, [headers, columnSpecs])

  const isEnviosSheet = useMemo(
    () => normalizeKey(sheet.sheetName) === normalizeKey('ENVIOS'),
    [sheet.sheetName],
  )

  const enviosComputedColumnIndexes = useMemo(
    () => getEnviosComputedColumnIndexes(headers),
    [headers],
  )

  const applyEnviosFormulaToDraft = useCallback(
    (draft: string[]): string[] => {
      if (!isEnviosSheet) return draft
      return applyEnviosCobroEntregaPreview({
        draft,
        headers,
        relatedSheets,
      })
    },
    [isEnviosSheet, headers, relatedSheets],
  )

  useEffect(() => {
    if (!crudModalMode) return

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCrudModalMode(null)
        setFormError(null)
      }
    }

    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [crudModalMode])

  // La busqueda se normaliza para que sea estable en todas las columnas.
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredRecords = useMemo(() => {
    if (!normalizedSearch) return recordsWithDisplay

    return recordsWithDisplay.filter((record) => {
      if (String(record.rowNumber).includes(normalizedSearch)) return true
      const matchesRaw = record.row.some((cell) => (cell || '').toLowerCase().includes(normalizedSearch))
      if (matchesRaw) return true

      return record.displayRow.some((cell) => (cell || '').toLowerCase().includes(normalizedSearch))
    })
  }, [recordsWithDisplay, normalizedSearch])

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))

  // Mantiene un numero de pagina valido sin forzar renders extra.
  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * pageSize
  const pagedRecords = filteredRecords.slice(startIndex, startIndex + pageSize)
  const fromLabel = filteredRecords.length > 0 ? startIndex + 1 : 0
  const toLabel = filteredRecords.length > 0 ? startIndex + pagedRecords.length : 0
  const canCreate = createDraft.some((value, index) => {
    if (index === primaryIdColumnIndex) return false
    return value.trim().length > 0
  })
  const isCreateModal = crudModalMode === 'create'
  const isEditModal = crudModalMode === 'edit'

  const handleEditStart = (record: RowRecord) => {
    setEditRowNumber(record.rowNumber)
    const baseDraft = headers.map((_, index) => coerceValueForInput(record.row[index] || '', columnSpecs[index]))
    setEditDraft(applyEnviosFormulaToDraft(baseDraft))
    setFormError(null)
    setCrudModalMode('edit')
  }

  const openCreateModal = () => {
    const nextDraft = headers.map(() => '')
    if (primaryIdColumnIndex >= 0) {
      nextDraft[primaryIdColumnIndex] = nextSequentialId
    }

    setCreateDraft(applyEnviosFormulaToDraft(nextDraft))
    setFormError(null)
    setCrudModalMode('create')
  }

  const handleCreate = async () => {
    if (!canCreate) return

    const draftValues = [...createDraft]
    if (primaryIdColumnIndex >= 0 && !(draftValues[primaryIdColumnIndex] || '').trim()) {
      draftValues[primaryIdColumnIndex] = nextSequentialId
    }

    const normalized = normalizeRowForSubmit({
      draft: draftValues,
      specs: columnSpecs,
      sheetName: sheet.sheetName,
      headers,
      relatedSheets,
    })
    if (normalized.error) {
      setFormError(normalized.error)
      return
    }

    await onCreate(sheet.sheetName, normalized.rowValues, headers.length)
    setCreateDraft(headers.map(() => ''))
    setFormError(null)
    setCrudModalMode(null)
  }

  const handleUpdate = async () => {
    if (editRowNumber === null) return

    const normalized = normalizeRowForSubmit({
      draft: editDraft,
      specs: columnSpecs,
      sheetName: sheet.sheetName,
      headers,
      relatedSheets,
    })
    if (normalized.error) {
      setFormError(normalized.error)
      return
    }

    await onUpdate(sheet.sheetName, editRowNumber, normalized.rowValues, headers.length)
    setEditRowNumber(null)
    setEditDraft([])
    setFormError(null)
    setCrudModalMode(null)
  }

  const setDraftFieldValue = (index: number, nextValue: string, options?: { allowProtectedId?: boolean }) => {
    const isComputedField = isEnviosSheet && enviosComputedColumnIndexes.has(index)
    const isProtectedId = index === primaryIdColumnIndex || relationalIdColumnIndexes.has(index)
    if ((isProtectedId && !options?.allowProtectedId) || isComputedField) {
      return
    }

    setFormError(null)

    if (isCreateModal) {
      const next = [...createDraft]
      next[index] = nextValue
      setCreateDraft(applyEnviosFormulaToDraft(next))
      return
    }

    const next = [...editDraft]
    next[index] = nextValue
    setEditDraft(applyEnviosFormulaToDraft(next))
  }

  useEffect(() => {
    if (!isEnviosSheet) return

    if (isCreateModal) {
      setCreateDraft((previous) => applyEnviosFormulaToDraft(previous))
      return
    }

    if (isEditModal) {
      setEditDraft((previous) => applyEnviosFormulaToDraft(previous))
    }
  }, [isEnviosSheet, isCreateModal, isEditModal, applyEnviosFormulaToDraft])

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
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
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_auto_auto] xl:grid-cols-[1fr_auto_auto_auto]">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Buscar en filas
              <input
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value)
                  setPage(1)
                }}
                placeholder="Fila, tienda, vendedor, estado..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Filas por pagina
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value) || 25)
                  setPage(1)
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={`page-size-${size}`} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <div className="self-end rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              Mostrando {formatInt(fromLabel)} - {formatInt(toLabel)} de {formatInt(filteredRecords.length)}
            </div>

            <button
              onClick={openCreateModal}
              disabled={busy}
              className="self-end rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              Nuevo registro
            </button>
          </div>

          <div className="max-w-full overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Registros de la hoja</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSearchTerm('')}
                  disabled={!searchTerm}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  Limpiar busqueda
                </button>
                <button
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={safePage <= 1}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  Anterior
                </button>
                <span className="text-xs font-semibold text-slate-600">
                  Pagina {safePage} de {totalPages}
                </span>
                <button
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safePage >= totalPages}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  Siguiente
                </button>
              </div>
            </div>

            {pagedRecords.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                No hay filas que coincidan con la busqueda o el rango de fechas seleccionado.
              </div>
            ) : (
              <div className="max-h-[460px] max-w-full overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      {orderedColumnIndexes.length > 0 && (
                        <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">
                          {displayHeaderByColumn[orderedColumnIndexes[0]] || headers[orderedColumnIndexes[0]]}
                        </th>
                      )}
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">Acciones</th>
                      {orderedColumnIndexes.slice(1).map((columnIndex) => (
                        <th
                          key={`header-${columnIndex + 1}`}
                          className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600"
                        >
                          {displayHeaderByColumn[columnIndex] || headers[columnIndex]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRecords.map((record) => (
                      <tr key={`row-${record.rowNumber}`} className="odd:bg-white even:bg-slate-50">
                        {orderedColumnIndexes.length > 0 && (
                          <td
                            className="max-w-56 truncate border-b border-slate-100 px-3 py-2 font-semibold text-slate-700"
                            title={record.row[orderedColumnIndexes[0]] || ''}
                          >
                            {record.displayRow[orderedColumnIndexes[0]] || '-'}
                          </td>
                        )}
                        <td className="whitespace-nowrap border-b border-slate-100 px-2 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditStart(record)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                            >
                              <PencilLine size={16} />
                            </button>
                            <button
                              onClick={() => {
                                if (!window.confirm(`Eliminar fila ${record.rowNumber} de ${sheet.sheetName}?`)) return
                                void onDelete(sheet.sheetName, record.rowNumber)
                              }}
                              className="rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-700"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                        {orderedColumnIndexes.slice(1).map((columnIndex) => (
                          <td
                            key={`cell-${record.rowNumber}-${columnIndex + 1}`}
                            className="max-w-56 truncate border-b border-slate-100 px-3 py-2 text-slate-700"
                            title={record.row[columnIndex] || ''}
                          >
                            {record.displayRow[columnIndex] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {crudModalMode && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" onClick={() => setCrudModalMode(null)}>
              <section
                className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      {isCreateModal ? 'Crear nuevo registro' : `Editar fila ${editRowNumber || ''}`}
                    </h4>
                    <p className="text-xs text-slate-500">{sheet.sheetName}</p>
                  </div>
                  <button
                    onClick={() => {
                      setCrudModalMode(null)
                      setFormError(null)
                    }}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700"
                  >
                    Cerrar
                  </button>
                </header>

                <div className="max-h-[68vh] overflow-auto px-4 py-4 sm:px-5">
                  {formError && (
                    <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {formError}
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {headers.map((header, index) => {
                      const spec = columnSpecs[index]
                      const value = isCreateModal ? createDraft[index] || '' : editDraft[index] || ''
                      const displayLabel = displayHeaderByColumn[index] || header
                      const isPrimaryIdField = index === primaryIdColumnIndex
                      const isRelationalIdField = relationalIdColumnIndexes.has(index)
                      const isComputedEnviosField = isEnviosSheet && enviosComputedColumnIndexes.has(index)
                      const hasRelationOptions = spec.relationOptions.length > 0
                      const selectedRelationOption = hasRelationOptions
                        ? spec.relationOptions.find((option) => normalizeKey(option.idValue) === normalizeKey(value)) || null
                        : null
                      const commonClass = `mt-1 w-full rounded-lg border px-2 py-1.5 text-sm text-slate-800 ${
                        isCreateModal ? 'border-slate-300' : 'border-amber-300'
                      }`

                      return (
                        <label
                          key={`modal-${header}-${index + 1}`}
                          className={`text-xs ${isCreateModal ? 'text-slate-600' : 'text-amber-800'}`}
                        >
                          {displayLabel}

                          {isComputedEnviosField ? (
                            <>
                              <input
                                type="text"
                                value={value}
                                readOnly
                                className={`${commonClass} cursor-not-allowed bg-slate-100 text-slate-500`}
                              />
                            </>
                          ) : isRelationalIdField ? (
                            hasRelationOptions ? (
                              <>
                                <select
                                  value={value}
                                  onChange={(event) => setDraftFieldValue(index, event.target.value, { allowProtectedId: true })}
                                  disabled={isPrimaryIdField}
                                  className={`${commonClass} ${isPrimaryIdField ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`}
                                >
                                  <option value="">
                                    {spec.relationTableName
                                      ? `Seleccionar en ${spec.relationTableName}...`
                                      : 'Seleccionar valor...'}
                                  </option>
                                  {spec.relationOptions.map((option) => (
                                    <option key={`relation-${header}-${option.idValue}`} value={option.idValue}>
                                      {option.displayValue}
                                    </option>
                                  ))}
                                </select>
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {value
                                    ? `Se guardara ID: ${value}${selectedRelationOption ? ` (${selectedRelationOption.displayValue})` : ''}`
                                    : 'Selecciona un valor para guardar su ID relacionado.'}
                                </p>
                              </>
                            ) : (
                              <>
                                <input
                                  type="text"
                                  value={value}
                                  readOnly
                                  placeholder="Sin opciones relacionadas disponibles"
                                  className={`${commonClass} cursor-not-allowed bg-slate-100 text-slate-500`}
                                />
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {value
                                    ? `Se guardara ID: ${value}`
                                    : 'No hay datos relacionados cargados para seleccionar.'}
                                </p>
                              </>
                            )
                          ) : hasRelationOptions ? (
                            <select
                              value={value}
                              onChange={(event) => setDraftFieldValue(index, event.target.value)}
                              disabled={isPrimaryIdField}
                              className={`${commonClass} ${isPrimaryIdField ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`}
                            >
                              <option value="">
                                {spec.relationTableName
                                  ? `Seleccionar en ${spec.relationTableName}...`
                                  : 'Seleccionar valor...' }
                              </option>
                              {spec.relationOptions.map((option) => (
                                <option key={`relation-${header}-${option.idValue}`} value={option.idValue}>
                                  {option.displayValue}
                                </option>
                              ))}
                            </select>
                          ) : spec.inputType === 'multiline' ? (
                            <textarea
                              rows={3}
                              value={value}
                              onChange={(event) => setDraftFieldValue(index, event.target.value)}
                              readOnly={isPrimaryIdField}
                              className={`${commonClass} ${isPrimaryIdField ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`}
                            />
                          ) : isPrimaryIdField ? (
                            <>
                              <input
                                type="text"
                                value={value}
                                readOnly
                                className={`${commonClass} cursor-not-allowed bg-slate-100 text-slate-500`}
                              />
                              <p className="mt-1 text-[11px] text-slate-500">
                                Se genera automaticamente en secuencia.
                              </p>
                            </>
                          ) : (
                            <>
                              {spec.inputType === 'text' && spec.suggestions.length > 0 && !hasRelationOptions && (
                                <select
                                  value={value && spec.suggestions.includes(value) ? value : ''}
                                  onChange={(event) => {
                                    const selectedValue = event.target.value
                                    if (!selectedValue) return
                                    setDraftFieldValue(index, selectedValue)
                                  }}
                                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
                                >
                                  <option value="">
                                    {spec.relationTableName
                                      ? `Seleccionar en ${spec.relationTableName}...`
                                      : 'Seleccionar valor existente...'}
                                  </option>
                                  {spec.suggestions.map((option) => (
                                    <option key={`existing-${header}-${option}`} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              )}

                              <input
                                type={
                                  spec.inputType === 'date'
                                    ? 'date'
                                    : spec.inputType === 'integer' || spec.inputType === 'decimal'
                                      ? 'number'
                                      : 'text'
                                }
                                step={spec.inputType === 'integer' ? '1' : spec.inputType === 'decimal' ? '0.01' : undefined}
                                value={value}
                                onChange={(event) => setDraftFieldValue(index, event.target.value)}
                                className={commonClass}
                              />
                            </>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>

                <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
                  {isCreateModal && (
                    <button
                      onClick={() => {
                        const resetDraft = headers.map(() => '')
                        if (primaryIdColumnIndex >= 0) {
                          resetDraft[primaryIdColumnIndex] = nextSequentialId
                        }
                        setCreateDraft(applyEnviosFormulaToDraft(resetDraft))
                        setFormError(null)
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
                    >
                      Limpiar
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setCrudModalMode(null)
                      setFormError(null)
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (isCreateModal) {
                        void handleCreate()
                        return
                      }
                      if (isEditModal) {
                        void handleUpdate()
                      }
                    }}
                    disabled={busy || (isCreateModal && !canCreate) || (isEditModal && editRowNumber === null)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60 ${
                      isCreateModal ? 'bg-slate-900' : 'bg-amber-600'
                    }`}
                  >
                    {isCreateModal ? 'Crear fila' : 'Guardar cambios'}
                  </button>
                </footer>
              </section>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
