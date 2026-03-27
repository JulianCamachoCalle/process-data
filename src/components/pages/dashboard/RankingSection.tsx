import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RawSheetData } from '../../../services/sheetsData'
import {
  filterRowRecordsByDateRange,
  formatInt,
  findColumnIndex,
  normalizeKey,
  parseNumeric,
  STATUS_KEYS,
  STORE_KEYS,
  toRowRecords,
  truncateLabel,
  VENDOR_KEYS,
} from './shared'

const ID_TIENDA_HEADER_HINTS = ['IdTienda', 'IdTiendas', 'Tienda_ID', 'Tienda ID']
const ID_VENDEDOR_HEADER_HINTS = ['IdVendedor', 'Vendedor ID']
const ID_RESULTADO_HEADER_HINTS = ['IdResultado', 'Resultado ID']

function buildLookupById(
  sheet: RawSheetData | null,
  idHints: string[],
  valueHints: string[],
): Map<string, string> {
  const lookup = new Map<string, string>()
  if (!sheet || sheet.headers.length === 0 || sheet.rows.length === 0) return lookup

  const idIndex = findColumnIndex(sheet.headers, idHints)
  const valueIndex = findColumnIndex(sheet.headers, valueHints)

  const safeIdIndex = idIndex >= 0 ? idIndex : 0
  const safeValueIndex = valueIndex >= 0 ? valueIndex : safeIdIndex

  sheet.rows.forEach((row) => {
    const idValue = (row[safeIdIndex] || '').trim()
    const displayValue = (row[safeValueIndex] || '').trim()
    if (!idValue || !displayValue) return
    lookup.set(normalizeKey(idValue), displayValue)
  })

  return lookup
}

function resolveLookupValue(rawValue: string, lookup: Map<string, string>): string {
  const trimmed = (rawValue || '').trim()
  if (!trimmed) return ''

  const mapped = lookup.get(normalizeKey(trimmed))
  return mapped || trimmed
}

function buildDeliveredStatusAliases(resultadosSheet: RawSheetData | null): Set<string> {
  const aliases = new Set<string>(['1'])
  if (!resultadosSheet || resultadosSheet.headers.length === 0 || resultadosSheet.rows.length === 0) {
    return aliases
  }

  const idIndex = findColumnIndex(resultadosSheet.headers, ID_RESULTADO_HEADER_HINTS)
  const statusIndex = findColumnIndex(resultadosSheet.headers, STATUS_KEYS)
  if (idIndex < 0) return aliases

  resultadosSheet.rows.forEach((row) => {
    const rawId = (row[idIndex] || '').trim()
    if (!rawId) return

    const numericId = parseNumeric(rawId)
    const isDeliveredId = numericId !== null
      ? Math.round(numericId) === 1
      : normalizeKey(rawId) === '1'
    if (!isDeliveredId) return

    aliases.add(normalizeKey(rawId))
    if (statusIndex >= 0) {
      const statusValue = (row[statusIndex] || '').trim()
      if (statusValue) {
        aliases.add(normalizeKey(statusValue))
      }
    }
  })

  return aliases
}

function isDeliveredStatusValue(rawStatus: string, deliveredAliases: Set<string>): boolean {
  const trimmed = (rawStatus || '').trim()
  if (!trimmed) return false

  const numericStatus = parseNumeric(trimmed)
  if (numericStatus !== null) {
    return Math.round(numericStatus) === 1
  }

  return deliveredAliases.has(normalizeKey(trimmed))
}

export default function RankingSection({
  enviosSheet,
  tiendasSheet,
  vendedoresSheet,
  resultadosSheet,
  startDate,
  endDate,
}: {
  enviosSheet: RawSheetData | null
  tiendasSheet: RawSheetData | null
  vendedoresSheet: RawSheetData | null
  resultadosSheet: RawSheetData | null
  startDate: Date | null
  endDate: Date | null
}) {
  const rankingData = useMemo(() => {
    if (!tiendasSheet || tiendasSheet.headers.length === 0 || tiendasSheet.rows.length === 0) {
      return [] as Array<{ vendedor: string; tienda: string; entregados: number; key: string }>
    }

    const vendedoresLookup = buildLookupById(vendedoresSheet, ID_VENDEDOR_HEADER_HINTS, VENDOR_KEYS)
    const deliveredStatusAliases = buildDeliveredStatusAliases(resultadosSheet)

    const tiendasHeaders = tiendasSheet.headers
    const tiendaNombreColTiendas = findColumnIndex(tiendasHeaders, STORE_KEYS)
    const vendedorColTiendas = findColumnIndex(tiendasHeaders, [...VENDOR_KEYS, ...ID_VENDEDOR_HEADER_HINTS])
    const tiendaIdColTiendas = findColumnIndex(tiendasHeaders, ID_TIENDA_HEADER_HINTS)

    if (tiendaNombreColTiendas < 0 || vendedorColTiendas < 0) {
      return []
    }

    const tiendaIdToNombre = new Map<string, string>()
    const rankingCounter = new Map<string, { vendedor: string; tienda: string; entregados: number; key: string }>()

    tiendasSheet.rows.forEach((row) => {
      const tiendaNombre = (row[tiendaNombreColTiendas] || '').trim()
      if (!tiendaNombre) return

      const tiendaKey = normalizeKey(tiendaNombre)
      const vendedorRaw = (row[vendedorColTiendas] || '').trim()
      const vendedorDisplay = resolveLookupValue(vendedorRaw, vendedoresLookup) || vendedorRaw || 'Sin vendedor'

      if (tiendaIdColTiendas >= 0) {
        const tiendaId = (row[tiendaIdColTiendas] || '').trim()
        if (tiendaId) {
          tiendaIdToNombre.set(normalizeKey(tiendaId), tiendaNombre)
        }
      }

      const current = rankingCounter.get(tiendaKey)
      if (!current) {
        rankingCounter.set(tiendaKey, {
          vendedor: vendedorDisplay,
          tienda: tiendaNombre,
          entregados: 0,
          key: tiendaKey,
        })
        return
      }

      if (normalizeKey(current.vendedor) === normalizeKey('Sin vendedor') && vendedorDisplay) {
        current.vendedor = vendedorDisplay
      }
    })

    if (!enviosSheet || enviosSheet.headers.length === 0 || enviosSheet.rows.length === 0) {
      return [...rankingCounter.values()]
        .sort((a, b) => b.entregados - a.entregados || a.tienda.localeCompare(b.tienda, 'es', { sensitivity: 'base' }))
    }

    const enviosHeaders = enviosSheet.headers
    const tiendaNombreColEnvios = findColumnIndex(enviosHeaders, [...STORE_KEYS, 'Tienda', 'Nombre tienda'])
    const tiendaIdColEnvios = findColumnIndex(enviosHeaders, ID_TIENDA_HEADER_HINTS)
    const statusColEnvios = findColumnIndex(enviosHeaders, ID_RESULTADO_HEADER_HINTS)

    if (statusColEnvios < 0 || (tiendaNombreColEnvios < 0 && tiendaIdColEnvios < 0)) {
      return [...rankingCounter.values()]
        .sort((a, b) => b.entregados - a.entregados || a.tienda.localeCompare(b.tienda, 'es', { sensitivity: 'base' }))
    }

    const enviosRecords = filterRowRecordsByDateRange(
      toRowRecords(enviosSheet),
      enviosHeaders,
      startDate,
      endDate,
    )

    enviosRecords.forEach((record) => {
      const statusRaw = (record.row[statusColEnvios] || '').trim()
      if (!isDeliveredStatusValue(statusRaw, deliveredStatusAliases)) return

      const tiendaNombreRaw = tiendaNombreColEnvios >= 0
        ? (record.row[tiendaNombreColEnvios] || '').trim()
        : ''
      const tiendaIdRaw = tiendaIdColEnvios >= 0
        ? (record.row[tiendaIdColEnvios] || '').trim()
        : ''

      const tiendaNombre = tiendaNombreRaw || tiendaIdToNombre.get(normalizeKey(tiendaIdRaw || '')) || ''
      if (!tiendaNombre) return

      const current = rankingCounter.get(normalizeKey(tiendaNombre))
      if (!current) return

      current.entregados += 1
    })

    return [...rankingCounter.values()]
      .sort((a, b) => b.entregados - a.entregados || a.tienda.localeCompare(b.tienda, 'es', { sensitivity: 'base' }))
  }, [enviosSheet, tiendasSheet, vendedoresSheet, resultadosSheet, startDate, endDate])

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
        <p className="mt-1 text-sm text-slate-600">Base: todas las tiendas y vendedores de TIENDAS. Conteo: ENVIOS entregados por nombre de tienda cuando IdResultado = 1 (referenciado con RESULTADOS).</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Envios entregados</p><p className="mt-1 text-xl font-bold text-slate-900">{formatInt(totalEntregados)}</p></article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tiendas en ranking</p><p className="mt-1 text-xl font-bold text-slate-900">{formatInt(totalTiendas)}</p></article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Vendedores</p><p className="mt-1 text-xl font-bold text-slate-900">{formatInt(totalVendedores)}</p></article>
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
