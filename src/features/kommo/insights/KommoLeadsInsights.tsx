import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
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

const EXPORT_COLOR_PROPERTIES = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
  'stop-color',
] as const;

const EXPORT_NEUTRALIZED_PROPERTIES = new Set([
  'background-image',
  'box-shadow',
  'text-shadow',
  'filter',
  'backdrop-filter',
  'mask',
  'mask-image',
  '-webkit-mask',
  '-webkit-mask-image',
  'clip-path',
]);

const EXPORT_COLOR_PROPERTY_SET = new Set<string>(EXPORT_COLOR_PROPERTIES);

const exportColorResolver = (() => {
  let element: HTMLSpanElement | null = null;

  return (value: string) => {
    if (typeof document === 'undefined') return value;

    if (!element) {
      element = document.createElement('span');
      element.setAttribute('aria-hidden', 'true');
      element.style.position = 'fixed';
      element.style.left = '-100000px';
      element.style.top = '0';
      element.style.pointerEvents = 'none';
      document.body.appendChild(element);
    }

    element.style.color = '';
    element.style.color = value;
    return window.getComputedStyle(element).color || value;
  };
})();

function hasUnsupportedColorFunction(value: string) {
  return /oklch\s*\(|oklab\s*\(/i.test(value);
}

function sanitizeExportPropertyValue(property: string, value: string) {
  if (!value) return null;

  if (EXPORT_NEUTRALIZED_PROPERTIES.has(property)) {
    return 'none';
  }

  if (!hasUnsupportedColorFunction(value)) {
    return value;
  }

  if (EXPORT_COLOR_PROPERTY_SET.has(property)) {
    return exportColorResolver(value);
  }

  if (property === 'background' || property === 'background-color') {
    return '#ffffff';
  }

  if (property.startsWith('border') && property.endsWith('color')) {
    return exportColorResolver(value);
  }

  return null;
}

function applyExportSafeStyles(sourceElement: Element, targetElement: Element) {
  if (!(targetElement instanceof HTMLElement || targetElement instanceof SVGElement)) return;

  const computedStyle = window.getComputedStyle(sourceElement);

  for (const property of Array.from(computedStyle)) {
    if (property.startsWith('--')) continue;

    const sanitizedValue = sanitizeExportPropertyValue(property, computedStyle.getPropertyValue(property));
    if (!sanitizedValue) continue;

    targetElement.style.setProperty(property, sanitizedValue, computedStyle.getPropertyPriority(property));
  }

  targetElement.removeAttribute('class');

  if (targetElement instanceof SVGElement) {
    targetElement.removeAttribute('filter');
    targetElement.removeAttribute('mask');
  }

  targetElement.style.setProperty('background-image', 'none');
  targetElement.style.setProperty('box-shadow', 'none');
  targetElement.style.setProperty('text-shadow', 'none');
  targetElement.style.setProperty('filter', 'none');
  targetElement.style.setProperty('backdrop-filter', 'none');
  targetElement.style.setProperty('mask', 'none');
  targetElement.style.setProperty('-webkit-mask', 'none');
  targetElement.style.setProperty('transition', 'none');
  targetElement.style.setProperty('animation', 'none');

  if (targetElement instanceof HTMLElement) {
    targetElement.style.setProperty('color-scheme', 'light');
  }
}

function createSafeExportClone(sourceNode: HTMLDivElement) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.all = 'initial';
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${sourceNode.scrollWidth}px`;
  host.style.pointerEvents = 'none';
  host.style.opacity = '1';
  host.style.zIndex = '-1';
  host.style.background = '#ffffff';
  host.style.isolation = 'isolate';
  host.style.contain = 'layout style paint';

  const clone = sourceNode.cloneNode(true) as HTMLDivElement;
  clone.style.width = `${sourceNode.scrollWidth}px`;
  clone.style.maxWidth = 'none';
  clone.style.background = '#ffffff';
  clone.style.color = '#111827';

  const sourceElements = [sourceNode, ...Array.from(sourceNode.querySelectorAll('*'))];
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll('*'))];

  for (let index = 0; index < sourceElements.length; index += 1) {
    const sourceElement = sourceElements[index];
    const cloneElement = cloneElements[index];
    if (!sourceElement || !cloneElement) continue;
    applyExportSafeStyles(sourceElement, cloneElement);
    cloneElement.removeAttribute('class');
  }

  host.appendChild(clone);
  document.body.appendChild(host);

  return {
    host,
    clone,
    cleanup: () => {
      host.remove();
    },
  };
}

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

export function KommoLeadsInsights() {
  const [draftStartDate, setDraftStartDate] = useState<string | null>(null);
  const [draftEndDate, setDraftEndDate] = useState<string | null>(null);
  const [appliedStartDate, setAppliedStartDate] = useState<string | null>(null);
  const [appliedEndDate, setAppliedEndDate] = useState<string | null>(null);
  const [pipelineAKey, setPipelineAKey] = useState<string>('');
  const [pipelineBKey, setPipelineBKey] = useState<string>('');
  const [exportTimestamp, setExportTimestamp] = useState<string>('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const exportContentRef = useRef<HTMLDivElement | null>(null);

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

    const keys = performance.map((item) => String(item.pipeline_id ?? 'null'));
    if (!pipelineAKey || !keys.includes(pipelineAKey)) {
      setPipelineAKey(keys[0] ?? '');
    }

    if (!pipelineBKey || !keys.includes(pipelineBKey) || pipelineBKey === pipelineAKey) {
      setPipelineBKey(keys[1] ?? keys[0] ?? '');
    }
  }, [insightsQuery.data?.pipelinePerformance, pipelineAKey, pipelineBKey]);

  const selectedPipelineA = useMemo(
    () => insightsQuery.data?.pipelinePerformance.find((pipeline) => String(pipeline.pipeline_id ?? 'null') === pipelineAKey) ?? null,
    [insightsQuery.data?.pipelinePerformance, pipelineAKey],
  );

  const selectedPipelineB = useMemo(
    () => insightsQuery.data?.pipelinePerformance.find((pipeline) => String(pipeline.pipeline_id ?? 'null') === pipelineBKey) ?? null,
    [insightsQuery.data?.pipelinePerformance, pipelineBKey],
  );

  const pipelineComparisonChartData = useMemo(() => {
    if (!selectedPipelineA || !selectedPipelineB) return [];
    return [
      { metric: 'Total', pipelineA: selectedPipelineA.total_leads, pipelineB: selectedPipelineB.total_leads },
      { metric: 'Abiertos', pipelineA: selectedPipelineA.open_leads, pipelineB: selectedPipelineB.open_leads },
      { metric: 'Cerrados', pipelineA: selectedPipelineA.closed_leads, pipelineB: selectedPipelineB.closed_leads },
      { metric: 'Ganados', pipelineA: selectedPipelineA.won_leads, pipelineB: selectedPipelineB.won_leads },
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
    if (!exportContentRef.current || isExportingPdf) return;

    const generatedAt = new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());

    setIsExportingPdf(true);
    setExportTimestamp(generatedAt);

    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const exportNode = exportContentRef.current;
      if (!exportNode) return;

      const { clone, cleanup } = createSafeExportClone(exportNode);

      let canvas: HTMLCanvasElement;

      try {
        canvas = await html2canvas(clone, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false,
          width: clone.scrollWidth,
          height: clone.scrollHeight,
          windowWidth: clone.scrollWidth,
          windowHeight: clone.scrollHeight,
        });
      } finally {
        cleanup();
      }

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;
      const imageData = canvas.toDataURL('image/png');
      const imageHeight = (canvas.height * printableWidth) / canvas.width;

      let remainingHeight = imageHeight;
      let offsetY = margin;

      pdf.addImage(imageData, 'PNG', margin, offsetY, printableWidth, imageHeight, undefined, 'FAST');
      remainingHeight -= printableHeight;

      while (remainingHeight > 0) {
        pdf.addPage('a4', 'landscape');
        offsetY = margin - (imageHeight - remainingHeight);
        pdf.addImage(imageData, 'PNG', margin, offsetY, printableWidth, imageHeight, undefined, 'FAST');
        remainingHeight -= printableHeight;
      }

      const filenameStart = appliedStartDate ?? 'sin-inicio';
      const filenameEnd = appliedEndDate ?? 'sin-fin';
      pdf.save(`leads-insights-${filenameStart}-${filenameEnd}.pdf`);
    } catch (error) {
      console.error('No se pudo exportar Leads Insights a PDF', error);
      window.alert('No se pudo exportar el PDF. Probá nuevamente.');
    } finally {
      setIsExportingPdf(false);
    }
  }, [appliedEndDate, appliedStartDate, isExportingPdf]);

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
    <>
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
          Filtro aplicado: {appliedRangeLabel}
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
      <div className="pointer-events-none fixed -left-[200vw] top-0 w-[1280px] bg-white p-8 text-gray-900">
        <div ref={exportContentRef} className="space-y-6 bg-white">
          <section className="rounded-2xl border border-gray-200 bg-white px-6 py-5 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.2)]">
            <h2 className="text-2xl font-extrabold text-gray-900 inline-flex items-center gap-2">
              <Activity className="text-red-600" size={22} />
              Leads Insights — Exportación PDF
            </h2>
            <p className="mt-2 text-sm text-gray-600">Rango aplicado: {appliedRangeLabel}</p>
            <p className="text-sm text-gray-600">Generado: {exportTimestamp || 'en este momento'}</p>
            <p className="text-sm text-gray-600">Zona horaria de entrada: {data.timezone ?? 'America/Lima'}.</p>
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
      </div>
    </>
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
  if (data.summary.total_leads === 0) {
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
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Leads totales" value={formatNumber(data.summary.total_leads)} />
        <KpiCard title="Leads abiertos" value={formatNumber(data.summary.total_open)} />
        <KpiCard title="Leads cerrados" value={formatNumber(data.summary.total_closed)} />
        <KpiCard title="Ticket promedio" value={formatCurrency(data.summary.avg_price)} />
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)]">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
          <BarChart3 size={16} className="text-red-600" />
          Comparación de Personal
        </h3>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
            Personal A
            <select
              value={pipelineAKey}
              onChange={(event) => onPipelineAChange(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-200"
            >
              {(data.pipelinePerformance ?? []).map((pipeline) => (
                <option key={`a-${String(pipeline.pipeline_id ?? 'null')}-${pipeline.pipeline_name}`} value={String(pipeline.pipeline_id ?? 'null')}>
                  {pipeline.pipeline_name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
            Personal B
            <select
              value={pipelineBKey}
              onChange={(event) => onPipelineBChange(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-200"
            >
              {(data.pipelinePerformance ?? []).map((pipeline) => (
                <option key={`b-${String(pipeline.pipeline_id ?? 'null')}-${pipeline.pipeline_name}`} value={String(pipeline.pipeline_id ?? 'null')}>
                  {pipeline.pipeline_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedPipelineA && selectedPipelineB ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
              <CompareKpiCard label="Total leads" left={selectedPipelineA.total_leads} right={selectedPipelineB.total_leads} />
              <CompareKpiCard label="Open" left={selectedPipelineA.open_leads} right={selectedPipelineB.open_leads} />
              <CompareKpiCard label="Closed" left={selectedPipelineA.closed_leads} right={selectedPipelineB.closed_leads} />
              <CompareKpiCard label="Won" left={selectedPipelineA.won_leads} right={selectedPipelineB.won_leads} />
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
        <ChartCard title="Leads según Personal" icon={<Layers size={16} className="text-red-600" />}>
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
        <ChartCard title="Leads según estado" icon={<PieChartIcon size={16} className="text-red-600" />}>
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

        <ChartCard title="Leads por estado + personal" icon={<BarChart3 size={16} className="text-red-600" />}>
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
            Top Personal
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
              Personal top: <span className="font-semibold text-gray-900">{data.summary.top_pipeline?.pipeline_name ?? 'N/D'}</span>
            </li>
            <li className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
              Hora pico incoming: <span className="font-semibold text-gray-900">{data.insights.busiest_hour ? formatHour(data.insights.busiest_hour.hour) : 'N/D'}</span>
            </li>
            <li className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
              Estado más frecuente: <span className="font-semibold text-gray-900">{data.insights.top_status?.status_name ?? 'N/D'}</span>
            </li>
            <li className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
              Win rate (sobre cerrados): <span className="font-semibold text-gray-900">{data.insights.won_rate_over_closed !== null ? `${data.insights.won_rate_over_closed}%` : 'N/D'}</span>
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
