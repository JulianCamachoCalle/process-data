import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getKommoColumnLabel, getKommoResource, KOMMO_RESOURCES, type KommoResourceKey } from './kommoResourceConfig';

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

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/* ── Win2K chrome primitives ─────────────────────────────────── */

const win2kPanel =
  'bg-[#d4d0c8] border-2 border-[#ffffff] border-r-[#808080] border-b-[#808080]';

const win2kSunken =
  'bg-white border border-[#808080] border-r-[#ffffff] border-b-[#ffffff]';

const win2kButton =
  'bg-[#d4d0c8] border border-[#ffffff] border-r-[#404040] border-b-[#404040] px-4 py-0.5 text-[11px] font-[Tahoma,_"MS_Sans_Serif",_Arial,_sans-serif] text-black active:border-[#404040] active:border-r-[#ffffff] active:border-b-[#ffffff] cursor-default select-none hover:bg-[#e8e4dc]';

const win2kTitleBar =
  'bg-gradient-to-r from-[#0a246a] to-[#a6caf0] flex items-center gap-1.5 px-2 py-1';

/* ── Detail Modal ─────────────────────────────────────────────── */
function DetailModal({
  open,
  label,
  onClose,
  isLoading,
  error,
  data,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  isLoading: boolean;
  error?: string;
  data: unknown;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      {/* Window */}
      <div
        className="w-full max-w-3xl max-h-[88vh] flex flex-col shadow-[2px_2px_0_#000]"
        style={{ background: '#d4d0c8', border: '2px solid #ffffff', borderRight: '2px solid #808080', borderBottom: '2px solid #808080' }}
      >
        {/* Title bar */}
        <div className={win2kTitleBar}>
          {/* tiny icon */}
          <div className="w-3.5 h-3.5 bg-[#c0c0c0] border border-[#808080] flex items-center justify-center flex-shrink-0">
            <div className="w-2 h-1.5 bg-[#0a246a]" />
          </div>
          <span className="text-white text-[11px] font-bold flex-1 truncate font-[Tahoma,_'MS_Sans_Serif',_Arial,_sans-serif]">
            {label} — Detalle
          </span>
          {/* Close button */}
          <button
            onClick={onClose}
            className="w-[17px] h-[14px] bg-[#d4d0c8] border border-[#ffffff] border-r-[#404040] border-b-[#404040] flex items-center justify-center text-[9px] font-bold text-black hover:bg-[#e04040] hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Menu-bar stub */}
        <div className="px-1 py-0.5 bg-[#d4d0c8] border-b border-[#a0a0a0]">
          <span className="text-[11px] px-1 cursor-default font-[Tahoma,_'MS_Sans_Serif',_Arial,_sans-serif]">
            <u>A</u>rchivo&nbsp;&nbsp;<u>E</u>ditar&nbsp;&nbsp;A<u>y</u>uda
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-3">
          {isLoading ? (
            <p className="text-[11px] font-[Tahoma,_'MS_Sans_Serif',_Arial,_sans-serif]">Cargando detalle…</p>
          ) : error ? (
            <p className="text-[11px] text-red-700 font-[Tahoma,_'MS_Sans_Serif',_Arial,_sans-serif]">{error}</p>
          ) : (
            <div
              className="w-full h-full overflow-auto p-2 text-[11px] leading-relaxed"
              style={{
                background: '#ffffff',
                border: '1px solid #808080',
                borderRight: '1px solid #ffffff',
                borderBottom: '1px solid #ffffff',
                fontFamily: 'Courier New, monospace',
              }}
            >
              <pre className="whitespace-pre-wrap break-all">{safeJson(data)}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 flex justify-end border-t border-[#a0a0a0]">
          <button onClick={onClose} className={win2kButton}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Explorer ────────────────────────────────────────────── */
export function KommoExplorer() {
  const params = useParams<{ resource?: string }>();
  const resourceFromUrl = getKommoResource(params.resource);
  const resource = (resourceFromUrl?.key ?? 'leads') as KommoResourceKey;
  return <KommoExplorerView key={resource} resource={resource} />;
}

function KommoExplorerView({ resource }: { resource: KommoResourceKey }) {
  const navigate = useNavigate();
  const uiConfig = useMemo(() => getKommoResource(resource) ?? KOMMO_RESOURCES[0], [resource]);

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
      const response = await fetch(`/api/sheet?${params.toString()}`, { method: 'GET', credentials: 'include' });
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok) return { success: false, error: payload.error || 'Error consultando datos' };
      return payload;
    },
  });

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = listQuery.data?.rows ?? [];
  const columns = listQuery.data?.columns ?? [];

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
      const response = await fetch(`/api/sheet?${params.toString()}`, { method: 'GET', credentials: 'include' });
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok) return { success: false, error: payload.error || 'Error consultando detalle' };
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

  const win2kFont = { fontFamily: "Tahoma, 'MS Sans Serif', Arial, sans-serif" };

  return (
    <>
      {/* Outer window chrome */}
      <div
        className="flex flex-col shadow-[2px_2px_0_#000]"
        style={{
          background: '#d4d0c8',
          border: '2px solid #ffffff',
          borderRight: '2px solid #404040',
          borderBottom: '2px solid #404040',
          ...win2kFont,
        }}
      >
        {/* Title bar */}
        <div className={win2kTitleBar}>
          <div className="w-3.5 h-3.5 bg-[#c0c0c0] border border-[#808080] flex items-center justify-center flex-shrink-0">
            <div className="w-2 h-1.5 bg-[#0a246a]" />
          </div>
          <span className="text-white text-[11px] font-bold flex-1" style={win2kFont}>
            Kommo Data Explorer — {uiConfig.label}
          </span>
          {/* Window controls */}
          <div className="flex gap-0.5">
            {['_', '□', '✕'].map((ch, i) => (
              <div
                key={ch}
                className="w-[17px] h-[14px] bg-[#d4d0c8] border border-[#ffffff] border-r-[#404040] border-b-[#404040] flex items-center justify-center text-[9px] font-bold text-black cursor-default"
                style={i === 2 ? { background: '#c0c0c0' } : {}}
              >
                {ch}
              </div>
            ))}
          </div>
        </div>

        {/* Menu bar */}
        <div className="px-1 border-b border-[#a0a0a0] bg-[#d4d0c8]">
          <div className="flex text-[11px]" style={win2kFont}>
            {['Archivo', 'Ver', 'Herramientas', 'Ayuda'].map((m) => (
              <span key={m} className="px-2 py-0.5 cursor-default hover:bg-[#0a246a] hover:text-white">
                {m}
              </span>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-2 py-1.5 flex-wrap border-b border-[#a0a0a0]"
          style={{ background: '#d4d0c8' }}
        >
          {/* Resource selector */}
          <div className="flex items-center gap-1">
            <label className="text-[11px]" style={win2kFont}>
              Recurso:
            </label>
            <select
              value={resource}
              onChange={(e) => {
                const next = e.target.value as KommoResourceKey;
                navigate(next === 'leads' ? '/kommo' : `/kommo/${next}`);
              }}
              className="text-[11px] px-1 py-0.5 h-[22px] cursor-default"
              style={{
                background: '#ffffff',
                border: '1px solid #808080',
                borderRight: '1px solid #ffffff',
                borderBottom: '1px solid #ffffff',
                ...win2kFont,
              }}
              aria-label="Seleccionar recurso"
            >
              {KOMMO_RESOURCES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Separator */}
          <div className="w-px h-5 bg-[#808080] mx-1" />

          {/* Search */}
          <div className="flex items-center gap-1">
            <label className="text-[11px]" style={win2kFont}>
              Buscar:
            </label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Escriba para buscar..."
              className="text-[11px] px-1 py-0.5 h-[22px] w-44"
              style={{
                background: '#ffffff',
                border: '1px solid #808080',
                borderRight: '1px solid #ffffff',
                borderBottom: '1px solid #ffffff',
                outline: 'none',
                ...win2kFont,
              }}
            />
          </div>

          {/* Separator */}
          <div className="w-px h-5 bg-[#808080] mx-1" />

          {/* Sort */}
          <div className="flex items-center gap-1">
            <label className="text-[11px]" style={win2kFont}>
              Ordenar:
            </label>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="text-[11px] px-1 py-0.5 h-[22px] cursor-default"
              style={{
                background: '#ffffff',
                border: '1px solid #808080',
                borderRight: '1px solid #ffffff',
                borderBottom: '1px solid #ffffff',
                ...win2kFont,
              }}
              aria-label="Ordenar por"
            >
              {uiConfig.sortColumns.map((col) => (
                <option key={col} value={col}>
                  {getKommoColumnLabel(resource, col)}
                </option>
              ))}
            </select>
            <button
              onClick={() => setOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className={win2kButton}
              title="Cambiar dirección de orden"
            >
              {order === 'desc' ? '▼ DESC' : '▲ ASC'}
            </button>
          </div>

          {/* Status indicator */}
          <div className="ml-auto text-[11px] text-gray-600" style={win2kFont}>
            {listQuery.isFetching ? 'Actualizando…' : `${total.toLocaleString('es-PE')} registros`}
          </div>
        </div>

        {/* Table area — sunken panel */}
        <div
          className="overflow-x-auto"
          style={{
            margin: '4px',
            border: '2px solid #808080',
            borderRight: '2px solid #ffffff',
            borderBottom: '2px solid #ffffff',
            background: '#ffffff',
          }}
        >
          <table className="min-w-full border-collapse" style={{ ...win2kFont, fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#d4d0c8' }}>
                <th
                  className="px-3 py-1 text-left whitespace-nowrap text-[11px] font-bold cursor-default select-none"
                  style={{
                    borderRight: '1px solid #808080',
                    borderBottom: '1px solid #808080',
                    ...win2kFont,
                  }}
                >
                  Acciones
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-1 text-left whitespace-nowrap text-[11px] font-bold cursor-default select-none"
                    style={{
                      borderRight: '1px solid #808080',
                      borderBottom: '1px solid #808080',
                      ...win2kFont,
                    }}
                  >
                    {getKommoColumnLabel(resource, col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-6 text-center text-[11px]"
                    style={win2kFont}
                  >
                    Cargando…
                  </td>
                </tr>
              ) : listQuery.data?.success === false ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-6 text-center text-[11px] text-red-700"
                    style={win2kFont}
                  >
                    {listQuery.data.error || 'Error consultando datos'}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-6 text-center text-[11px]"
                    style={win2kFont}
                  >
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
                  const isEven = idx % 2 === 0;
                  return (
                    <tr
                      key={rowKey}
                      style={{ background: isEven ? '#ffffff' : '#f0f4ff' }}
                      className="hover:bg-[#0a246a] hover:text-white group"
                    >
                      <td
                        className="px-3 py-1 whitespace-nowrap"
                        style={{ borderRight: '1px solid #d0ccc4', ...win2kFont }}
                      >
                        <button
                          onClick={() => openDetail(row)}
                          className="text-[11px] px-3 py-0.5 cursor-default"
                          style={{
                            background: '#d4d0c8',
                            border: '1px solid #ffffff',
                            borderRight: '1px solid #404040',
                            borderBottom: '1px solid #404040',
                            ...win2kFont,
                          }}
                        >
                          Ver...
                        </button>
                      </td>
                      {columns.map((col) => {
                        const value = row[col];
                        const rendered = formatCellValue(value);
                        return (
                          <td
                            key={`${rowKey}-${col}`}
                            className="px-3 py-1 whitespace-nowrap max-w-[320px]"
                            style={{ borderRight: '1px solid #d0ccc4', ...win2kFont, fontSize: '11px' }}
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

        {/* Status bar */}
        <div
          className="flex items-center justify-between px-2 py-1 gap-4 flex-wrap"
          style={{ borderTop: '1px solid #a0a0a0', background: '#d4d0c8' }}
        >
          {/* Rows per page */}
          <div className="flex items-center gap-2">
            <span className="text-[11px]" style={win2kFont}>
              Filas:
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="text-[11px] h-[20px] px-1 cursor-default"
              style={{
                background: '#ffffff',
                border: '1px solid #808080',
                borderRight: '1px solid #ffffff',
                borderBottom: '1px solid #ffffff',
                ...win2kFont,
              }}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Pagination */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, Math.min(prev, totalPages) - 1))}
              disabled={safePage === 1}
              className={win2kButton}
              style={{ opacity: safePage === 1 ? 0.5 : 1 }}
            >
              {'◄ Anterior'}
            </button>
            <span
              className="text-[11px] px-2"
              style={{
                ...win2kFont,
                border: '1px solid #808080',
                borderRight: '1px solid #ffffff',
                borderBottom: '1px solid #ffffff',
                background: '#ffffff',
                padding: '1px 8px',
              }}
            >
              Pág. {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))}
              disabled={safePage >= totalPages}
              className={win2kButton}
              style={{ opacity: safePage >= totalPages ? 0.5 : 1 }}
            >
              {'Siguiente ►'}
            </button>
          </div>

          {/* Status area */}
          <div
            className="text-[11px] px-2 py-0.5"
            style={{
              ...win2kFont,
              border: '1px solid #808080',
              borderRight: '1px solid #ffffff',
              borderBottom: '1px solid #ffffff',
              background: '#d4d0c8',
              minWidth: 120,
            }}
          >
            {listQuery.isFetching ? '⏳ Cargando...' : `✔ ${total.toLocaleString('es-PE')} registros`}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <DetailModal
        open={detailOpen}
        label={uiConfig.label}
        onClose={() => {
          setDetailOpen(false);
          setDetailId(null);
        }}
        isLoading={detailQuery.isLoading}
        error={
          detailQuery.data?.success === false
            ? detailQuery.data.error || 'Error consultando detalle'
            : undefined
        }
        data={detailQuery.data?.rows?.[0] ?? null}
      />
    </>
  );
}
