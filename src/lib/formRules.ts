import { normalizeText, parseDateValue, parseNumericValue } from './tableHelpers';

export type FormInputType = 'text' | 'textarea' | 'number' | 'date' | 'email' | 'tel';

interface SheetFormRule {
  hiddenColumns?: string[];
  readOnlyColumns?: string[];
  inputOverrides?: Record<string, FormInputType>;
}

const DEFAULT_SHEET_FORM_RULE: SheetFormRule = {
  hiddenColumns: [],
  readOnlyColumns: [],
  inputOverrides: {},
};

// ⚠️ IMPORTANTE:
// - Clave: nombre técnico real de la hoja (no cambiar si no cambia la hoja en Google Sheets).
// - hiddenColumns/readOnlyColumns: podés definir columnas no editables por proceso.
// - inputOverrides: podés forzar tipo de input por columna.
//
// Para columnas calculadas automáticas que NO deben editarse, agregalas en `readOnlyColumns`
// de la hoja correspondiente cuando me pases el listado exacto.
export const SHEET_FORM_RULES: Record<string, SheetFormRule> = {
  DESTINOS: {},
  TARIFAS: {
    readOnlyColumns: [
      // Ejemplo futuro: 'Tarifa Final'
    ],
  },
  TIENDAS: {},
  COURIER: {},
  VENDEDORES: {},
  FULLFILMENT: {},
  ORIGEN: {},
  RESULTADOS: {},
  'TIPO DE PUNTO': {},
  'TIPO DE RECOJO': {},
  ENVIOS: {
    readOnlyColumns: [
      // Ejemplo futuro: 'Costo Total'
    ],
  },
  RECOJOS: {
    readOnlyColumns: [
      // Ejemplo futuro: 'Tiempo Estimado'
    ],
  },
  'LEADS GANADOS': {},
};

function normalizeColumnName(columnName: string) {
  return normalizeText(columnName).replace(/\s+/g, ' ').trim();
}

function columnEquals(a: string, b: string) {
  return normalizeColumnName(a) === normalizeColumnName(b);
}

function getSheetRule(sheetName: string): SheetFormRule {
  return SHEET_FORM_RULES[sheetName] ?? DEFAULT_SHEET_FORM_RULE;
}

function hasColumn(columnList: string[] | undefined, targetColumn: string) {
  if (!columnList?.length) return false;
  return columnList.some((column) => columnEquals(column, targetColumn));
}

export function isIdLikeColumn(columnName: string): boolean {
  const normalized = normalizeColumnName(columnName);

  if (normalized === 'id' || normalized === '_id' || normalized === '__id') {
    return true;
  }

  return normalized.startsWith('id ') || normalized.endsWith(' id');
}

export function isHiddenFormColumn(sheetName: string, columnName: string): boolean {
  if (isIdLikeColumn(columnName)) return true;

  const rule = getSheetRule(sheetName);
  return hasColumn(rule.hiddenColumns, columnName);
}

export function isReadOnlyFormColumn(sheetName: string, columnName: string): boolean {
  if (isIdLikeColumn(columnName)) return true;

  const rule = getSheetRule(sheetName);
  return hasColumn(rule.readOnlyColumns, columnName);
}

function getOverrideType(sheetName: string, columnName: string): FormInputType | null {
  const rule = getSheetRule(sheetName);
  const entries = Object.entries(rule.inputOverrides ?? {});
  const found = entries.find(([key]) => columnEquals(key, columnName));
  return found?.[1] ?? null;
}

const EMAIL_KEYWORDS = ['correo', 'email', 'mail'];
const PHONE_KEYWORDS = ['telefono', 'teléfono', 'celular', 'whatsapp', 'fono'];
const DATE_KEYWORDS = ['fecha', 'date', 'dia', 'día'];
const NUMBER_KEYWORDS = [
  'cantidad',
  'monto',
  'precio',
  'costo',
  'tarifa',
  'total',
  'saldo',
  'importe',
  'peso',
  'valor',
  'comision',
  'comisión',
  'distancia',
  'km',
];
const TEXTAREA_KEYWORDS = ['observacion', 'observación', 'detalle', 'direccion', 'dirección', 'comentario', 'nota'];

function hasKeyword(columnName: string, keywords: string[]) {
  const normalized = normalizeText(columnName);
  return keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
}

export function inferFormInputType(
  sheetName: string,
  columnName: string,
  sampleValue: unknown,
): FormInputType {
  const overrideType = getOverrideType(sheetName, columnName);
  if (overrideType) return overrideType;

  if (hasKeyword(columnName, EMAIL_KEYWORDS)) return 'email';
  if (hasKeyword(columnName, PHONE_KEYWORDS)) return 'tel';
  if (hasKeyword(columnName, TEXTAREA_KEYWORDS)) return 'textarea';

  if (hasKeyword(columnName, DATE_KEYWORDS)) {
    if (sampleValue === null || sampleValue === undefined || sampleValue === '' || parseDateValue(sampleValue)) {
      return 'date';
    }
  }

  if (hasKeyword(columnName, NUMBER_KEYWORDS)) {
    if (sampleValue === null || sampleValue === undefined || sampleValue === '' || parseNumericValue(sampleValue) !== null) {
      return 'number';
    }
  }

  if (typeof sampleValue === 'number' && Number.isFinite(sampleValue)) {
    return 'number';
  }

  return 'text';
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function formatInputValueByType(inputType: FormInputType, value: unknown): string {
  if (value === null || value === undefined) return '';

  if (inputType === 'date') {
    const parsedDate = parseDateValue(value);
    if (!parsedDate) return '';

    return `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}`;
  }

  if (inputType === 'number') {
    const parsedNumber = parseNumericValue(value);
    if (parsedNumber === null) return '';
    return String(parsedNumber);
  }

  return String(value);
}
