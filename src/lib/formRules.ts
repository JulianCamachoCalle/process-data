import { normalizeText, parseDateValue, parseNumericValue } from './tableHelpers';

export type FormInputType = 'text' | 'textarea' | 'number' | 'date' | 'month' | 'email' | 'tel';

interface SheetFormRule {
  hiddenColumns?: string[];
  readOnlyColumns?: string[];
  inputOverrides?: Record<string, FormInputType>;
  uniqueColumns?: string[];
  defaultValues?: Record<string, string>;
}

const DEFAULT_SHEET_FORM_RULE: SheetFormRule = {
  hiddenColumns: [],
  readOnlyColumns: [],
  inputOverrides: {},
  uniqueColumns: [],
  defaultValues: {},
};

// ⚠️ IMPORTANTE:
// - Clave: nombre técnico real de la hoja (no cambiar si no cambia la hoja en Google Sheets).
// - hiddenColumns/readOnlyColumns: podés definir columnas no editables por proceso.
// - inputOverrides: podés forzar tipo de input por columna.
//
// Para columnas calculadas automáticas que NO deben editarse, agregalas en `readOnlyColumns`
// de la hoja correspondiente cuando me pases el listado exacto.
export const SHEET_FORM_RULES: Record<string, SheetFormRule> = {
  DESTINOS: {
    uniqueColumns: ['Destinos'],
  },
  TARIFAS: {
    inputOverrides: {
      'Cobro Entrega': 'number',
      'Pago Moto': 'number',
      Notas: 'textarea',
    },
    defaultValues: {
      'Cobro Entrega': '0',
      'Pago Moto': '0',
    },
    readOnlyColumns: [
      // Ejemplo futuro: 'Tarifa Final'
    ],
  },
  TIENDAS: {
    uniqueColumns: ['Nombre'],
  },
  COURIER: {
    uniqueColumns: ['Nombre'],
  },
  VENDEDORES: {
    uniqueColumns: ['Nombre'],
  },
  FULLFILMENT: {
    uniqueColumns: ['¿Es FullFilment?'],
  },
  ORIGEN: {
    uniqueColumns: ['Opcion'],
  },
  RESULTADOS: {
    uniqueColumns: ['Resultado'],
  },
  'TIPO DE PUNTO': {
    uniqueColumns: ['Tipo de Punto'],
  },
  'TIPO DE RECOJO': {
    uniqueColumns: ['Tipo de Recojo'],
  },
  ENVIOS: {
    inputOverrides: {
      Mes: 'month',
      'Excedente pagado moto': 'number',
      observaciones: 'textarea',
      Observaciones: 'textarea',
    },
    readOnlyColumns: [
      'Cobro Entrega',
      'Pago moto',
      'Extra punto moto',
      'Extra punto empresa',
      'ingreso total fila',
      'Ingreso total fila',
      'costo total fila',
      'Costo total fila',
      'idVendedor',
    ],
    defaultValues: {
      Mes: '__CURRENT_MONTH__',
      'Excedente pagado moto': '0',
    },
  },
  RECOJOS: {
    readOnlyColumns: [
      // Ejemplo futuro: 'Tiempo Estimado'
    ],
  },
  'LEADS GANADOS': {
    inputOverrides: {
      'Fecha ingreso lead': 'date',
      'Fecha registro lead': 'date',
      'Fecha Lead Ganado': 'date',
      Distrito: 'text',
      'Anulados Fullfilment': 'number',
      'Cantidad de envios': 'number',
      Notas: 'textarea',
    },
    readOnlyColumns: [
      'Dias Lead a Registro',
      'Dias Registro a Ganado',
      'Dias lead a ganado',
      'Lead ganado en periodo?',
      'Cantidad de envios',
      'Ingreso anulados fullfilment',
    ],
    defaultValues: {
      'Anulados Fullfilment': '0',
      'Cantidad de envios': '0',
    },
  },
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

  // También contempla IDs de negocio como: idDestinos, idTiendas, idCourier, etc.
  if (normalized.startsWith('id')) {
    return true;
  }

  return normalized.startsWith('id ') || normalized.endsWith(' id');
}

export function getUniqueFormColumns(sheetName: string, availableColumns: string[]): string[] {
  const rule = getSheetRule(sheetName);
  const configuredUnique = rule.uniqueColumns ?? [];

  return availableColumns.filter((availableColumn) =>
    configuredUnique.some((configuredColumn) => columnEquals(configuredColumn, availableColumn)),
  );
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

function getDefaultValueOverride(sheetName: string, columnName: string): string | null {
  const rule = getSheetRule(sheetName);
  const entries = Object.entries(rule.defaultValues ?? {});
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

  if (inputType === 'month') {
    const parsedDate = parseDateValue(value);
    if (parsedDate) {
      return `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}`;
    }

    const raw = String(value ?? '').trim();
    const monthMatch = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
    if (monthMatch) {
      return `${monthMatch[1]}-${monthMatch[2]}`;
    }

    return '';
  }

  return String(value);
}

export function getFormDefaultValue(sheetName: string, columnName: string, inputType: FormInputType): string {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  const override = getDefaultValueOverride(sheetName, columnName);
  if (override !== null) {
    if (override === '__CURRENT_MONTH__') {
      return currentMonth;
    }

    return override;
  }

  if (inputType === 'number') return '';
  if (inputType === 'date') return '';
  if (inputType === 'month') {
    return currentMonth;
  }

  return '';
}
