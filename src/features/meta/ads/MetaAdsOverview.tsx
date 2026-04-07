import { useMemo, useState } from 'react';
import { Activity, AlertCircle, BadgeDollarSign, MousePointerClick, Megaphone } from 'lucide-react';
import { formatCurrencyPen, formatNumberEs } from '../../../lib/tableHelpers';
import { useMetaAdsOverview } from './useMetaAdsOverview';
import type { MetaAdsReportingRow } from './types';

function sumBy(rows: MetaAdsReportingRow[], selector: (row: MetaAdsReportingRow) => number | null) {
  return rows.reduce((acc, row) => acc + (selector(row) ?? 0), 0);
}

function safeDivide(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

function formatStatus(value: string | null) {
  if (!value) return 'N/D';
  return value.replaceAll('_', ' ');
}

function formatDateRangeLabel(dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return 'Todo el histórico disponible';
  return `${dateFrom || '...'} → ${dateTo || '...'}`;
}

export function MetaAdsOverview() {
  const [accountId, setAccountId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const overviewQuery = useMetaAdsOverview({ accountId, dateFrom, dateTo });

  const metrics = useMemo(() => {
    const rows = overviewQuery.data?.rows ?? [];
    const totalSpend = sumBy(rows, (row) => row.spend);
    const totalImpressions = sumBy(rows, (row) => row.impressions);
    const totalReach = sumBy(rows, (row) => row.reach);
    const totalClicks = sumBy(rows, (row) => row.clicks);
    const totalAds = new Set(rows.map((row) => row.ad_business_id).filter(Boolean)).size;
    const totalCampaigns = new Set(rows.map((row) => row.campaign_business_id).filter(Boolean)).size;
    const overallCtr = safeDivide(totalClicks * 100, totalImpressions);
    const overallCpc = safeDivide(totalSpend, totalClicks);

    return {
      totalSpend,
      totalImpressions,
      totalReach,
      totalClicks,
      totalAds,
      totalCampaigns,
      overallCtr,
      overallCpc,
      dateLabel: formatDateRangeLabel(dateFrom, dateTo),
    };
  }, [dateFrom, dateTo, overviewQuery.data?.rows]);

  if (overviewQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mr-3"></div>
        Cargando overview de Meta Ads...
      </div>
    );
  }

  if (overviewQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 space-y-4">
        <AlertCircle size={48} />
        <p className="text-lg font-medium">Error al cargar Meta Ads</p>
        <p className="text-sm text-red-400 max-w-xl text-center">
          {overviewQuery.error instanceof Error ? overviewQuery.error.message : 'Error desconocido'}
        </p>
      </div>
    );
  }

  const rows = overviewQuery.data?.rows ?? [];
  const accounts = overviewQuery.data?.accounts ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white/90 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)] px-6 py-5 backdrop-blur-sm flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 inline-flex items-center gap-2">
            <Megaphone className="text-red-600" size={24} />
            Meta Ads Overview
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Vista de reporting diario a nivel anuncio desde Supabase. Solo lectura, sin sync ni OAuth todavía.
          </p>
        </div>
        <div className="hidden md:inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
          <Activity size={14} />
          Phase 1
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filtros</p>
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-3 items-end">
          <label className="text-sm text-gray-600">
            Cuenta publicitaria
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 bg-white"
            >
              <option value="">Todas las cuentas</option>
              {accounts.map((account) => (
                <option key={account.business_id} value={account.business_id}>
                  {account.name || account.business_id}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-gray-600">
            Fecha inicio
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-gray-600">
            Fecha fin
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
            />
          </label>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="text-sm text-gray-500">
              Periodo: <span className="font-semibold text-gray-800">{metrics.dateLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setAccountId('');
                setDateFrom('');
                setDateTo('');
              }}
              className="text-xs font-semibold text-red-600 hover:text-red-700"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      <Section title="KPI">
        <KpiGrid>
          <KpiCard title="Spend total" value={formatCurrencyPen(metrics.totalSpend)} icon={<BadgeDollarSign className="text-red-600" size={18} />} />
          <KpiCard title="Impresiones" value={formatNumberEs(metrics.totalImpressions)} icon={<Megaphone className="text-red-600" size={18} />} />
          <KpiCard title="Reach" value={formatNumberEs(metrics.totalReach)} icon={<Activity className="text-red-600" size={18} />} />
          <KpiCard title="Clicks" value={formatNumberEs(metrics.totalClicks)} icon={<MousePointerClick className="text-red-600" size={18} />} />
          <KpiCard title="CTR global" value={formatPercent(metrics.overallCtr)} icon={<Activity className="text-red-600" size={18} />} />
          <KpiCard title="CPC global" value={formatCurrencyPen(metrics.overallCpc)} icon={<BadgeDollarSign className="text-red-600" size={18} />} />
          <KpiCard title="Ads con data" value={formatNumberEs(metrics.totalAds)} icon={<Megaphone className="text-red-600" size={18} />} />
          <KpiCard title="Campañas con data" value={formatNumberEs(metrics.totalCampaigns)} icon={<Activity className="text-red-600" size={18} />} />
        </KpiGrid>
      </Section>

      <Section title="Detalle diario a nivel ad">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-[0_20px_42px_-34px_rgba(15,23,42,0.9)] overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-gray-200 bg-gray-50/70">
            <div>
              <p className="text-sm font-semibold text-gray-900">Ads reportados</p>
              <p className="text-xs text-gray-500">Join listo para reporting: cuenta, campaña, ad set, ad y métricas validadas.</p>
            </div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {formatNumberEs(rows.length)} fila(s)
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">
              No hay datos todavía para los filtros seleccionados. La pantalla ya quedó preparada para leer desde Supabase cuando exista ingestión.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-white">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Cuenta</th>
                    <th className="px-4 py-3">Campaña</th>
                    <th className="px-4 py-3">Ad set</th>
                    <th className="px-4 py-3">Ad</th>
                    <th className="px-4 py-3">Objetivo</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Spend</th>
                    <th className="px-4 py-3 text-right">Impresiones</th>
                    <th className="px-4 py-3 text-right">Reach</th>
                    <th className="px-4 py-3 text-right">Clicks</th>
                    <th className="px-4 py-3 text-right">CTR</th>
                    <th className="px-4 py-3 text-right">CPC</th>
                    <th className="px-4 py-3">Creative</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row.insight_row_id} className="align-top hover:bg-red-50/30">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{row.date_start}</td>
                      <td className="px-4 py-3 min-w-48">
                        <p className="font-medium text-gray-900">{row.account_name || row.account_business_id}</p>
                        <p className="text-xs text-gray-500">{row.account_business_id}</p>
                      </td>
                      <td className="px-4 py-3 min-w-52">
                        <p className="font-medium text-gray-900">{row.campaign_name || 'N/D'}</p>
                        <p className="text-xs text-gray-500">{row.campaign_business_id || 'Sin ID'}</p>
                      </td>
                      <td className="px-4 py-3 min-w-52">
                        <p className="font-medium text-gray-900">{row.adset_name || 'N/D'}</p>
                        <p className="text-xs text-gray-500">{row.adset_business_id || 'Sin ID'}</p>
                      </td>
                      <td className="px-4 py-3 min-w-64">
                        <p className="font-medium text-gray-900">{row.ad_name || row.ad_business_id}</p>
                        <p className="text-xs text-gray-500">{row.ad_business_id}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{row.objective || 'N/D'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700">
                          {formatStatus(row.ad_effective_status || row.ad_status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">{formatCurrencyPen(row.spend ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatNumberEs(row.impressions ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatNumberEs(row.reach ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatNumberEs(row.clicks ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatPercent(row.ctr ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatCurrencyPen(row.cpc ?? 0)}</td>
                      <td className="px-4 py-3 min-w-52">
                        <p className="font-medium text-gray-900">{row.creative_name || 'N/D'}</p>
                        <p className="text-xs text-gray-500">{row.creative_id || 'Sin creative_id'}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-extrabold tracking-wide text-gray-700 uppercase">{title}</h2>
      {children}
    </div>
  );
}

function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">{children}</div>;
}

function KpiCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-[0_20px_42px_-34px_rgba(15,23,42,0.9)] border border-gray-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className="h-10 w-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
          {icon}
        </div>
      </div>
    </div>
  );
}
