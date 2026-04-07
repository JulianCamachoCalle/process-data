import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Clock3,
  FileText,
  Layers,
  PieChart as PieChartIcon,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
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

type LeadsInsightsPayload = {
  success: boolean;
  error?: string;
  timezone?: string;
  pipelines: PipelineInsight[];
  statuses: StatusInsight[];
  statusesByName: StatusByNameInsight[];
  hourlyIncoming: HourlyIncomingInsight[];
  owners: OwnerInsight[];
  filters: {
    start_date: string | null;
    end_date: string | null;
  };
  pipelinePerformance: Array<{
    group_key: string;
    pipeline_id: number | null;
    pipeline_name: string;
    total_leads: number;
    open_leads: number;
    closed_leads: number;
    won_leads: number;
    lost_leads: number;
    avg_price: number | null;
  }>;
  summary: {
    total_leads: number;
    total_open: number;
    total_closed: number;
    total_won: number;
    total_lost: number;
    total_deleted: number;
    avg_price: number | null;
    top_pipeline: PipelineInsight | null;
  };
  insights: {
    busiest_hour: HourlyIncomingInsight | null;
    top_status: StatusInsight | null;
    won_rate_over_closed: number | null;
    orphan_pipeline_leads: number;
    top_owner: OwnerInsight | null;
  };
};

const COLORS = ['#dc2626', '#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#14b8a6', '#22c55e'];

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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPercent(value: number | null) {
  return value === null ? 'N/D' : `${value}%`;
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
  selectedPipelineA,
  selectedPipelineB,
  pipelineComparisonChartData,
  statusesByNameForPie,
}: {
  data: LeadsInsightsPayload;
  generatedAt: string;
  appliedRangeLabel: string;
  selectedPipelineA: LeadsInsightsPayload['pipelinePerformance'][number] | null;
  selectedPipelineB: LeadsInsightsPayload['pipelinePerformance'][number] | null;
  pipelineComparisonChartData: Array<{ metric: string; pipelineA: number; pipelineB: number }>;
  statusesByNameForPie: StatusByNameInsight[];
}) {
  const summaryCards = [
    ['Leads creados', formatNumber(data.summary.total_leads)],
    ['Leads abiertos (creados)', formatNumber(data.summary.total_open)],
    ['Leads cerrados (creados)', formatNumber(data.summary.total_closed)],
    ['Leads ganados (históricos)', formatNumber(data.summary.total_won)],
    ['Ticket promedio', formatCurrency(data.summary.avg_price)],
  ].map(([label, value]) => `
    <article class="kpi-card">
      <p class="kpi-label">${escapeHtml(label)}</p>
      <p class="kpi-value">${escapeHtml(value)}</p>
    </article>
  `).join('');

  const comparisonSvg = selectedPipelineA && selectedPipelineB
    ? renderHorizontalBarChartSvg(
        pipelineComparisonChartData.flatMap((item) => [
          { label: `${item.metric} — ${selectedPipelineA.pipeline_name}`, value: item.pipelineA, color: '#dc2626' },
          { label: `${item.metric} — ${selectedPipelineB.pipeline_name}`, value: item.pipelineB, color: '#f97316' },
        ]),
        { rowHeight: 26 },
      )
    : '<p class="export-empty">No hay suficientes pipelines para comparar.</p>';

  const pipelinesSvg = renderHorizontalBarChartSvg(
    data.pipelines.slice(0, 8).map((pipeline, index) => ({
      label: pipeline.pipeline_name,
      value: pipeline.total_leads,
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
          @media print {
            body { background: #ffffff; }
            .page { max-width: none; padding: 0; }
            .hero, .panel, .chart-panel { box-shadow: none; }
          }
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
              <h2 class="section-title">Insights ejecutivos</h2>
              <ul class="list">
                <li>Pipeline/personal top (creados): <strong>${escapeHtml(data.summary.top_pipeline?.pipeline_name ?? 'N/D')}</strong></li>
                <li>Hora pico incoming: <strong>${escapeHtml(data.insights.busiest_hour ? formatHour(data.insights.busiest_hour.hour) : 'N/D')}</strong></li>
                <li>Estado más frecuente: <strong>${escapeHtml(data.insights.top_status?.status_name ?? 'N/D')}</strong></li>
                <li>Win rate referencial (ganados históricos / cerrados creados): <strong>${escapeHtml(formatPercent(data.insights.won_rate_over_closed))}</strong></li>
                <li>Leads sin pipeline: <strong>${escapeHtml(formatNumber(data.insights.orphan_pipeline_leads))}</strong></li>
              </ul>
            </section>
            <section class="panel">
              <h2 class="section-title">Top personal</h2>
              ${renderTable(
                ['Responsable actual', 'Leads creados'],
                data.owners.slice(0, 5).map((owner) => [owner.responsible_user_name, formatNumber(owner.total_leads)]),
              )}
            </section>
          </section>

          <section class="chart-grid">
            <section class="chart-panel">
              <h2 class="section-title">Comparación de personal</h2>
              ${comparisonSvg}
            </section>
            <section class="chart-panel">
              <h2 class="section-title">Leads creados según pipeline/personal</h2>
              ${pipelinesSvg}
            </section>
            <section class="chart-panel">
              <h2 class="section-title">Horas con más leads entrantes</h2>
              ${renderLineChartSvg(data.hourlyIncoming)}
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
              <h2 class="section-title">Performance por pipeline/personal</h2>
              ${renderTable(
                ['Pipeline/Personal', 'Total creados', 'Abiertos', 'Cerrados', 'Ganados históricos', 'Perdidos', 'Ticket promedio'],
                data.pipelinePerformance.map((pipeline) => [
                  pipeline.pipeline_name,
                  formatNumber(pipeline.total_leads),
                  formatNumber(pipeline.open_leads),
                  formatNumber(pipeline.closed_leads),
                  formatNumber(pipeline.won_leads),
                  formatNumber(pipeline.lost_leads),
                  formatCurrency(pipeline.avg_price),
                ]),
              )}
            </section>
            <section class="panel">
              <h2 class="section-title">Estados por personal</h2>
              ${renderTable(
                ['Pipeline/Personal', 'Estado', 'Leads creados'],
                data.statuses.slice(0, 24).map((status) => [status.pipeline_name, status.status_name, formatNumber(status.total_leads)]),
              )}
            </section>
          </section>
        </main>
      </body>
    </html>
  `;
}

export function KommoLeadsInsights() {
  const [draftStartDate, setDraftStartDate] = useState<string | null>(null);
  const [draftEndDate, setDraftEndDate] = useState<string | null>(null);
  const [appliedStartDate, setAppliedStartDate] = useState<string | null>(null);
  const [appliedEndDate, setAppliedEndDate] = useState<string | null>(null);
  const [pipelineAKey, setPipelineAKey] = useState<string>('');
  const [pipelineBKey, setPipelineBKey] = useState<string>('');
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
        return {
          success: false,
          error: payload.error ?? 'No se pudo cargar insights de leads',
          pipelines: [],
          statuses: [],
          statusesByName: [],
          hourlyIncoming: [],
          owners: [],
          filters: {
            start_date: appliedStartDate,
            end_date: appliedEndDate,
          },
          pipelinePerformance: [],
          summary: {
            total_leads: 0,
            total_open: 0,
            total_closed: 0,
            total_won: 0,
            total_lost: 0,
            total_deleted: 0,
            avg_price: null,
            top_pipeline: null,
          },
          insights: {
            busiest_hour: null,
            top_status: null,
            won_rate_over_closed: null,
            orphan_pipeline_leads: 0,
            top_owner: null,
          },
        };
      }

      return payload;
    },
  });

  useEffect(() => {
    const performance = insightsQuery.data?.pipelinePerformance ?? [];
    if (performance.length === 0) {
      setPipelineAKey('');
      setPipelineBKey('');
      return;
    }

    const keys = performance.map((item) => item.group_key);
    if (!pipelineAKey || !keys.includes(pipelineAKey)) {
      setPipelineAKey(keys[0] ?? '');
    }

    if (!pipelineBKey || !keys.includes(pipelineBKey) || pipelineBKey === pipelineAKey) {
      setPipelineBKey(keys[1] ?? keys[0] ?? '');
    }
  }, [insightsQuery.data?.pipelinePerformance, pipelineAKey, pipelineBKey]);

  const selectedPipelineA = useMemo(
    () => insightsQuery.data?.pipelinePerformance.find((pipeline) => pipeline.group_key === pipelineAKey) ?? null,
    [insightsQuery.data?.pipelinePerformance, pipelineAKey],
  );

  const selectedPipelineB = useMemo(
    () => insightsQuery.data?.pipelinePerformance.find((pipeline) => pipeline.group_key === pipelineBKey) ?? null,
    [insightsQuery.data?.pipelinePerformance, pipelineBKey],
  );

  const pipelineComparisonChartData = useMemo(() => {
    if (!selectedPipelineA || !selectedPipelineB) return [];
    return [
      { metric: 'Total creados', pipelineA: selectedPipelineA.total_leads, pipelineB: selectedPipelineB.total_leads },
      { metric: 'Abiertos', pipelineA: selectedPipelineA.open_leads, pipelineB: selectedPipelineB.open_leads },
      { metric: 'Cerrados', pipelineA: selectedPipelineA.closed_leads, pipelineB: selectedPipelineB.closed_leads },
      { metric: 'Ganados históricos', pipelineA: selectedPipelineA.won_leads, pipelineB: selectedPipelineB.won_leads },
      { metric: 'Perdidos', pipelineA: selectedPipelineA.lost_leads, pipelineB: selectedPipelineB.lost_leads },
    ];
  }, [selectedPipelineA, selectedPipelineB]);

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

  const handleExportPdf = useCallback(async () => {
    if (isExportingPdf) return;

    const currentData = insightsQuery.data;
    if (!currentData || currentData.success === false) return;

    const currentAppliedRangeLabel = `${currentData.filters.start_date ?? 'sin inicio'} — ${currentData.filters.end_date ?? 'sin fin'}`;
    const currentStatusesByNameForPie = (currentData.statusesByName ?? []).slice(0, 8);

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

      const documentMarkup = buildExportDocument({
        data: currentData,
        generatedAt,
        appliedRangeLabel: currentAppliedRangeLabel,
        selectedPipelineA,
        selectedPipelineB,
        pipelineComparisonChartData,
        statusesByNameForPie: currentStatusesByNameForPie,
      });

      exportWindow.document.open();
      exportWindow.document.write(documentMarkup);
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
  }, [
    insightsQuery.data,
    isExportingPdf,
    pipelineComparisonChartData,
    selectedPipelineA,
    selectedPipelineB,
  ]);

  const statusByPipelineData = useMemo(() => {
    const source = insightsQuery.data?.statuses ?? [];
    const topStatuses = source
      .slice()
      .sort((a, b) => b.total_leads - a.total_leads)
      .slice(0, 8)
      .map((status) => status.status_name);

    const byPipeline = new Map<string, Record<string, number | string>>();

    for (const status of source) {
      const key = `${status.pipeline_id ?? 'null'}-${status.pipeline_name}`;
      if (!byPipeline.has(key)) {
        byPipeline.set(key, { pipeline_name: status.pipeline_name });
      }

      const row = byPipeline.get(key)!;
      const statusKey = topStatuses.includes(status.status_name) ? status.status_name : 'Otros';
      const currentValue = Number(row[statusKey] ?? 0);
      row[statusKey] = currentValue + status.total_leads;
    }

    return {
      rows: Array.from(byPipeline.values()),
      stackKeys: Array.from(new Set([...topStatuses, 'Otros'])).filter((key) =>
        Array.from(byPipeline.values()).some((row) => Number(row[key] ?? 0) > 0),
      ),
    };
  }, [insightsQuery.data?.statuses]);

  const statusesByNameForPie = useMemo(
    () => (insightsQuery.data?.statusesByName ?? []).slice(0, 8),
    [insightsQuery.data?.statusesByName],
  );

  if (insightsQuery.isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)]">
        Cargando insights de leads...
      </div>
    );
  }

  if (!insightsQuery.data || insightsQuery.data.success === false) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 text-sm">
        {insightsQuery.data?.error ?? 'Error cargando insights de leads'}
      </div>
    );
  }

  const data = insightsQuery.data;
  const appliedRangeLabel = `${data.filters.start_date ?? 'sin inicio'} — ${data.filters.end_date ?? 'sin fin'}`;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-gray-200 bg-white px-6 py-5 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)] flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 inline-flex items-center gap-2">
            <Activity className="text-red-600" size={22} />
            Leads Insights
          </h1>
          <p className="text-sm text-gray-500 mt-1">Métricas ejecutivas de leads Kommo. Zona horaria de entrada: {data.timezone ?? 'America/Lima'}.</p>
        </div>
        <div className="inline-flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-wait disabled:opacity-70"
          >
            <FileText size={14} />
            {isExportingPdf ? 'Exportando PDF...' : 'Exportar PDF'}
          </button>
          <Link
            to="/kommo"
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Ver Explorer
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)] space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <QuickRangeButton label="Hoy" onClick={() => applyQuickRange('today')} />
          <QuickRangeButton label="Últimos 7 días" onClick={() => applyQuickRange('last7')} />
          <QuickRangeButton label="Últimos 30 días" onClick={() => applyQuickRange('last30')} />
          <QuickRangeButton label="Todo" onClick={() => applyQuickRange('all')} />
          {insightsQuery.isFetching ? <span className="text-xs text-gray-500 ml-2">Actualizando…</span> : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide space-y-1">
            Desde
            <input
              type="date"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-200"
              value={draftStartDate ?? ''}
              onChange={(event) => setDraftStartDate(event.target.value || null)}
            />
          </label>
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide space-y-1">
            Hasta
            <input
              type="date"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-200"
              value={draftEndDate ?? ''}
              onChange={(event) => setDraftEndDate(event.target.value || null)}
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={applyFilters}
            className="inline-flex items-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Aplicar filtros
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Limpiar
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Filtro aplicado: {appliedRangeLabel}. Ganados usa fecha_lead_ganado; el resto usa fecha de creación / estado actual.
        </p>
      </section>

      <InsightsReportSections
        data={data}
        pipelineAKey={pipelineAKey}
        pipelineBKey={pipelineBKey}
        onPipelineAChange={setPipelineAKey}
        onPipelineBChange={setPipelineBKey}
        selectedPipelineA={selectedPipelineA}
        selectedPipelineB={selectedPipelineB}
        pipelineComparisonChartData={pipelineComparisonChartData}
        statusesByNameForPie={statusesByNameForPie}
        statusByPipelineData={statusByPipelineData}
      />
    </div>
  );
}

function InsightsReportSections({
  data,
  pipelineAKey,
  pipelineBKey,
  onPipelineAChange,
  onPipelineBChange,
  selectedPipelineA,
  selectedPipelineB,
  pipelineComparisonChartData,
  statusesByNameForPie,
  statusByPipelineData,
}: {
  data: LeadsInsightsPayload;
  pipelineAKey: string;
  pipelineBKey: string;
  onPipelineAChange: (value: string) => void;
  onPipelineBChange: (value: string) => void;
  selectedPipelineA: LeadsInsightsPayload['pipelinePerformance'][number] | null;
  selectedPipelineB: LeadsInsightsPayload['pipelinePerformance'][number] | null;
  pipelineComparisonChartData: Array<{ metric: string; pipelineA: number; pipelineB: number }>;
  statusesByNameForPie: StatusByNameInsight[];
  statusByPipelineData: { rows: Array<Record<string, number | string>>; stackKeys: string[] };
}) {
  if (data.summary.total_leads === 0 && data.summary.total_won === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        No hay leads disponibles para mostrar métricas con los filtros actuales.
        <div className="mt-3">
          <Link to="/kommo" className="font-semibold text-red-700 hover:underline">Ir al Explorer de Kommo</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard title="Leads creados" value={formatNumber(data.summary.total_leads)} />
        <KpiCard title="Leads abiertos (creados)" value={formatNumber(data.summary.total_open)} />
        <KpiCard title="Leads cerrados (creados)" value={formatNumber(data.summary.total_closed)} />
        <KpiCard title="Leads ganados (históricos)" value={formatNumber(data.summary.total_won)} />
        <KpiCard title="Ticket promedio" value={formatCurrency(data.summary.avg_price)} />
      </section>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Los <strong>ganados</strong> ahora usan historial de <code>leads_ganados</code> y respetan <strong>fecha_lead_ganado</strong>. El resto de métricas sigue basado en leads creados / estado actual.
      </div>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)]">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
          <BarChart3 size={16} className="text-red-600" />
          Comparación de pipeline/personal
        </h3>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
            Pipeline/Personal A
            <select
              value={pipelineAKey}
              onChange={(event) => onPipelineAChange(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-200"
            >
              {(data.pipelinePerformance ?? []).map((pipeline) => (
                  <option key={`a-${pipeline.group_key}`} value={pipeline.group_key}>
                  {pipeline.pipeline_name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
            Pipeline/Personal B
            <select
              value={pipelineBKey}
              onChange={(event) => onPipelineBChange(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-200"
            >
              {(data.pipelinePerformance ?? []).map((pipeline) => (
                  <option key={`b-${pipeline.group_key}`} value={pipeline.group_key}>
                  {pipeline.pipeline_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedPipelineA && selectedPipelineB ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
              <CompareKpiCard label="Total creados" left={selectedPipelineA.total_leads} right={selectedPipelineB.total_leads} />
              <CompareKpiCard label="Open" left={selectedPipelineA.open_leads} right={selectedPipelineB.open_leads} />
              <CompareKpiCard label="Closed" left={selectedPipelineA.closed_leads} right={selectedPipelineB.closed_leads} />
              <CompareKpiCard label="Won histórico" left={selectedPipelineA.won_leads} right={selectedPipelineB.won_leads} />
              <CompareKpiCard label="Lost" left={selectedPipelineA.lost_leads} right={selectedPipelineB.lost_leads} />
              <CompareKpiCard
                label="Avg ticket"
                left={selectedPipelineA.avg_price}
                right={selectedPipelineB.avg_price}
                formatter={(value) => formatCurrency(value)}
              />
            </div>

            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={pipelineComparisonChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatNumber(asChartNumber(value))} />
                <Bar dataKey="pipelineA" name={selectedPipelineA.pipeline_name} fill="#dc2626" radius={[6, 6, 0, 0]} />
                <Bar dataKey="pipelineB" name={selectedPipelineB.pipeline_name} fill="#f97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : (
          <p className="text-sm text-gray-500">No hay pipelines suficientes para comparar.</p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Leads creados según pipeline/personal" icon={<Layers size={16} className="text-red-600" />}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.pipelines}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="pipeline_name"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => truncateLabel(String(value), 22)}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={58}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatNumber(asChartNumber(value))} />
              <Bar dataKey="total_leads" name="Leads" radius={[8, 8, 0, 0]} fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Horas con más leads entrantes" icon={<Clock3 size={16} className="text-red-600" />}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.hourlyIncoming}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hour" tickFormatter={formatHour} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip labelFormatter={(hour) => `Hora ${formatHour(Number(hour))}`} formatter={(value) => formatNumber(asChartNumber(value))} />
              <Line type="monotone" dataKey="total_incoming" name="Incoming" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Leads creados según estado actual" icon={<PieChartIcon size={16} className="text-red-600" />}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusesByNameForPie}
                dataKey="total_leads"
                nameKey="status_name"
                cx="50%"
                cy="50%"
                outerRadius={105}
                label={(entry) => truncateLabel(String(entry.name ?? ''), 18)}
              >
                {statusesByNameForPie.map((entry, index) => (
                  <Cell key={`${entry.status_name}-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatNumber(asChartNumber(value))} labelFormatter={(label) => String(label)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Leads creados por estado + pipeline/personal" icon={<BarChart3 size={16} className="text-red-600" />}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusByPipelineData.rows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="pipeline_name"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => truncateLabel(String(value), 22)}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={58}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatNumber(asChartNumber(value))} />
              {statusByPipelineData.stackKeys.map((key, index) => (
                <Bar key={key} dataKey={key} stackId="statuses" fill={COLORS[index % COLORS.length]} radius={index === statusByPipelineData.stackKeys.length - 1 ? [8, 8, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)]">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Users size={16} className="text-red-600" />
            Top responsables (leads creados)
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            {data.owners.slice(0, 5).map((owner) => (
              <li key={String(owner.responsible_user_id ?? 'null')} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
                <span className="truncate pr-3">{owner.responsible_user_name}</span>
                <span className="font-semibold text-gray-900">{formatNumber(owner.total_leads)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)]">
          <h3 className="text-sm font-semibold text-gray-800">Insights extra</h3>
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            <li className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
              Pipeline/personal top (creados): <span className="font-semibold text-gray-900">{data.summary.top_pipeline?.pipeline_name ?? 'N/D'}</span>
            </li>
            <li className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
              Hora pico incoming: <span className="font-semibold text-gray-900">{data.insights.busiest_hour ? formatHour(data.insights.busiest_hour.hour) : 'N/D'}</span>
            </li>
            <li className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
              Estado más frecuente: <span className="font-semibold text-gray-900">{data.insights.top_status?.status_name ?? 'N/D'}</span>
            </li>
            <li className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
              Win rate referencial (ganados históricos / cerrados creados): <span className="font-semibold text-gray-900">{data.insights.won_rate_over_closed !== null ? `${data.insights.won_rate_over_closed}%` : 'N/D'}</span>
            </li>
            <li className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
              Leads sin pipeline: <span className="font-semibold text-gray-900">{formatNumber(data.insights.orphan_pipeline_leads)}</span>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}

function QuickRangeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
    >
      {label}
    </button>
  );
}

function CompareKpiCard({
  label,
  left,
  right,
  formatter = (value) => formatNumber(Number(value ?? 0)),
}: {
  label: string;
  left: number | null;
  right: number | null;
  formatter?: (value: number | null) => string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-gray-900">A: {formatter(left)}</p>
      <p className="text-sm font-semibold text-gray-900">B: {formatter(right)}</p>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-[0_20px_42px_-34px_rgba(15,23,42,0.9)] border border-gray-200">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function ChartCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)]">
      <h3 className="text-sm font-semibold text-gray-800 inline-flex items-center gap-2 mb-3">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}
