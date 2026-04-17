import { useMemo, useState } from 'react';
import { X, Database, RefreshCw, Play, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { getGroupedKommoResources } from '../config/kommoResourceConfig';

interface SyncResource {
  name: string;
  status: 'idle' | 'running' | 'success' | 'error';
  message?: string;
}

interface KommoSyncPanelProps {
  onClose: () => void;
}

type SyncJobParam = {
  key: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
};

type SyncJobDefinition = {
  id: string;
  label: string;
  description: string;
  path: string;
  fixedParams?: Record<string, string>;
  params: SyncJobParam[];
  method?: 'GET' | 'POST';
};

const SYNC_JOBS: SyncJobDefinition[] = [
  {
    id: 'kommo-envios-cursor',
    label: 'Kommo → Envíos (cursor)',
    description: 'Sincroniza envíos desde Dinsides con cursor incremental.',
    path: '/api/kommo/sync',
    fixedParams: { mode: 'dinsides_envios_sync_cursor' },
    params: [
      { key: 'batch_leads', label: 'Batch leads', defaultValue: '120' },
      { key: 'limit_rows', label: 'Límite filas', defaultValue: '2000' },
      { key: 'cursor', label: 'Cursor', defaultValue: '0' },
      { key: 'search_negocio', label: 'Buscar negocio (opcional)', defaultValue: '', placeholder: 'Nombre tienda' },
      { key: 'debug', label: 'Debug (true/false)', defaultValue: 'false' },
    ],
  },
  {
    id: 'kommo-recojos-cursor',
    label: 'Kommo → Recojos (cursor)',
    description: 'Sincroniza recojos desde Dinsides con cursor incremental.',
    path: '/api/kommo/sync',
    fixedParams: { mode: 'dinsides_recojos_sync_cursor' },
    params: [
      { key: 'batch_leads', label: 'Batch leads', defaultValue: '120' },
      { key: 'limit_rows', label: 'Límite filas', defaultValue: '2000' },
      { key: 'cursor', label: 'Cursor', defaultValue: '0' },
      { key: 'max_runtime_ms', label: 'Max runtime (ms)', defaultValue: '45000' },
      { key: 'search_negocio', label: 'Buscar negocio (opcional)', defaultValue: '', placeholder: 'Nombre tienda' },
      { key: 'debug', label: 'Debug (true/false)', defaultValue: 'false' },
    ],
  },
  {
    id: 'meta-ads-sync',
    label: 'Meta Ads Sync',
    description: 'Sincroniza métricas de anuncios de Meta.',
    path: '/api/meta/ads/sync',
    params: [
      { key: 'date_preset', label: 'Date preset', defaultValue: 'last_30d' },
      { key: 'time_increment', label: 'Time increment', defaultValue: '1' },
      { key: 'limit', label: 'Límite', defaultValue: '100' },
      { key: 'max_pages', label: 'Max pages', defaultValue: '5' },
      { key: 'max_runtime_ms', label: 'Max runtime (ms)', defaultValue: '45000' },
    ],
  },
  {
    id: 'meta-pages-sync',
    label: 'Meta Pages Sync',
    description: 'Sincroniza contenido orgánico de páginas de Meta.',
    path: '/api/meta/ads/sync',
    fixedParams: { resource: 'pages' },
    params: [
      { key: 'latest_monthly', label: 'Latest monthly (0/1)', defaultValue: '1' },
      { key: 'post_limit', label: 'Post limit', defaultValue: '100' },
      { key: 'post_max_pages', label: 'Post max pages', defaultValue: '20' },
      { key: 'max_runtime_ms', label: 'Max runtime (ms)', defaultValue: '45000' },
    ],
  },
  {
    id: 'youtube-sync',
    label: 'YouTube Sync',
    description: 'Sincroniza canal + videos.',
    path: '/api/youtube',
    fixedParams: { mode: 'sync' },
    params: [
      { key: 'channel_id', label: 'Channel ID', defaultValue: 'UCS9a3juMIrRfeXrRjd9DDlw' },
      { key: 'max_pages', label: 'Max pages', defaultValue: '12' },
      { key: 'max_runtime_ms', label: 'Max runtime (ms)', defaultValue: '45000' },
    ],
  },
  {
    id: 'youtube-analytics-sync',
    label: 'YouTube Analytics Sync',
    description: 'Sincroniza analytics de YouTube.',
    path: '/api/youtube',
    fixedParams: { mode: 'analytics' },
    params: [
      { key: 'use_mine', label: 'Use mine (0/1)', defaultValue: '1' },
      { key: 'channel_id', label: 'Channel ID (opcional)', defaultValue: '' },
      { key: 'start_date', label: 'Start date (YYYY-MM-DD)', defaultValue: '' },
      { key: 'end_date', label: 'End date (YYYY-MM-DD)', defaultValue: '' },
      { key: 'max_runtime_ms', label: 'Max runtime (ms)', defaultValue: '45000' },
    ],
  },
];

const GROUP_SECTION_TITLES = {
  core: 'Recursos principales',
  relationships: 'Relaciones y vinculaciones',
  metadata: 'Configuraciones y catálogos',
  activity: 'Actividad y seguimiento',
} as const;

export function KommoSyncPanel({ onClose }: KommoSyncPanelProps) {
  const [resources, setResources] = useState<Record<string, SyncResource>>({});
  const [jobRuns, setJobRuns] = useState<Record<string, SyncResource>>({});
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(SYNC_JOBS[0]?.id ?? '');
  const [jobParams, setJobParams] = useState<Record<string, string>>(() => {
    const first = SYNC_JOBS[0];
    if (!first) return {};
    return Object.fromEntries(first.params.map((param) => [param.key, param.defaultValue]));
  });

  const groupedResources = useMemo(() => getGroupedKommoResources(), []);
  const allResources = useMemo(
    () => groupedResources.flatMap((section) => section.resources.map((resource) => resource.key)),
    [groupedResources],
  );

  const selectedJob = useMemo(
    () => SYNC_JOBS.find((job) => job.id === selectedJobId) ?? SYNC_JOBS[0] ?? null,
    [selectedJobId],
  );

  const syncJobOptions = useMemo(
    () => SYNC_JOBS.map((job) => ({ value: job.id, label: job.label })),
    [],
  );

  const runSync = async (resource: string, opts?: { autoProcessEvents?: boolean }) => {
    setResources((prev) => ({
      ...prev,
      [resource]: { name: resource, status: 'running', message: 'Sincronizando...' },
    }));

    try {
      const res = await fetch(`/api/kommo/sync?resource=${resource}`);

      const data = await res.json();

      if (res.ok) {
        setResources((prev) => ({
          ...prev,
          [resource]: {
            name: resource,
            status: 'success',
            message: `Pulled: ${data.totalPulled}, Staged: ${data.totalStaged}`,
          },
        }));

        if (opts?.autoProcessEvents !== false) {
          await runProcessEvents();
        }
      } else {
        setResources((prev) => ({
          ...prev,
          [resource]: { name: resource, status: 'error', message: data.error || 'Error desconocido' },
        }));
      }
    } catch {
      setResources((prev) => ({
        ...prev,
        [resource]: { name: resource, status: 'error', message: 'Error de red' },
      }));
    }
  };

  const runProcessEvents = async () => {
    try {
      await fetch('/api/kommo/process-events');
    } catch (e) {
      console.error('Process events failed:', e);
    }
  };

  const resetJobParams = (jobId: string) => {
    const job = SYNC_JOBS.find((item) => item.id === jobId);
    if (!job) return;
    setJobParams(Object.fromEntries(job.params.map((param) => [param.key, param.defaultValue])));
  };

  const buildSyncJobUrl = (job: SyncJobDefinition, values: Record<string, string>) => {
    const params = new URLSearchParams();

    if (job.fixedParams) {
      for (const [key, value] of Object.entries(job.fixedParams)) {
        params.set(key, value);
      }
    }

    for (const param of job.params) {
      const raw = values[param.key] ?? '';
      if (!raw.trim()) continue;
      params.set(param.key, raw.trim());
    }

    const query = params.toString();
    return query ? `${job.path}?${query}` : job.path;
  };

  const runSyncJob = async () => {
    if (!selectedJob) return;

    const key = selectedJob.id;
    setJobRuns((prev) => ({
      ...prev,
      [key]: { name: selectedJob.label, status: 'running', message: 'Sincronizando...' },
    }));

    try {
      const url = buildSyncJobUrl(selectedJob, jobParams);
      const response = await fetch(url, { method: selectedJob.method ?? 'POST' });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const errorMessage = typeof payload.error === 'string' ? payload.error : 'Error desconocido';
        setJobRuns((prev) => ({
          ...prev,
          [key]: { name: selectedJob.label, status: 'error', message: errorMessage },
        }));
        return;
      }

      const summary = [
        payload.totalPulled !== undefined ? `Pulled: ${String(payload.totalPulled)}` : null,
        payload.totalStaged !== undefined ? `Staged: ${String(payload.totalStaged)}` : null,
        payload.processed !== undefined ? `Processed: ${String(payload.processed)}` : null,
        payload.returned_rows !== undefined ? `Rows: ${String(payload.returned_rows)}` : null,
      ].filter(Boolean).join(' • ');

      setJobRuns((prev) => ({
        ...prev,
        [key]: {
          name: selectedJob.label,
          status: 'success',
          message: summary || 'Sync ejecutado correctamente',
        },
      }));

      if (selectedJob.path.startsWith('/api/kommo/')) {
        await runProcessEvents();
      }

      setIsJobModalOpen(false);
    } catch {
      setJobRuns((prev) => ({
        ...prev,
        [key]: { name: selectedJob.label, status: 'error', message: 'Error de red' },
      }));
    }
  };

  const runAllSync = async () => {
    for (const resource of allResources) {
      await runSync(resource, { autoProcessEvents: false });
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    await runProcessEvents();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Database className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Kommo Sync Panel</h2>
              <p className="text-xs text-gray-500">Sincronización de recursos API</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex gap-3">
          <button
            onClick={runAllSync}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors"
          >
            <Play className="w-4 h-4" />
            Sync All
          </button>
          <button
            onClick={runProcessEvents}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Process Events
          </button>
          <button
            onClick={() => {
              setIsJobModalOpen(true);
              if (!selectedJob) {
                const first = SYNC_JOBS[0];
                if (first) {
                  setSelectedJobId(first.id);
                  resetJobParams(first.id);
                }
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Play className="w-4 h-4" />
            Sync avanzado
          </button>
        </div>

        {Object.keys(jobRuns).length > 0 && (
          <div className="px-6 py-3 border-b border-gray-200 bg-white/70">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">Últimos sync avanzados</h3>
            <div className="space-y-2">
              {Object.entries(jobRuns).map(([key, state]) => (
                <div
                  key={key}
                  className={`text-xs rounded-lg px-3 py-2 border ${
                    state.status === 'success'
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : state.status === 'error'
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : state.status === 'running'
                          ? 'bg-orange-50 border-orange-200 text-orange-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600'
                  }`}
                >
                  <span className="font-semibold">{state.name}</span>
                  {state.message ? <span className="ml-2">• {state.message}</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {groupedResources.map((section) => (
            <section key={section.group} className="space-y-3">
              <header>
                <h3 className="text-sm font-semibold text-gray-900">{GROUP_SECTION_TITLES[section.group]}</h3>
                <p className="text-xs text-gray-500">{section.label}</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {section.resources.map((resourceConfig) => {
                  const resource = resourceConfig.key;
                  const state = resources[resource] || { name: resource, status: 'idle' as const };

                  return (
                    <button
                     key={resource}
                       onClick={() => runSync(resource)}
                       disabled={state.status === 'running'}
                       className={`
                         relative flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition-all
                        ${state.status === 'idle' ? 'border-gray-200 hover:border-orange-400 hover:bg-orange-50' : ''}
                        ${state.status === 'running' ? 'border-orange-300 bg-orange-50' : ''}
                        ${state.status === 'success' ? 'border-green-300 bg-green-50' : ''}
                        ${state.status === 'error' ? 'border-red-300 bg-red-50' : ''}
                        disabled:cursor-not-allowed
                      `}
                      title={resourceConfig.label}
                    >
                      {state.status === 'running' && (
                        <Loader2 className="w-4 h-4 text-orange-600 animate-spin absolute top-2 right-2" />
                      )}
                      {state.status === 'success' && <CheckCircle className="w-4 h-4 text-green-600 absolute top-2 right-2" />}
                      {state.status === 'error' && <AlertCircle className="w-4 h-4 text-red-600 absolute top-2 right-2" />}

                      <div className="min-w-0">
                        <span className="font-medium text-sm text-gray-700 block">{resourceConfig.label}</span>
                        <span className="text-[11px] text-gray-500 block">{resource}</span>
                        {state.message && <span className="text-xs text-gray-500 block truncate w-full mt-1">{state.message}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
          Panel de administración • Endpoints: /api/kommo/sync
        </div>
      </div>

      {isJobModalOpen && selectedJob && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Configurar sync</h3>
                <p className="text-xs text-gray-500 mt-0.5">Elegí el tipo de sync y ajustá parámetros.</p>
              </div>
              <button onClick={() => setIsJobModalOpen(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de sync</span>
                <select
                  value={selectedJobId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setSelectedJobId(nextId);
                    resetJobParams(nextId);
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {syncJobOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                {selectedJob.description}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedJob.params.map((param) => (
                  <label key={param.key} className="block space-y-1">
                    <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">{param.label}</span>
                    <input
                      value={jobParams[param.key] ?? ''}
                      placeholder={param.placeholder ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setJobParams((prev) => ({ ...prev, [param.key]: value }));
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsJobModalOpen(false)}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={runSyncJob}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Ejecutar sync
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
