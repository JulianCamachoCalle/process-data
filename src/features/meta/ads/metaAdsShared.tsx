import type { ReactNode } from 'react';
import { Activity, CalendarRange, CheckCircle2, Clock3, Database, Filter, RefreshCw, Sparkles } from 'lucide-react';
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
  appliedAccountId,
  appliedDateFrom,
  appliedDateTo,
  draftAccountId,
  draftDateFrom,
  draftDateTo,
  onDraftAccountIdChange,
  onDraftDateFromChange,
  onDraftDateToChange,
  onApply,
  onClear,
  isApplyDisabled,
  extra,
}: {
  accounts: MetaAdAccountOption[];
  appliedAccountId: string;
  appliedDateFrom: string;
  appliedDateTo: string;
  draftAccountId: string;
  draftDateFrom: string;
  draftDateTo: string;
  onDraftAccountIdChange: (value: string) => void;
  onDraftDateFromChange: (value: string) => void;
  onDraftDateToChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
  isApplyDisabled?: boolean;
  extra?: ReactNode;
}) {
  const hasAppliedFilters = Boolean(appliedAccountId || appliedDateFrom || appliedDateTo);

  return (
    <div className="rounded-[28px] border border-gray-200 bg-white/95 p-5 shadow-[0_24px_52px_-38px_rgba(15,23,42,0.95)] backdrop-blur-sm space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-[0.22em]">
            <Filter size={14} />
            Filtros
          </p>
          <h2 className="mt-2 text-lg font-bold text-gray-900">Definí el rango antes de consultar</h2>
          <p className="mt-1 text-sm text-gray-500">
            Los cambios quedan en borrador hasta que presionás <span className="font-semibold text-gray-700">Aplicar filtros</span>.
          </p>
        </div>

        <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-orange-50 px-4 py-3 text-sm shadow-sm">
          <p className="inline-flex items-center gap-2 font-semibold text-red-700">
            <Sparkles size={15} />
            Periodo aplicado
          </p>
          <p className="mt-2 text-sm font-medium text-gray-800">{formatDateRangeLabel(appliedDateFrom, appliedDateTo)}</p>
          <p className="mt-1 text-xs text-gray-500">{hasAppliedFilters ? 'Filtro activo listo para reporting.' : 'Sin filtros remotos activos.'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,0.8fr))]">
        <label className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm text-gray-600 shadow-inner shadow-white/50">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cuenta publicitaria</span>
          <select
            value={draftAccountId}
            onChange={(event) => onDraftAccountIdChange(event.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
          >
            <option value="">Todas las cuentas</option>
            {accounts.map((account) => (
              <option key={account.business_id} value={account.business_id}>
                {account.name || account.business_id}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm text-gray-600 shadow-inner shadow-white/50">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fecha inicio</span>
          <input
            type="date"
            value={draftDateFrom}
            onChange={(event) => onDraftDateFromChange(event.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
          />
        </label>

        <label className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm text-gray-600 shadow-inner shadow-white/50">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fecha fin</span>
          <input
            type="date"
            value={draftDateTo}
            onChange={(event) => onDraftDateToChange(event.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
          />
        </label>

        <div className="rounded-2xl border border-gray-200 bg-slate-900 px-4 py-3 text-white shadow-[0_18px_40px_-32px_rgba(15,23,42,1)]">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            <CalendarRange size={14} />
            Vista aplicada
          </div>
          <div className="mt-3 space-y-1">
            <p className="text-sm font-semibold">{formatDateRangeLabel(appliedDateFrom, appliedDateTo)}</p>
            <p className="text-xs text-slate-300">Cuenta: {appliedAccountId || 'Todas las cuentas'}</p>
          </div>
        </div>
      </div>

      {extra}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 font-medium">
            <CheckCircle2 size={13} className="text-emerald-500" />
            Rango aplicado: {formatDateRangeLabel(appliedDateFrom, appliedDateTo)}
          </span>
          {appliedAccountId ? (
            <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 font-medium text-red-700">
              Cuenta {appliedAccountId}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={isApplyDisabled}
            className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_32px_-18px_rgba(220,38,38,0.95)] transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300 disabled:shadow-none"
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
