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
  STATUS_KEYS,
  STORE_KEYS,
  toRowRecords,
  truncateLabel,
  VENDOR_KEYS,
} from './shared'

export default function RankingSection({
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
        <p className="mt-1 text-sm text-slate-600">Base: cruza tienda y vendedor desde hoja Tiendas y cuenta en DATA ENVIOS solo filas con resultado Entregado.</p>

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
