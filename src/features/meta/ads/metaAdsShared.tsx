import type { ReactNode } from 'react';
import { Activity, Clock3, Database, Filter, RefreshCw } from 'lucide-react';
import { DateRangePicker } from '../../../components/DateRangePicker';
import { isDateRangeValid } from '../../../lib/dateRange';
import { formatCurrencyPen, formatNumberEs } from '../../../lib/tableHelpers';
import type { MetaSyncRunRow } from './types';
import { formatDateTime, formatDurationMs, formatSyncResourceSummary } from './metaAdsUtils';

export function MetaAdsPageHero({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white/90 px-6 py-5 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 uppercase tracking-[0.10em] inline-flex items-center gap-2">
            {icon}
            {title}
          </h1>
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-[0.10em] mt-1 italic">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function MetaAdsFiltersPanel({
  draftDateFrom,
  draftDateTo,
  onDraftDateFromChange,
  onDraftDateToChange,
  onApply,
  onClear,
  isApplyDisabled,
  extra,
}: {
  draftDateFrom: string;
  draftDateTo: string;
  onDraftDateFromChange: (value: string) => void;
  onDraftDateToChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
  isApplyDisabled?: boolean;
  extra?: ReactNode;
}) {
  const hasExtra = Boolean(extra);
  const hasValidDateRange = isDateRangeValid(draftDateFrom, draftDateTo);

  return (
    <div className="rounded-[28px] border border-gray-200 bg-white/95 p-5 shadow-[0_24px_52px_-38px_rgba(15,23,42,0.95)] backdrop-blur-sm space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-[0.22em]">
            <Filter size={14} />
            Filtros
          </p>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${hasExtra ? 'xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,2fr)_auto]' : 'xl:grid-cols-[minmax(0,2fr)_auto]'}`}>

        {extra}

        <DateRangePicker
          startDate={draftDateFrom}
          endDate={draftDateTo}
          onStartDateChange={onDraftDateFromChange}
          onEndDateChange={onDraftDateToChange}
          className="xl:col-span-1"
          layoutClassName="grid-cols-1 gap-4 md:grid-cols-2"
        />

        <div className="flex min-w-[220px] items-end justify-start gap-2 xl:justify-end">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-[42px] items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={isApplyDisabled || !hasValidDateRange}
            className="inline-flex h-[42px] items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-[0_18px_32px_-18px_rgba(220,38,38,0.95)] transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300 disabled:shadow-none"
          >
            Aplicar filtros
          </button>
        </div>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-extrabold tracking-wide text-gray-700 uppercase">{title}</h2>
      {children}
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">{children}</div>;
}

export function KpiCard({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string;
  helper?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-[0_20px_42px_-34px_rgba(15,23,42,0.9)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {helper ? <p className="text-xs text-gray-500 mt-2">{helper}</p> : null}
        </div>
        {icon ? (
          <div className="h-10 w-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ChartCard({ title, children, icon }: { title: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)] space-y-4">
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

export function InsightBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'positive' | 'warning' | 'neutral';
}) {
  const toneClassName = tone === 'positive'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-gray-200 bg-gray-100 text-gray-600';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClassName}`}>
      {label}
    </span>
  );
}

export function SyncStatusCard({ latestSyncRun }: { latestSyncRun: MetaSyncRunRow | null }) {
  if (!latestSyncRun) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-4 text-sm text-gray-500">
        Aún no hay corridas registradas en <code>meta_sync_runs</code>.
      </div>
    );
  }

  const accountLabel = latestSyncRun.account_business_id || 'Todas las cuentas';
  const totals = latestSyncRun.totals;
  const resources = latestSyncRun.resources;
  const tone = latestSyncRun.success === false
    ? 'border-red-200 bg-red-50/60 text-red-900'
    : 'border-emerald-200 bg-emerald-50/60 text-emerald-900';

  return (
    <div className={`rounded-2xl border px-5 py-4 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)] ${tone}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <RefreshCw size={14} />
            Último sync
          </div>
          <p className="mt-2 text-lg font-bold">
            {latestSyncRun.success === false ? 'Falló' : 'Completado'} · {accountLabel}
          </p>
          <p className="mt-1 text-sm opacity-80">
            Inicio: {formatDateTime(latestSyncRun.started_at)} · Duración: {formatDurationMs(latestSyncRun.duration_ms)}
          </p>
          {latestSyncRun.error_message ? (
            <p className="mt-2 text-sm font-medium">Error: {latestSyncRun.error_message}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-[280px]">
          <SyncMetric label="Registros traídos" value={formatNumberEs(totals?.pulled ?? 0)} icon={<Database size={14} />} />
          <SyncMetric label="Upsertados" value={formatNumberEs(totals?.upserted ?? 0)} icon={<Activity size={14} />} />
          <SyncMetric label="Finalizó" value={formatDateTime(latestSyncRun.finished_at)} icon={<Clock3 size={14} />} />
        </div>
      </div>

      {resources ? (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 text-sm">
          {Object.entries(resources).map(([resourceName, summary]) => (
            <div key={resourceName} className="rounded-xl border border-black/5 bg-white/70 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{resourceName}</p>
              <p className="mt-1 font-semibold text-gray-900">{formatSyncResourceSummary(summary)}</p>
              <p className="mt-1 text-xs text-gray-500">Páginas: {formatNumberEs(summary.pages_fetched ?? 0)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SyncMetric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white/70 px-3 py-2">
      <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-base font-bold text-gray-900">{value}</p>
    </div>
  );
}

export function LeaderboardList({
  items,
  emptyMessage,
}: {
  items: Array<{ id: string; title: string; subtitle: string; spend: number; clicks: number; ctr: number }>;
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">{emptyMessage}</div>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{item.title}</p>
            <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-semibold text-gray-900">{formatCurrencyPen(item.spend)}</p>
            <p className="text-xs text-gray-500">{formatNumberEs(item.clicks)} clicks · {item.ctr.toFixed(2)}%</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
