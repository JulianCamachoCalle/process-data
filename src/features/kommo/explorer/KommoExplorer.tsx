import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Search,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Eye,
  LayoutGrid,
  X,
} from 'lucide-react';
import {
  getGroupedKommoResources,
  getKommoColumnLabel,
  getKommoResource,
  KOMMO_RESOURCES,
  type KommoResourceKey,
} from '../config/kommoResourceConfig';

type ApiResponse = {
  success: boolean;
  error?: string;
  resource?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  rows?: Array<Record<string, unknown>>;
  columns?: string[];
};

function isLikelyTimestamp(value: string | number) {
  if (typeof value === 'number') {
    return value > 1_000_000_000 && value < 9_999_999_999_999;
  }

  if (typeof value === 'string') {
    if (/^\d{10,13}$/.test(value)) return true;
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return true;
  }

  return false;
}

function toLocaleDateTime(value: string | number) {
  if (typeof value === 'number') {
    const ms = value > 9_999_999_999 ? value : value * 1000;
    return new Date(ms).toLocaleString('es-PE');
  }

  if (/^\d{10,13}$/.test(value)) {
    const asNumber = Number(value);
    const ms = value.length === 13 ? asNumber : asNumber * 1000;
    return new Date(ms).toLocaleString('es-PE');
  }

  return new Date(value).toLocaleString('es-PE');
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';

  if (typeof value === 'boolean') return value ? 'Sí' : 'No';

  if (typeof value === 'number') {
    if (isLikelyTimestamp(value)) return toLocaleDateTime(value);
    return new Intl.NumberFormat('es-PE').format(value);
  }

  if (typeof value === 'string') {
    if (isLikelyTimestamp(value)) {
      const formatted = toLocaleDateTime(value);
      return Number.isNaN(new Date(value).getTime()) && !/^\d{10,13}$/.test(value) ? value : formatted;
    }
    return value;
  }

  if (Array.isArray(value)) return `${value.length} ítem(s)`;
  if (typeof value === 'object') return 'Objeto';
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOrderedKeys(detail: Record<string, unknown>, preferredKeys: string[]) {
  const preferred = Array.from(new Set(preferredKeys)).filter((key) => key in detail);
  const preferredSet = new Set(preferred);
  const remaining = Object.keys(detail)
    .filter((key) => !preferredSet.has(key))
    .sort((a, b) => a.localeCompare(b, 'es'));

  return [...preferred, ...remaining];
}

function renderPrimitiveValue(value: unknown) {
  const rendered = formatCellValue(value);
  return typeof rendered === 'string' ? rendered : String(rendered);
}

function DetailValueContent({
  resource,
  value,
  depth = 0,
}: {
  resource: KommoResourceKey;
  value: unknown;
  depth?: number;
}) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-sm text-gray-400">-</span>;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-sm text-gray-800 break-words">{renderPrimitiveValue(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-sm text-gray-400">-</span>;
    }

    const allObjects = value.every((item) => isRecord(item));

    if (allObjects) {
      return (
        <div className="space-y-2">
          {value.map((item, index) => {
            const itemObj = item as Record<string, unknown>;
            const itemKeys = Object.keys(itemObj).sort((a, b) => a.localeCompare(b, 'es'));

            return (
              <div key={`obj-item-${index}`} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="px-3 py-2 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Ítem {index + 1}
                </div>
                <div className="divide-y divide-gray-100">
                  {itemKeys.map((key) => (
                    <div key={`${index}-${key}`} className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-2 px-3 py-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {getKommoColumnLabel(resource, key)}
                      </span>
                      <DetailValueContent resource={resource} value={itemObj[key]} depth={depth + 1} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <ul className="list-disc list-inside space-y-1 text-sm text-gray-800">
        {value.map((item, index) => (
          <li key={`primitive-item-${index}`} className="break-words">
            {renderPrimitiveValue(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (isRecord(value)) {
    const nestedKeys = Object.keys(value).sort((a, b) => a.localeCompare(b, 'es'));

    return (
      <details className="rounded-2xl border border-gray-200 bg-gray-50" open={depth === 0}>
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
          Ver campos ({nestedKeys.length})
        </summary>
        <div className="border-t border-gray-200 divide-y divide-gray-100">
          {nestedKeys.map((key) => (
            <div key={key} className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-2 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {getKommoColumnLabel(resource, key)}
              </span>
              <DetailValueContent resource={resource} value={value[key]} depth={depth + 1} />
            </div>
          ))}
        </div>
      </details>
    );
  }

  return <span className="text-sm text-gray-800 break-words">{String(value)}</span>;
}

export function KommoExplorer() {
  const params = useParams<{ resource?: string }>();
  const resourceFromUrl = getKommoResource(params.resource);
  const resource = (resourceFromUrl?.key ?? 'leads') as KommoResourceKey;
  return <KommoExplorerView key={resource} resource={resource} />;
}

function KommoExplorerView({ resource }: { resource: KommoResourceKey }) {
  const PAGE_SIZE = 10;
  const navigate = useNavigate();
  const uiConfig = useMemo(() => getKommoResource(resource) ?? KOMMO_RESOURCES[0], [resource]);
  const groupedResources = useMemo(() => getGroupedKommoResources(), []);

  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(() => uiConfig.defaultSort);
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const listQuery = useQuery({
    queryKey: ['kommo-data', resource, page, PAGE_SIZE, sort, order, q],
    queryFn: async (): Promise<ApiResponse> => {
      const params = new URLSearchParams();
      params.set('name', 'KOMMO');
      params.set('resource', resource);
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      params.set('sort', sort);
      params.set('order', order);
      if (q) params.set('q', q);

      const response = await fetch(`/api/sheet?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });

      const payload = (await response.json()) as ApiResponse;
      if (!response.ok) {
        return { success: false, error: payload.error || 'Error consultando datos' };
      }
      return payload;
    },
  });

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = listQuery.data?.rows ?? [];
  const columns = listQuery.data?.columns ?? [];
  const detailPreferredKeys = columns.length > 0 ? columns : uiConfig.listColumns;

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['kommo-data-detail', resource, detailId],
    enabled: detailOpen && Boolean(detailId),
    queryFn: async (): Promise<ApiResponse> => {
      const params = new URLSearchParams();
      params.set('name', 'KOMMO');
      params.set('resource', resource);
      params.set('full', 'true');
      params.set('id', String(detailId ?? ''));

      const response = await fetch(`/api/sheet?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });

      const payload = (await response.json()) as ApiResponse;
      if (!response.ok) {
        return { success: false, error: payload.error || 'Error consultando detalle' };
      }
      return payload;
    },
  });

  const openDetail = (row: Record<string, unknown>) => {
    const key = uiConfig.primaryKey;
    const value = row[key];
    const idValue = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    if (!idValue) return;
    setDetailId(idValue);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_24px_50px_-36px_rgba(15,23,42,0.8)]">
        <div className="border-b border-gray-200 px-6 py-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-100 bg-red-50">
                <Database className="text-red-600" size={20} />
              </div>
              <div>
                <h1 className="text-xl font-extrabold uppercase tracking-[0.08em] text-gray-900">Kommo Explorer</h1>
                <p className="mt-1 text-sm text-gray-500">Exploración operativa de recursos Kommo con paginación server-side y detalle expandido.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5">
                <LayoutGrid size={13} className="text-red-600" />
                {uiConfig.label}
              </span>
              <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5">
                {listQuery.isFetching ? 'Actualizando…' : `Total ${total.toLocaleString('es-PE')}`}
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <label className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 lg:col-span-3">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Recurso</span>
              <select
                value={resource}
                onChange={(e) => {
                  const next = e.target.value as KommoResourceKey;
                  navigate(next === 'leads' ? '/kommo' : `/kommo/${next}`);
                }}
                className="ml-auto bg-transparent text-sm outline-none"
                aria-label="Seleccionar recurso"
              >
                {groupedResources.map((section) => (
                  <optgroup key={section.group} label={section.label}>
                    {section.resources.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 lg:col-span-4">
              <Search size={15} className="text-gray-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar (opcional)"
                className="w-full bg-transparent outline-none"
              />
            </label>

            <label className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 lg:col-span-3">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Ordenar</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className="ml-auto bg-transparent text-sm outline-none"
                aria-label="Ordenar por"
              >
                {uiConfig.sortColumns.map((col) => (
                  <option key={col} value={col}>
                    {getKommoColumnLabel(resource, col)}
                  </option>
                ))}
              </select>
            </label>

            <div className="lg:col-span-2 flex items-center gap-2">
              <button
                onClick={() => setOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                className="inline-flex w-full flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
              >
                {order === 'desc' ? <ArrowDownWideNarrow size={16} /> : <ArrowUpWideNarrow size={16} />}
                {order.toUpperCase()}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap w-36">
                  Acciones
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap"
                  >
                    {getKommoColumnLabel(resource, col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {listQuery.isLoading ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-6 py-10 text-center text-sm text-gray-500">
                    Cargando…
                  </td>
                </tr>
              ) : listQuery.data?.success === false ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-6 py-10 text-center text-sm text-red-700">
                    {listQuery.data.error || 'Error consultando datos'}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-6 py-10 text-center text-sm text-gray-500">
                    No hay resultados.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const primaryValue = row[uiConfig.primaryKey];
                  const rowKey =
                    typeof primaryValue === 'string' || typeof primaryValue === 'number'
                      ? String(primaryValue)
                      : `${resource}-${page}-${idx}`;

                  return (
                    <tr key={rowKey} className="transition-colors hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => openDetail(row)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                          title="Ver detalle"
                          aria-label="Ver detalle"
                        >
                          <Eye size={13} />
                        </button>
                      </td>
                      {columns.map((col) => {
                        const value = row[col];
                        const rendered = formatCellValue(value);
                        return (
                          <td
                            key={`${rowKey}-${col}`}
                            className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 max-w-[420px]"
                            title={typeof rendered === 'string' ? rendered : undefined}
                          >
                            <span className="block truncate">{rendered}</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 bg-white px-6 py-4">
          <div className="inline-flex items-center gap-2 text-sm text-gray-600">
            <span>Filas por página:</span>
            <span className="inline-flex items-center rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">10</span>
          </div>

          <div className="inline-flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, Math.min(prev, totalPages) - 1))}
              disabled={safePage === 1}
               className="inline-flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
             >
              <ChevronLeft size={15} />
              Anterior
            </button>
            <span className="text-sm text-gray-600 px-2">
              Página {safePage} de {totalPages}
            </span>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))}
              disabled={safePage >= totalPages}
               className="inline-flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
             >
              Siguiente
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_36px_80px_-38px_rgba(15,23,42,0.7)]">
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{uiConfig.label}</p>
                <h2 className="mt-1 text-lg font-bold text-gray-900">Detalle del registro</h2>
              </div>
              <button
                onClick={() => {
                  setDetailOpen(false);
                  setDetailId(null);
                }}
                className="rounded-xl p-2 transition-colors hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {detailQuery.isLoading ? (
                <div className="text-sm text-gray-500">Cargando detalle…</div>
              ) : detailQuery.data?.success === false ? (
                <div className="text-sm text-red-700">{detailQuery.data.error || 'Error consultando detalle'}</div>
              ) : (
                (() => {
                  const detail = detailQuery.data?.rows?.[0];

                  if (!isRecord(detail)) {
                    return (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                        -
                      </div>
                    );
                  }

                  const orderedKeys = getOrderedKeys(detail, detailPreferredKeys);

                  return (
                      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                      <div className="divide-y divide-gray-100">
                        {orderedKeys.map((key) => (
                          <div key={key} className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] gap-3 px-4 py-3">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {getKommoColumnLabel(resource, key)}
                            </span>
                            <DetailValueContent resource={resource} value={detail[key]} />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
