import type { ReactNode } from 'react';
import { Activity, Clock3, Database, RefreshCw } from 'lucide-react';
import { formatCurrencyPen, formatNumberEs } from '../../../lib/tableHelpers';
import type { MetaAdAccountOption, MetaSyncRunRow } from './types';
import { formatDateTime, formatDateRangeLabel, formatDurationMs, formatSyncResourceSummary } from './metaAdsUtils';

export function MetaAdsPageHero({
  title,
  description,
  badge,
  icon,
}: {
  title: string;
  description: string;
  badge: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white/90 px-6 py-5 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 inline-flex items-center gap-2">
            {icon}
            {title}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
        <div className="hidden md:inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
          <Activity size={14} />
          {badge}
        </div>
      </div>
    </div>
  );
}

export function MetaAdsFiltersPanel({
  accounts,
  accountId,
  dateFrom,
  dateTo,
  onAccountIdChange,
  onDateFromChange,
  onDateToChange,
  onClear,
  extra,
}: {
  accounts: MetaAdAccountOption[];
  accountId: string;
  dateFrom: string;
  dateTo: string;
  onAccountIdChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClear: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filtros</p>
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3 items-end">
        <label className="text-sm text-gray-600">
          Cuenta publicitaria
          <select
            value={accountId}
            onChange={(event) => onAccountIdChange(event.target.value)}
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
            onChange={(event) => onDateFromChange(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="text-sm text-gray-600">
          Fecha fin
          <input
            type="date"
            value={dateTo}
            onChange={(event) => onDateToChange(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="text-sm text-gray-500">
            Periodo: <span className="font-semibold text-gray-800">{formatDateRangeLabel(dateFrom, dateTo)}</span>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-red-600 hover:text-red-700"
          >
            Limpiar
          </button>
        </div>
      </div>
      {extra}
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
