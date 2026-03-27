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
  ANULADOS_FILMENT_KEYS,
  COMISIONES_TOTALES_KEYS,
  COSTO_ENVIO_KEYS,
  COSTO_RECOJO_TOTAL_KEYS,
  DISTRITO_KEYS,
  formatCurrency,
  formatInt,
  findColumnIndex,
  findMetricColumnIndex,
  getRowsForDateRange,
  INGRESO_ENVIOS_KEYS,
  INGRESO_RECOJO_KEYS,
  normalizeKey,
  parseNumeric,
  RECOJO_VECES_KEYS,
  STORE_KEYS,
  sumFromColumn,
  TIPO_RECOJO_KEYS,
} from './shared'
import type { DataPoint } from './shared'

type HomeMetrics = {
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

type MetricCardItem = {
  label: string
  value: string
}

function MetricCard({ label, value }: MetricCardItem) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
    </article>
  )
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
  // Esta hoja no tiene una fecha operativa consistente; se usa completa para evitar falsos ceros.
  const comisionesRows = getRowsForDateRange(comisionesSheet, startDate, endDate, [])

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
  const costoEnviosIndex = findMetricColumnIndex(enviosSheet?.headers || [], COSTO_ENVIO_KEYS, [['Costo total fila (S/)']])
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
    [['Costo recojo total (S/)']],
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
  const tipoRecojoIndex = findMetricColumnIndex(recojosSheet?.headers || [], TIPO_RECOJO_KEYS, [['Tipo recojo']])
  const recojoVecesIndex = findMetricColumnIndex(recojosSheet?.headers || [], RECOJO_VECES_KEYS, [['veces']])
  const comisionesTotalesIndex = findMetricColumnIndex(
    comisionesSheet?.headers || [],
    COMISIONES_TOTALES_KEYS,
    [
      ['Comisión total (S/)'],
    ],
  )
  const distritoIndex = findMetricColumnIndex(tiendasSheet?.headers || [], DISTRITO_KEYS, [['distrito']])

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

  // Reagrupa los tipos de recojo para separar cobrados y gratis.
  const recojoTypeTotals =
    tipoRecojoIndex >= 0 && recojoVecesIndex >= 0
      ? recojosRows.reduce(
          (accumulator, row) => {
            const recojoTypeValue = normalizeKey(row[tipoRecojoIndex] || '')
            const veces = parseNumeric(row[recojoVecesIndex] || '') || 0

            if (veces <= 0) return accumulator
            if (recojoTypeValue.includes(recojoCobradoKey)) accumulator.cobrados += veces
            if (recojoTypeValue.includes(recojoGratisKey)) accumulator.gratis += veces
            return accumulator
          },
          { cobrados: 0, gratis: 0 },
        )
      : { cobrados: 0, gratis: 0 }

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
    recojosCobrados: recojoTypeTotals.cobrados,
    recojosGratis: recojoTypeTotals.gratis,
    pagoTotalMotorizadoRecojos,
    comisionTotalVendedores,
    costoTotalMasComision,
    margenMenosComision,
    costoPorLeadGanadoMasComision,
    distritoLeadMasFrecuente: topDistritosLeads[0]?.name || 'Sin datos',
    topDistritosLeads,
  }
}

export default function HomeSection({
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

  // Secciones de tarjetas para evitar markup duplicado y facilitar mantenimiento.
  const coreCards = useMemo<MetricCardItem[]>(
    () => [
      { label: 'Tiendas registradas', value: formatInt(metrics.tiendasRegistradas) },
      { label: 'Leads ganados', value: formatInt(metrics.leadsGanados) },
      { label: 'Envios totales', value: formatInt(metrics.enviosTotales) },
      { label: 'Promedio envios por tienda', value: metrics.promedioEnviosPorTienda.toFixed(0) },
      { label: 'Ingreso total operativo', value: formatCurrency(metrics.ingresoTotalOperativo) },
      { label: 'Costo total operativo', value: formatCurrency(metrics.costoTotalOperativo) },
      { label: 'Margen', value: formatCurrency(metrics.margen) },
      { label: 'Ticket promedio mes', value: formatCurrency(metrics.ticketPromedioMes) },
      { label: 'Costo operativo por lead ganado', value: formatCurrency(metrics.costoOperativoPorLeadGanado) },
      { label: 'Ingreso por lead ganado', value: formatCurrency(metrics.ingresoPorLeadGanado) },
      { label: 'Ingreso total anulados filment', value: formatCurrency(metrics.ingresoTotalAnuladosFilment) },
    ],
    [metrics],
  )

  const recojoCards = useMemo<MetricCardItem[]>(
    () => [
      { label: 'Recojos cobrados', value: formatInt(metrics.recojosCobrados) },
      { label: 'Recojos gratis', value: formatInt(metrics.recojosGratis) },
      { label: 'Pago total motorizado por recojos', value: formatCurrency(metrics.pagoTotalMotorizadoRecojos) },
    ],
    [metrics],
  )

  const comisionCards = useMemo<MetricCardItem[]>(
    () => [
      { label: 'Comision total vendedores', value: formatCurrency(metrics.comisionTotalVendedores) },
      { label: 'Costo total + comision', value: formatCurrency(metrics.costoTotalMasComision) },
      { label: 'Margen - comision', value: formatCurrency(metrics.margenMenosComision) },
      { label: 'Costo por lead ganado + comision', value: formatCurrency(metrics.costoPorLeadGanadoMasComision) },
      { label: 'Distrito lead mas frecuente', value: metrics.distritoLeadMasFrecuente },
    ],
    [metrics],
  )

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {coreCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} />
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {recojoCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} />
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {comisionCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} />
        ))}
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
