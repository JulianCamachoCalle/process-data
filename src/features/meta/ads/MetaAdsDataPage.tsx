import { useMemo, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, Database, Search } from 'lucide-react';
import { formatCurrencyPen, formatNumberEs, normalizeText } from '../../../lib/tableHelpers';
import { KpiCard, KpiGrid, MetaAdsFiltersPanel, MetaAdsPageHero, Section } from './metaAdsShared';
import { formatPercent, formatStatus } from './metaAdsUtils';
import type { MetaAdsReportingRow } from './types';
import { useMetaAdsReporting } from './useMetaAdsReporting';

function matchesSearch(row: MetaAdsReportingRow, query: string) {
  if (!query) return true;

  const normalizedQuery = normalizeText(query);
  const values = [
    row.account_name,
    row.account_business_id,
    row.campaign_name,
    row.campaign_business_id,
    row.adset_name,
    row.adset_business_id,
    row.ad_name,
    row.ad_business_id,
    row.creative_name,
    row.creative_id,
    row.objective,
  ];

  return values.some((value) => normalizeText(String(value ?? '')).includes(normalizedQuery));
}

export function MetaAdsDataPage() {
  const [accountId, setAccountId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [draftAccountId, setDraftAccountId] = useState('');
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [objective, setObjective] = useState('');
  const [draftSearchTerm, setDraftSearchTerm] = useState('');
  const [draftObjective, setDraftObjective] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const reportingQuery = useMetaAdsReporting({ accountId, dateFrom, dateTo });

  const rows = useMemo(() => reportingQuery.data?.rows ?? [], [reportingQuery.data?.rows]);
  const accounts = useMemo(() => reportingQuery.data?.accounts ?? [], [reportingQuery.data?.accounts]);

  const objectiveOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.objective).filter((value): value is string => Boolean(value))))
      .sort((left, right) => left.localeCompare(right, 'es'));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (objective && row.objective !== objective) return false;
      return matchesSearch(row, searchTerm);
    });
  }, [objective, rows, searchTerm]);

  const isFiltersDirty = accountId !== draftAccountId
    || dateFrom !== draftDateFrom
    || dateTo !== draftDateTo
    || searchTerm !== draftSearchTerm
    || objective !== draftObjective;

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, pageSize, safeCurrentPage]);

  if (reportingQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mr-3"></div>
        Cargando data de Meta Ads...
      </div>
    );
  }

  if (reportingQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 space-y-4">
        <Activity size={48} />
        <p className="text-lg font-medium">Error al cargar Meta Ads</p>
        <p className="text-sm text-red-400 max-w-xl text-center">
          {reportingQuery.error instanceof Error ? reportingQuery.error.message : 'Error desconocido'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MetaAdsPageHero
        title="Meta Ads Data"
        description="Explorador detallado del reporting diario a nivel anuncios."
        badge="Data explorer"
        icon={<Database className="text-red-600" size={24} />}
      />

      <MetaAdsFiltersPanel
        accounts={accounts}
        appliedAccountId={accountId}
        appliedDateFrom={dateFrom}
        appliedDateTo={dateTo}
        draftAccountId={draftAccountId}
        draftDateFrom={draftDateFrom}
        draftDateTo={draftDateTo}
        onDraftAccountIdChange={setDraftAccountId}
        onDraftDateFromChange={setDraftDateFrom}
        onDraftDateToChange={setDraftDateTo}
        onApply={() => {
          setAccountId(draftAccountId);
          setDateFrom(draftDateFrom);
          setDateTo(draftDateTo);
          setSearchTerm(draftSearchTerm);
          setObjective(draftObjective);
          setCurrentPage(1);
        }}
        onClear={() => {
          setAccountId('');
          setDateFrom('');
          setDateTo('');
          setDraftAccountId('');
          setDraftDateFrom('');
          setDraftDateTo('');
          setSearchTerm('');
          setObjective('');
          setDraftSearchTerm('');
          setDraftObjective('');
          setCurrentPage(1);
        }}
        isApplyDisabled={!isFiltersDirty}
        extra={(
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.85fr)_minmax(0,0.75fr)]">
            <label className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.9)]">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Buscar entidades</span>
              <div className="mt-2 inline-flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                <Search size={15} className="text-gray-400" />
                <input
                  value={draftSearchTerm}
                  onChange={(event) => setDraftSearchTerm(event.target.value)}
                  placeholder="Campaña, ad set, ad, creative o ID"
                  className="w-full bg-transparent text-sm text-gray-800 outline-none"
                />
              </div>
            </label>

            <label className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.9)]">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Objetivo</span>
              <select
                value={draftObjective}
                onChange={(event) => setDraftObjective(event.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              >
                <option value="">Todos los objetivos</option>
                {objectiveOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      />

      <Section title="Resumen de la tabla">
        <KpiGrid>
          <KpiCard title="Filas filtradas" value={formatNumberEs(filteredRows.length)} helper="Resultado después de filtros locales" />
          <KpiCard title="Página actual" value={`${safeCurrentPage}/${totalPages}`} helper={`${formatNumberEs(pageSize)} filas por página`} />
          <KpiCard title="Campañas visibles" value={formatNumberEs(new Set(filteredRows.map((row) => row.campaign_business_id).filter(Boolean)).size)} helper="Campañas únicas filtradas" />
          <KpiCard title="Ads visibles" value={formatNumberEs(new Set(filteredRows.map((row) => row.ad_business_id).filter(Boolean)).size)} helper="Ads únicos filtrados" />
        </KpiGrid>
      </Section>

      <Section title="Detalle diario a nivel ad">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-[0_20px_42px_-34px_rgba(15,23,42,0.9)] overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-gray-200 bg-gray-50/70">
            <div>
              <p className="text-sm font-semibold text-gray-900">Ads reportados</p>
              <p className="text-xs text-gray-500">Cuenta, campaña, ad set, ad, creative y métricas validadas desde Supabase.</p>
            </div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {formatNumberEs(filteredRows.length)} fila(s)
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">
              No hay datos para los filtros actuales.
            </div>
          ) : (
            <>
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
                    {paginatedRows.map((row) => (
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

              <div className="px-4 py-3 border-t border-gray-200 bg-white flex items-center justify-between gap-4 flex-wrap">
                <div className="inline-flex items-center gap-2 text-sm text-gray-600">
                  <span>Filas por página:</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1 rounded-lg border border-gray-300 bg-white text-sm"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                <div className="inline-flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, Math.min(prev, totalPages) - 1))}
                    disabled={safeCurrentPage === 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={15} />
                    Anterior
                  </button>
                  <span className="text-sm text-gray-600 px-2">
                    Página {safeCurrentPage} de {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))}
                    disabled={safeCurrentPage === totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
