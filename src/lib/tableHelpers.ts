const DATE_COLUMN_KEYWORDS = ['fecha', 'date', 'dia', 'día', 'mes', 'month'];
const TYPE_COLUMN_KEYWORDS = ['tipo', 'categoria', 'categoría', 'clase'];

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isDateColumn(columnName: string): boolean {
  const normalized = normalizeText(columnName);
  return DATE_COLUMN_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function isTypeColumn(columnName: string): boolean {
  const normalized = normalizeText(columnName);
  return TYPE_COLUMN_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function parseDateValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  const monthMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    const parsed = new Date(year, month - 1, 1);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const isoYmdMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoYmdMatch) {
    const year = Number(isoYmdMatch[1]);
    const month = Number(isoYmdMatch[2]);
    const day = Number(isoYmdMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (year < 100) year += 2000;

    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const isoDate = new Date(raw);
  if (!Number.isNaN(isoDate.getTime())) return isoDate;

  return null;
}

export function parseNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/\s+/g, '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(/,/g, '.');

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatNumberEs(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCurrencyPen(value: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function isLikelyCurrencyColumn(columnName: string): boolean {
  const normalized = normalizeText(columnName);

  return [
    'cobro',
    'pago',
    'monto',
    'precio',
    'costo',
    'importe',
    'saldo',
    'comision',
    'comisión',
  ].some((keyword) => normalized.includes(normalizeText(keyword)));
}
