import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Clock3,
  FileText,
  Filter,
  Layers,
  PieChart as PieChartIcon,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type PipelineInsight = {
  pipeline_id: number | null;
  pipeline_name: string;
  total_leads: number;
};

type StatusInsight = {
  pipeline_id: number | null;
  pipeline_name: string;
  status_id: number | null;
  status_name: string;
  total_leads: number;
};

type StatusByNameInsight = {
  status_name: string;
  total_leads: number;
};

type HourlyIncomingInsight = {
  hour: number;
  total_incoming: number;
};

type OwnerInsight = {
  responsible_user_id: number | null;
  responsible_user_name: string;
  total_leads: number;
};

type CreatedPipelineSnapshotInsight = {
  group_key: string;
  pipeline_id: number | null;
  pipeline_name: string;
  total_leads: number;
  open_leads: number;
  closed_leads: number;
  lost_leads: number;
  avg_price: number | null;
};

type WonPipelineInsight = {
  pipeline_id: number | null;
  pipeline_name: string;
  total_won: number;
};

type WonSellerInsight = {
  seller_name: string;
  total_won: number;
};

type LeadsInsightsPayload = {
  success: boolean;
  error?: string;
  timezone?: string;
  filters: {
    start_date: string | null;
    end_date: string | null;
  };
  created: {
    summary: {
      total_leads: number;
      total_open: number;
      total_closed: number;
      total_lost: number;
      total_deleted: number;
      total_incoming: number;
      avg_price: number | null;
      top_pipeline: PipelineInsight | null;
      top_owner: OwnerInsight | null;
    };
    pipeline_volume: PipelineInsight[];
    owner_volume: OwnerInsight[];
    status_volume: StatusInsight[];
    status_volume_by_name: StatusByNameInsight[];
    pipeline_current_state: CreatedPipelineSnapshotInsight[];
    hourly_incoming: HourlyIncomingInsight[];
    insights: {
      busiest_hour: HourlyIncomingInsight | null;
      top_status: StatusInsight | null;
      orphan_pipeline_leads: number;
    };
  };
  won: {
    summary: {
      total_won: number;
      top_pipeline: WonPipelineInsight | null;
      top_seller: WonSellerInsight | null;
    };
    pipelines: WonPipelineInsight[];
    sellers: WonSellerInsight[];
  };
};

const COLORS = ['#dc2626', '#f97316', '#8b5cf6', '#0f766e', '#2563eb', '#7c3aed', '#475569', '#16a34a'];
const CHART_GRID = '#e2e8f0';
const CHART_AXIS = '#64748b';
const CHART_TOOLTIP_STYLE = {
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 20px 36px -28px rgba(15, 23, 42, 0.35)',
  backgroundColor: '#ffffff',
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-PE').format(value);
}

function formatCurrency(value: number | null) {
  if (value === null) return 'N/D';
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function getLimaDateFormatter() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function toLimaDateString(date: Date) {
  const parts = getLimaDateFormatter().formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function getCurrentLimaDate() {
  return toLimaDateString(new Date()) ?? '1970-01-01';
}

function shiftDate(dateString: string, days: number) {
  const [year, month, day] = dateString.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);

  return `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(2, '0')}-${String(utcDate.getUTCDate()).padStart(2, '0')}`;
}

function asChartNumber(value: unknown) {
  if (Array.isArray(value)) {
    return asChartNumber(value[0]);
  }

  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function truncateLabel(value: string, maxLength = 24) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function formatStatusLegendLabel(label: string) {
  const normalized = label.trim().toUpperCase();
  const mapped = {
    'LEADS NUEVOS A RESPONDER': 'Leads Nuevos',
    NEGOCIACION: 'Negociación',
    'CLOSED - LOST': 'Leads Perdidos',
    'CLOSED - WON': 'Leads Ganados',
    'ANUNCIO DE TRABAJO': 'Anuncio de Trabajo',
    REGISTRADOS: 'Registrados',
    SOPORTE: 'Soporte',
    COMENTARIOS: 'Comentarios',
  }[normalized] ?? label;

  return truncateLabel(mapped, 28);
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderHorizontalBarChartSvg(
  items: Array<{ label: string; value: number; color?: string }>,
  options?: { width?: number; rowHeight?: number; valueFormatter?: (value: number) => string },
) {
  if (items.length === 0) {
    return '<p class="export-empty">Sin datos disponibles.</p>';
  }

  const width = options?.width ?? 720;
  const rowHeight = options?.rowHeight ?? 32;
  const leftPadding = 220;
  const rightPadding = 80;
  const topPadding = 24;
  const bottomPadding = 16;
  const height = topPadding + bottomPadding + items.length * rowHeight;
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const barWidth = width - leftPadding - rightPadding;
  const valueFormatter = options?.valueFormatter ?? ((value: number) => formatNumber(value));

  const rows = items.map((item, index) => {
    const y = topPadding + index * rowHeight;
    const barLength = Math.max(8, (item.value / maxValue) * barWidth);
    const label = escapeHtml(truncateLabel(item.label, 30));
    const value = escapeHtml(valueFormatter(item.value));
    const color = item.color ?? COLORS[index % COLORS.length] ?? '#dc2626';

    return `
      <text x="8" y="${y + 14}" font-size="12" fill="#334155">${label}</text>
      <rect x="${leftPadding}" y="${y}" width="${barWidth}" height="14" rx="7" fill="#e2e8f0" />
      <rect x="${leftPadding}" y="${y}" width="${barLength}" height="14" rx="7" fill="${color}" />
      <text x="${leftPadding + barWidth + 8}" y="${y + 12}" font-size="12" fill="#0f172a">${value}</text>
    `;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de barras" class="export-chart-svg">
      ${rows}
    </svg>
  `;
}

function renderLineChartSvg(items: HourlyIncomingInsight[]) {
  if (items.length === 0) {
    return '<p class="export-empty">Sin datos disponibles.</p>';
  }

  const width = 720;
  const height = 260;
  const paddingX = 48;
  const paddingY = 28;
  const maxValue = Math.max(...items.map((item) => item.total_incoming), 1);
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const stepX = items.length > 1 ? usableWidth / (items.length - 1) : 0;

  const points = items.map((item, index) => {
    const x = paddingX + stepX * index;
    const y = height - paddingY - (item.total_incoming / maxValue) * usableHeight;
    return { x, y, item };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
  const labels = points.map((point) => `
    <circle cx="${point.x}" cy="${point.y}" r="3.5" fill="#dc2626" />
    <text x="${point.x}" y="${height - 8}" text-anchor="middle" font-size="11" fill="#475569">${escapeHtml(formatHour(point.item.hour))}</text>
  `).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de línea" class="export-chart-svg">
      <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="#cbd5e1" stroke-width="1" />
      <line x1="${paddingX}" y1="${paddingY}" x2="${paddingX}" y2="${height - paddingY}" stroke="#cbd5e1" stroke-width="1" />
      <polyline fill="none" stroke="#dc2626" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
      ${labels}
      <text x="${paddingX}" y="16" font-size="12" fill="#475569">Máximo: ${escapeHtml(formatNumber(maxValue))}</text>
    </svg>
  `;
}

function renderTable(headers: string[], rows: string[][]) {
  if (rows.length === 0) {
    return '<p class="export-empty">Sin datos disponibles.</p>';
  }

  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const rowsHtml = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function buildExportDocument({
  data,
  generatedAt,
  appliedRangeLabel,
  statusesByNameForPie,
}: {
  data: LeadsInsightsPayload;
  generatedAt: string;
  appliedRangeLabel: string;
  statusesByNameForPie: StatusByNameInsight[];
}) {
  const summaryCards = [
    ['Leads creados', formatNumber(data.created.summary.total_leads)],
    ['Incoming entrantes', formatNumber(data.created.summary.total_incoming)],
    ['Abiertos actuales', formatNumber(data.created.summary.total_open)],
    ['Ganados históricos', formatNumber(data.won.summary.total_won)],
    ['Ticket promedio creado', formatCurrency(data.created.summary.avg_price)],
  ].map(([label, value]) => `
    <article class="kpi-card">
      <p class="kpi-label">${escapeHtml(label)}</p>
      <p class="kpi-value">${escapeHtml(value)}</p>
    </article>
  `).join('');

  const pipelinesSvg = renderHorizontalBarChartSvg(
    data.created.pipeline_volume.slice(0, 8).map((pipeline, index) => ({
      label: pipeline.pipeline_name,
      value: pipeline.total_leads,
      color: COLORS[index % COLORS.length],
    })),
  );

  const wonSellersSvg = renderHorizontalBarChartSvg(
    data.won.sellers.slice(0, 8).map((seller, index) => ({
      label: seller.seller_name,
      value: seller.total_won,
      color: COLORS[index % COLORS.length],
    })),
  );

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Leads Insights PDF</title>
        <style>
          :root { color-scheme: light; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Inter, Arial, sans-serif; color: #0f172a; background: #f8fafc; }
          .page { max-width: 1120px; margin: 0 auto; padding: 32px 28px 40px; }
          .hero, .panel, .chart-panel { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; }
          .hero, .panel { padding: 24px; }
          .hero h1 { margin: 0; font-size: 28px; }
          .hero p { margin: 8px 0 0; color: #475569; }
          .section-title { margin: 0 0 16px; font-size: 16px; font-weight: 700; }
          .kpi-grid, .panel-grid, .chart-grid { display: grid; gap: 16px; }
          .kpi-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); margin-top: 16px; }
          .panel-grid, .chart-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 16px; }
          .kpi-card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; background: #fff; }
          .kpi-label { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b; }
          .kpi-value { margin: 8px 0 0; font-size: 24px; font-weight: 800; }
          .list { margin: 0; padding-left: 18px; }
          .list li { margin: 0 0 10px; }
          .chart-panel { padding: 20px; break-inside: avoid; }
          .export-chart-svg { width: 100%; height: auto; display: block; }
          .export-empty { margin: 0; color: #64748b; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; vertical-align: top; }
          th { background: #f8fafc; color: #334155; }
          .stack { display: grid; gap: 16px; margin-top: 16px; }
          @page { size: A4 landscape; margin: 12mm; }
        </style>
      </head>
      <body>
        <main class="page">
          <section class="hero">
            <h1>Leads Insights — Reporte PDF</h1>
            <p>Rango aplicado: ${escapeHtml(appliedRangeLabel)}</p>
            <p>Generado: ${escapeHtml(generatedAt)}</p>
            <p>Zona horaria de entrada: ${escapeHtml(data.timezone ?? 'America/Lima')}</p>
            <div class="kpi-grid">${summaryCards}</div>
          </section>

          <section class="panel-grid">
            <section class="panel">
              <h2 class="section-title">Semántica del tablero</h2>
              <ul class="list">
                <li><strong>Actividad creada en el periodo</strong>: usa <code>kommo_leads.created_at</code> y <code>kommo_unsorted_leads.created_at</code>.</li>
                <li><strong>Estado actual del cohort creado</strong>: open, closed y lost describen cómo está hoy ese grupo de leads.</li>
                <li><strong>Ganados registrados en el periodo</strong>: usa <code>leads_ganados.fecha_lead_ganado</code>.</li>
                <li>No se muestra win rate ni evolución histórica de lost/closed porque la fuente actual no lo soporta con honestidad.</li>
              </ul>
            </section>
            <section class="panel">
              <h2 class="section-title">Highlights</h2>
              ${renderTable(
                ['Métrica', 'Valor'],
                [
                  ['Top pipeline creado', data.created.summary.top_pipeline?.pipeline_name ?? 'N/D'],
                  ['Top responsable actual', data.created.summary.top_owner?.responsible_user_name ?? 'N/D'],
                  ['Hora pico incoming', data.created.insights.busiest_hour ? formatHour(data.created.insights.busiest_hour.hour) : 'N/D'],
                  ['Estado actual más frecuente', data.created.insights.top_status?.status_name ?? 'N/D'],
                  ['Top vendedor histórico', data.won.summary.top_seller?.seller_name ?? 'N/D'],
                ],
              )}
            </section>
          </section>

          <section class="chart-grid">
            <section class="chart-panel">
              <h2 class="section-title">Leads creados por pipeline actual</h2>
              ${pipelinesSvg}
            </section>
            <section class="chart-panel">
              <h2 class="section-title">Ganados históricos por vendedor snapshot</h2>
              ${wonSellersSvg}
            </section>
            <section class="chart-panel">
              <h2 class="section-title">Horas con más leads entrantes</h2>
              ${renderLineChartSvg(data.created.hourly_incoming)}
            </section>
            <section class="chart-panel">
              <h2 class="section-title">Leads creados según estado actual</h2>
              ${renderTable(
                ['Estado', 'Leads'],
                statusesByNameForPie.map((status) => [status.status_name, formatNumber(status.total_leads)]),
              )}
            </section>
          </section>

          <section class="stack">
            <section class="panel">
              <h2 class="section-title">Cohort creado por pipeline + estado actual</h2>
              ${renderTable(
                ['Pipeline', 'Creados', 'Abiertos', 'Cerrados', 'Perdidos', 'Ticket promedio'],
                data.created.pipeline_current_state.map((pipeline) => [
                  pipeline.pipeline_name,
                  formatNumber(pipeline.total_leads),
                  formatNumber(pipeline.open_leads),
                  formatNumber(pipeline.closed_leads),
                  formatNumber(pipeline.lost_leads),
                  formatCurrency(pipeline.avg_price),
                ]),
              )}
            </section>
            <section class="panel">
              <h2 class="section-title">Ganados históricos</h2>
              ${renderTable(
                ['Entidad', 'Ganados'],
                [
                  ...data.won.sellers.slice(0, 8).map((seller) => [seller.seller_name, formatNumber(seller.total_won)]),
                  ...data.won.pipelines.slice(0, 8).map((pipeline) => [`Pipeline: ${pipeline.pipeline_name}`, formatNumber(pipeline.total_won)]),
                ],
              )}
            </section>
          </section>
        </main>
      </body>
    </html>
  `;
}

function buildEmptyPayload(startDate: string | null, endDate: string | null, error?: string): LeadsInsightsPayload {
  return {
    success: false,
    error,
    filters: {
      start_date: startDate,
      end_date: endDate,
    },
    created: {
      summary: {
        total_leads: 0,
        total_open: 0,
        total_closed: 0,
        total_lost: 0,
        total_deleted: 0,
        total_incoming: 0,
        avg_price: null,
        top_pipeline: null,
        top_owner: null,
      },
      pipeline_volume: [],
      owner_volume: [],
      status_volume: [],
      status_volume_by_name: [],
      pipeline_current_state: [],
      hourly_incoming: [],
      insights: {
        busiest_hour: null,
        top_status: null,
        orphan_pipeline_leads: 0,
      },
    },
    won: {
      summary: {
        total_won: 0,
        top_pipeline: null,
        top_seller: null,
      },
      pipelines: [],
      sellers: [],
    },
  };
}

export function KommoLeadsInsights() {
  const [draftStartDate, setDraftStartDate] = useState<string | null>(null);
  const [draftEndDate, setDraftEndDate] = useState<string | null>(null);
  const [appliedStartDate, setAppliedStartDate] = useState<string | null>(null);
  const [appliedEndDate, setAppliedEndDate] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const insightsQuery = useQuery({
    queryKey: ['kommo-leads-insights', appliedStartDate, appliedEndDate],
    queryFn: async (): Promise<LeadsInsightsPayload> => {
      const queryParams = new URLSearchParams();
      if (appliedStartDate) queryParams.set('start_date', appliedStartDate);
      if (appliedEndDate) queryParams.set('end_date', appliedEndDate);

      const endpoint = queryParams.size > 0
        ? `/api/kommo/leads-insights?${queryParams.toString()}`
        : '/api/kommo/leads-insights';

      const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
      });

      const payload = (await response.json()) as LeadsInsightsPayload;
      if (!response.ok) {
        return buildEmptyPayload(appliedStartDate, appliedEndDate, payload.error ?? 'No se pudo cargar insights de leads');
      }

      return payload;
    },
  });

  const applyQuickRange = (range: 'today' | 'last7' | 'last30' | 'all') => {
    const todayLima = getCurrentLimaDate();

    if (range === 'today') {
      setDraftStartDate(todayLima);
      setDraftEndDate(todayLima);
      return;
    }

    if (range === 'last7') {
      setDraftStartDate(shiftDate(todayLima, -6));
      setDraftEndDate(todayLima);
      return;
    }

    if (range === 'last30') {
      setDraftStartDate(shiftDate(todayLima, -29));
      setDraftEndDate(todayLima);
      return;
    }

    setDraftStartDate(null);
    setDraftEndDate(null);
  };

  const applyFilters = () => {
    setAppliedStartDate(draftStartDate);
    setAppliedEndDate(draftEndDate);
  };

  const clearFilters = () => {
    setDraftStartDate(null);
    setDraftEndDate(null);
    setAppliedStartDate(null);
    setAppliedEndDate(null);
  };

  const statusesByNameForPie = useMemo(
    () => (insightsQuery.data?.created.status_volume_by_name ?? []).slice(0, 8),
    [insightsQuery.data?.created.status_volume_by_name],
  );

  const createdPipelineChartData = useMemo(
    () => (insightsQuery.data?.created.pipeline_volume ?? [])
      .filter((pipeline) => {
        const key = normalizePipelineKey(pipeline.pipeline_name);
        return key !== 'DATADELEADS' && key !== 'LEADSENTRANTESPRINCIPAL';
      })
      .sort((a, b) => b.total_leads - a.total_leads)
      .slice(0, 8)
      .map((pipeline) => ({
        label: truncateLabel(pipeline.pipeline_name, 28),
        total_leads: pipeline.total_leads,
        fullLabel: pipeline.pipeline_name,
      })),
    [insightsQuery.data?.created.pipeline_volume],
  );

  const wonSellerChartData = useMemo(
    () => (insightsQuery.data?.won.sellers ?? [])
      .filter((seller) => !shouldExcludePrimaryEntity(seller.seller_name))
      .sort((a, b) => b.total_won - a.total_won)
      .slice(0, 8)
      .map((seller) => ({
        label: truncateLabel(seller.seller_name, 28),
        total_won: seller.total_won,
        fullLabel: seller.seller_name,
      })),
    [insightsQuery.data?.won.sellers],
  );

  const incomingDaysDivider = useMemo(
    () => resolveRangeDays(insightsQuery.data?.filters.start_date ?? null, insightsQuery.data?.filters.end_date ?? null),
    [insightsQuery.data?.filters.end_date, insightsQuery.data?.filters.start_date],
  );

  const hourlyIncomingAverageData = useMemo(
    () => (insightsQuery.data?.created.hourly_incoming ?? []).map((row) => ({
      ...row,
      avg_incoming: row.total_incoming / incomingDaysDivider,
    })),
    [incomingDaysDivider, insightsQuery.data?.created.hourly_incoming],
  );

  const handleExportPdf = useCallback(async () => {
    if (isExportingPdf) return;

    const currentData = insightsQuery.data;
    if (!currentData || currentData.success === false) return;

    const generatedAt = new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());

    setIsExportingPdf(true);

    try {
      const exportWindow = window.open('', '_blank', 'noopener,noreferrer');
      if (!exportWindow) {
        throw new Error('El navegador bloqueó la ventana de exportación.');
      }

      exportWindow.document.open();
      exportWindow.document.write(buildExportDocument({
        data: currentData,
        generatedAt,
        appliedRangeLabel: `${currentData.filters.start_date ?? 'sin inicio'} — ${currentData.filters.end_date ?? 'sin fin'}`,
        statusesByNameForPie,
      }));
      exportWindow.document.close();

      const finalizePrint = () => {
        exportWindow.focus();
        window.setTimeout(() => {
          exportWindow.print();
          setIsExportingPdf(false);
        }, 150);
      };

      if (exportWindow.document.readyState === 'complete') {
        finalizePrint();
      } else {
        exportWindow.addEventListener('load', finalizePrint, { once: true });
      }
    } catch (error) {
      console.error('No se pudo exportar Leads Insights a PDF', error);
      window.alert('No se pudo exportar el PDF. Probá nuevamente.');
      setIsExportingPdf(false);
    }
  }, [insightsQuery.data, isExportingPdf, statusesByNameForPie]);

  if (insightsQuery.isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)]">
        Cargando insights de leads...
      </div>
    );
  }

  if (!insightsQuery.data || insightsQuery.data.success === false) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {insightsQuery.data?.error ?? 'Error cargando insights de leads'}
      </div>
    );
  }

  const data = insightsQuery.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Kommo · Análisis de leads</p>
          <h1 className="mt-2 inline-flex items-center gap-2 text-2xl font-extrabold uppercase tracking-[0.08em] text-gray-900">
            <Activity className="text-red-600" size={22} />
            Leads Insights
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Compará el mismo rango temporal desde dos fuentes defendibles: actividad creada del periodo y ganados registrados en historial. Zona horaria: {data.timezone ?? 'America/Lima'}.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-70"
          >
            <FileText size={14} />
            {isExportingPdf ? 'Exportando PDF...' : 'Exportar PDF'}
          </button>
          <Link
            to="/kommo"
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            Ver Explorer
          </Link>
        </div>
      </header>

      <section className="space-y-5 rounded-[28px] border border-gray-200 bg-white p-5 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
              <Filter size={14} />
              Filtros
            </p>
          </div>
          {insightsQuery.isFetching ? <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Actualizando…</span> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <QuickRangeButton label="Hoy" onClick={() => applyQuickRange('today')} />
          <QuickRangeButton label="Últimos 7 días" onClick={() => applyQuickRange('last7')} />
          <QuickRangeButton label="Últimos 30 días" onClick={() => applyQuickRange('last30')} />
          <QuickRangeButton label="Todo" onClick={() => applyQuickRange('all')} />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
          <label className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <span>Desde</span>
            <input
              type="date"
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-200"
              value={draftStartDate ?? ''}
              onChange={(event) => setDraftStartDate(event.target.value || null)}
            />
          </label>
          <label className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <span>Hasta</span>
            <input
              type="date"
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-200"
              value={draftEndDate ?? ''}
              onChange={(event) => setDraftEndDate(event.target.value || null)}
            />
          </label>

          <div className="flex items-end justify-start gap-2 xl:justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-700 transition hover:bg-gray-50"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={applyFilters}
              className="inline-flex items-center rounded-2xl bg-red-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-[0_18px_32px_-18px_rgba(220,38,38,0.9)] transition hover:bg-red-700"
            >
              Aplicar filtros
            </button>
          </div>
        </div>
      </section>

      <InsightsReportSections
        data={data}
        statusesByNameForPie={statusesByNameForPie}
        createdPipelineChartData={createdPipelineChartData}
        hourlyIncomingAverageData={hourlyIncomingAverageData}
        incomingDaysDivider={incomingDaysDivider}
        wonSellerChartData={wonSellerChartData}
      />
    </div>
  );
}

function InsightsReportSections({
  data,
  statusesByNameForPie,
  createdPipelineChartData,
  hourlyIncomingAverageData,
  incomingDaysDivider,
  wonSellerChartData,
}: {
  data: LeadsInsightsPayload;
  statusesByNameForPie: StatusByNameInsight[];
  createdPipelineChartData: Array<{ label: string; total_leads: number; fullLabel: string }>;
  hourlyIncomingAverageData: Array<{ hour: number; total_incoming: number; avg_incoming: number }>;
  incomingDaysDivider: number;
  wonSellerChartData: Array<{ label: string; total_won: number; fullLabel: string }>;
}) {
  const [pipelineSelection, setPipelineSelection] = useState<{ a: string; b: string; c: string }>({ a: '', b: '', c: '' });

  if (data.created.summary.total_leads === 0 && data.won.summary.total_won === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        No hay leads disponibles para mostrar métricas con los filtros actuales.
        <div className="mt-3">
          <Link to="/kommo" className="font-semibold text-red-700 hover:underline">Ir al Explorer de Kommo</Link>
        </div>
      </div>
    );
  }

  const pipelineOptions = data.created.pipeline_current_state
    .filter((pipeline) => !shouldExcludePrimaryEntity(pipeline.pipeline_name))
    .sort((a, b) => b.total_leads - a.total_leads)
    .slice(0, 12)
    .map((pipeline) => ({
      id: pipeline.group_key,
      label: pipeline.pipeline_name,
      totalLeads: pipeline.total_leads,
    }));

  const resolvedPipelineSelection = resolvePipelineComparisonSelection(pipelineOptions, pipelineSelection);

  const wonByPipelineKey = new Map(
    data.won.pipelines.map((pipeline) => [normalizePipelineKey(pipeline.pipeline_name), pipeline.total_won]),
  );

  const incomingByPipelineKey = new Map<string, number>();
  for (const status of data.created.status_volume) {
    const statusName = normalizePipelineKey(status.status_name);
    if (statusName !== 'LEADSNUEVOSARESPONDER') continue;

    const key = normalizePipelineKey(status.pipeline_name);
    incomingByPipelineKey.set(key, (incomingByPipelineKey.get(key) ?? 0) + status.total_leads);
  }

  const selectedPipelines = [resolvedPipelineSelection.a, resolvedPipelineSelection.b, resolvedPipelineSelection.c]
    .filter(Boolean)
    .map((id) => pipelineOptions.find((option) => option.id === id))
    .filter((option): option is { id: string; label: string; totalLeads: number } => Boolean(option));

  const pipelineComparisonChartData = [
    { metric: 'Totales' },
    { metric: 'Entrantes' },
    { metric: 'Ganados' },
    { metric: 'Perdidos' },
    { metric: 'Cerrados' },
  ].map((row) => {
    const record: Record<string, string | number> = { ...row };

    for (const option of selectedPipelines) {
      const snapshot = data.created.pipeline_current_state.find((pipeline) => pipeline.group_key === option.id);
      const key = normalizePipelineKey(option.label);

      if (row.metric === 'Totales') record[option.id] = snapshot?.total_leads ?? 0;
      if (row.metric === 'Entrantes') record[option.id] = incomingByPipelineKey.get(key) ?? 0;
      if (row.metric === 'Ganados') record[option.id] = wonByPipelineKey.get(key) ?? 0;
      if (row.metric === 'Perdidos') record[option.id] = snapshot?.lost_leads ?? 0;
      if (row.metric === 'Cerrados') record[option.id] = snapshot?.closed_leads ?? 0;
    }

    return record;
  });

  return (
    <>
      <section>
        <ChartCard title="Comparativa directa de pipelines" description="Seleccioná hasta 3 pipelines para comparar totales, entrantes, ganados, perdidos y cerrados." icon={<BarChart3 size={16} className="text-red-600" />}>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <PipelineComparisonSelect
              label="Pipeline A"
              value={resolvedPipelineSelection.a}
              options={pipelineOptions}
              selectedPeers={[resolvedPipelineSelection.b, resolvedPipelineSelection.c]}
              onChange={(value) => setPipelineSelection((current) => ({ ...current, a: value }))}
            />
            <PipelineComparisonSelect
              label="Pipeline B"
              value={resolvedPipelineSelection.b}
              options={pipelineOptions}
              selectedPeers={[resolvedPipelineSelection.a, resolvedPipelineSelection.c]}
              onChange={(value) => setPipelineSelection((current) => ({ ...current, b: value }))}
            />
            <PipelineComparisonSelect
              label="Pipeline C (opcional)"
              value={resolvedPipelineSelection.c}
              options={pipelineOptions}
              selectedPeers={[resolvedPipelineSelection.a, resolvedPipelineSelection.b]}
              includeEmpty
              onChange={(value) => setPipelineSelection((current) => ({ ...current, c: value }))}
            />
          </div>

          {selectedPipelines.length >= 2 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={pipelineComparisonChartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="metric" tick={{ fontSize: 12, fill: CHART_AXIS }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: CHART_AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => formatNumber(asChartNumber(value))} />
                <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: '12px' }} />
                {selectedPipelines.map((pipeline, index) => (
                  <Bar key={pipeline.id} dataKey={pipeline.id} name={pipeline.label} fill={COLORS[index % COLORS.length]} radius={[8, 8, 0, 0]} barSize={22} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
              Seleccioná al menos 2 pipelines para comparar.
            </div>
          )}
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Leads Creados por Personal" description="Top pipelines del cohort creado en el rango." icon={<Layers size={16} className="text-red-600" />}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={createdPipelineChartData} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: CHART_AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={152} tick={{ fontSize: 12, fill: CHART_AXIS }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value) => formatNumber(asChartNumber(value))}
                labelFormatter={(_, payload) => String(payload?.[0]?.payload?.fullLabel ?? '')}
              />
              <Bar dataKey="total_leads" name="Creados" radius={[0, 10, 10, 0]} fill="#dc2626" barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Horas con más leads entrantes" description={`Promedio diario por hora (incoming) en ${incomingDaysDivider} día(s) del rango.`} icon={<Clock3 size={16} className="text-red-600" />}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={hourlyIncomingAverageData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="incomingFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#dc2626" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#dc2626" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hour" tickFormatter={formatHour} tick={{ fontSize: 12, fill: CHART_AXIS }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: CHART_AXIS }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelFormatter={(hour) => `Hora ${formatHour(Number(hour))}`}
                formatter={(value) => [Number(asChartNumber(value)).toFixed(2), 'Cant. entrantes']}
              />
              <Area
                type="monotone"
                dataKey="avg_incoming"
                stroke="#dc2626"
                fill="url(#incomingFill)"
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 2, fill: '#ffffff' }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section>
        <ChartCard title="Leads creados según estado actual" description="Distribución por estado actual dentro del cohort creado." icon={<PieChartIcon size={16} className="text-red-600" />}>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={statusesByNameForPie.map((status) => ({ ...status, status_label: formatStatusLegendLabel(status.status_name) }))} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: CHART_AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="status_label" width={176} tick={{ fontSize: 12, fill: CHART_AXIS }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value) => formatNumber(asChartNumber(value))}
                labelFormatter={(_, payload) => String(payload?.[0]?.payload?.status_name ?? '')}
              />
              <Bar dataKey="total_leads" name="Leads" radius={[0, 10, 10, 0]} fill="#dc2626" barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section>
        <ChartCard title="Ganados históricos por personal" description="Ranking descendente de ganados por responsable." icon={<Users size={16} className="text-red-600" />}>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={wonSellerChartData} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: CHART_AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={168} tick={{ fontSize: 12, fill: CHART_AXIS }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value) => formatNumber(asChartNumber(value))}
                labelFormatter={(_, payload) => String(payload?.[0]?.payload?.fullLabel ?? '')}
              />
              <Bar dataKey="total_won" name="Ganados" radius={[0, 10, 10, 0]} fill="#dc2626" barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>
    </>
  );
}

function QuickRangeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-gray-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
    >
      {label}
    </button>
  );
}

function resolveRangeDays(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return 1;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
}

function normalizePipelineKey(value: string) {
  return value
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '');
}

function shouldExcludePrimaryEntity(value: string) {
  const normalized = normalizePipelineKey(value);
  return normalized === 'DATADELEADS' || normalized === 'LEADSENTRANTESPRINCIPAL' || normalized === 'LEADSENTRANTESPRINCIPALES';
}

function resolvePipelineComparisonSelection(
  options: Array<{ id: string }>,
  selection: { a: string; b: string; c: string },
) {
  const valid = new Set(options.map((option) => option.id));
  const sortedDefaults = options.slice(0, 3).map((option) => option.id);

  const first = valid.has(selection.a) ? selection.a : (sortedDefaults[0] ?? '');
  const secondCandidate = valid.has(selection.b) ? selection.b : (sortedDefaults[1] ?? '');
  const second = secondCandidate && secondCandidate !== first
    ? secondCandidate
    : options.find((option) => option.id !== first)?.id ?? '';

  const thirdCandidate = valid.has(selection.c) ? selection.c : (sortedDefaults[2] ?? '');
  const third = thirdCandidate && thirdCandidate !== first && thirdCandidate !== second
    ? thirdCandidate
    : '';

  return { a: first, b: second, c: third };
}

function PipelineComparisonSelect({
  label,
  value,
  options,
  selectedPeers,
  onChange,
  includeEmpty = false,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  selectedPeers: string[];
  onChange: (value: string) => void;
  includeEmpty?: boolean;
}) {
  const peers = new Set(selectedPeers.filter(Boolean));

  return (
    <label className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-200"
      >
        {includeEmpty ? <option value="">Sin seleccionar</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={peers.has(option.id)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChartCard({ title, description, icon, children }: { title: string; description?: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)]">
      <div className="mb-4">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
          {icon}
          {title}
        </h3>
        {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
