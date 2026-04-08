import { useState, type FormEvent } from 'react';
import { ExternalLink, Send, Table2 } from 'lucide-react';

type ExportResource = 'ENVIOS' | 'LEADS GANADOS';

type ExportJob = {
  id: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  processed_rows: number;
  exported_rows: number;
  error_message: string | null;
  request: {
    resource: ExportResource;
    date_from: string;
    date_to: string;
    destination: {
      spreadsheet_id: string;
      sheet_name: string;
    };
  };
  updated_at: string;
};

const defaultFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const defaultTo = new Date().toISOString().slice(0, 10);

export function GoogleSheetsExportTester() {
  const [resource, setResource] = useState<ExportResource>('ENVIOS');
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<ExportJob | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/export/google-sheets/jobs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource,
          date_from: dateFrom,
          date_to: dateTo,
          destination: {
            spreadsheet_id: spreadsheetId.trim(),
            sheet_name: sheetName.trim(),
          },
          run_now: true,
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        setError(payload?.error ?? 'No se pudo ejecutar la exportación.');
        return;
      }

      setJob(payload.job as ExportJob);
      setMessage('Exportación ejecutada. Revisá estado y filas exportadas abajo.');
    } catch {
      setError('Error de red al intentar exportar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const spreadsheetLink = spreadsheetId.trim()
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId.trim()}`
    : null;

  return (
    <div className="space-y-6">
      <header className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Exportaciones</p>
        <h1 className="mt-2 inline-flex items-center gap-2 text-2xl font-extrabold uppercase tracking-[0.08em] text-gray-900">
          <Table2 className="text-red-600" size={22} />
          Google Sheets Export Tester
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Esta sección es para probar exportación de BD → Google Sheets (sin extracción desde Sheets).
        </p>
      </header>

      <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)]">
        <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="space-y-2 text-sm font-semibold text-gray-700">
            Recurso
            <select
              value={resource}
              onChange={(event) => setResource(event.target.value as ExportResource)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="ENVIOS">ENVIOS</option>
              <option value="LEADS GANADOS">LEADS GANADOS</option>
            </select>
          </label>

          <label className="space-y-2 text-sm font-semibold text-gray-700">
            Nombre de hoja destino
            <input
              value={sheetName}
              onChange={(event) => setSheetName(event.target.value)}
              placeholder="Ej: ENVIOS_MARZO_2026"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm"
              required
            />
          </label>

          <label className="space-y-2 text-sm font-semibold text-gray-700">
            Desde
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm"
              required
            />
          </label>

          <label className="space-y-2 text-sm font-semibold text-gray-700">
            Hasta
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm"
              required
            />
          </label>

          <label className="space-y-2 text-sm font-semibold text-gray-700 md:col-span-2">
            Spreadsheet ID destino
            <input
              value={spreadsheetId}
              onChange={(event) => setSpreadsheetId(event.target.value)}
              placeholder="ID del Google Sheet (lo que va entre /d/ y /edit)"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm"
              required
            />
          </label>

          <div className="md:col-span-2 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-500">
              El export reemplaza la hoja destino con el dataset del rango seleccionado.
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              <Send size={14} />
              {isSubmitting ? 'Exportando...' : 'Exportar ahora'}
            </button>
          </div>
        </form>

        {message ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {job ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <p><span className="font-semibold">Job:</span> {job.id}</p>
            <p><span className="font-semibold">Estado:</span> {job.status}</p>
            <p><span className="font-semibold">Filas procesadas:</span> {job.processed_rows}</p>
            <p><span className="font-semibold">Filas exportadas:</span> {job.exported_rows}</p>
            {job.error_message ? <p className="text-red-700"><span className="font-semibold">Error:</span> {job.error_message}</p> : null}
          </div>
        ) : null}

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-2">
          <p className="font-semibold uppercase tracking-[0.12em]">Configuración necesaria</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Variables de entorno: <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code> y <code>GOOGLE_PRIVATE_KEY</code>.</li>
            <li>No hace falta <code>GOOGLE_SHEET_ID</code> para este flujo nuevo (el usuario pasa su propio spreadsheet ID).</li>
            <li>Debes compartir el Google Sheet destino con el email de service account (Editor).</li>
          </ul>
          {spreadsheetLink ? (
            <a
              href={spreadsheetLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 font-semibold text-amber-900 underline"
            >
              Abrir sheet destino
              <ExternalLink size={12} />
            </a>
          ) : null}
        </div>
      </section>
    </div>
  );
}
