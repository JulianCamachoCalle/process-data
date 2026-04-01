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
              <div key={`obj-item-${index}`} className="rounded-lg border border-gray-200 bg-gray-50/70 overflow-hidden">
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
      <details className="rounded-lg border border-gray-200 bg-gray-50/80" open={depth === 0}>
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
  const navigate = useNavigate();
  const uiConfig = useMemo(() => getKommoResource(resource) ?? KOMMO_RESOURCES[0], [resource]);
  const groupedResources = useMemo(() => getGroupedKommoResources(), []);

  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(() => uiConfig.defaultSort);
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const listQuery = useQuery({
    queryKey: ['kommo-data', resource, page, pageSize, sort, order, q],
    queryFn: async (): Promise<ApiResponse> => {
      const params = new URLSearchParams();
      params.set('name', 'KOMMO');
      params.set('resource', resource);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
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
      <div className="rounded-2xl border border-gray-200 bg-white shadow-[0_24px_50px_-36px_rgba(15,23,42,0.8)] overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-red-600/10 border border-red-500/25 flex items-center justify-center">
                <Database className="text-red-600" size={20} />
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-900">Kommo Data Explorer</h1>
                <p className="text-xs text-gray-500">Exploración de recursos Kommo (paginación server-side)</p>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              {listQuery.isFetching ? 'Actualizando…' : `Total: ${total.toLocaleString('es-PE')}`}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3">
            <label className="lg:col-span-3 rounded-xl border border-gray-200 bg-white px-3 py-2 inline-flex items-center gap-2 text-sm text-gray-700">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recurso</span>
              <select
                value={resource}
                onChange={(e) => {
                  const next = e.target.value as KommoResourceKey;
                  navigate(next === 'leads' ? '/kommo' : `/kommo/${next}`);
                }}
                className="ml-auto bg-transparent outline-none text-sm"
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

            <label className="lg:col-span-4 rounded-xl border border-gray-200 bg-white px-3 py-2 inline-flex items-center gap-2 text-sm text-gray-600">
              <Search size={15} className="text-gray-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar (opcional)"
                className="w-full bg-transparent outline-none"
              />
            </label>

            <label className="lg:col-span-3 rounded-xl border border-gray-200 bg-white px-3 py-2 inline-flex items-center gap-2 text-sm text-gray-700">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ordenar</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className="ml-auto bg-transparent outline-none text-sm"
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
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold text-gray-700"
              >
                {order === 'desc' ? <ArrowDownWideNarrow size={16} /> : <ArrowUpWideNarrow size={16} />}
                {order.toUpperCase()}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/90">
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
                    <tr key={rowKey} className="hover:bg-red-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => openDetail(row)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors text-xs font-semibold"
                        >
                          <Eye size={13} />
                          Ver detalle
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

        <div className="px-6 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-4 flex-wrap">
          <div className="inline-flex items-center gap-2 text-sm text-gray-600">
            <span>Filas por página:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 rounded-lg border border-gray-300 bg-white text-sm"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>

          <div className="inline-flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, Math.min(prev, totalPages) - 1))}
              disabled={safePage === 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-[0.16em] font-semibold">{uiConfig.label}</p>
                <h2 className="font-semibold text-gray-900">Detalle</h2>
              </div>
              <button
                onClick={() => {
                  setDetailOpen(false);
                  setDetailId(null);
                }}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
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
                    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
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
