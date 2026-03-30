// ⚠️ IMPORTANTE:
// - CLAVE (izquierda): nombre técnico real de la hoja (backend/procesos).
// - VALOR (derecha): etiqueta visual para UI (editable sin romper procesos).
// Si quieres cambiar cómo lo ve el usuario, editá SOLO los valores.
const SHEET_LABELS: Record<string, string> = {
  DESTINOS: 'Destinos',
  TARIFAS: 'Tarifas',
  TIENDAS: 'Tiendas',
  COURIER: 'Couriers',
  VENDEDORES: 'Vendedores',
  FULLFILMENT: 'FullFilment',
  ORIGEN: 'Origen',
  RESULTADOS: 'Resultados',
  'TIPO DE PUNTO': 'Tipo de Punto',
  'TIPO DE RECOJO': 'Tipo de Recojo',
  ENVIOS: 'Envíos',
  RECOJOS: 'Recojos',
  'LEADS GANADOS': 'Leads ganados',
};

const BASE_SHEETS = new Set([
  // Mantener estos nombres técnicos alineados con Google Sheets.
  'DESTINOS',
  'TARIFAS',
  'TIENDAS',
  'COURIER',
  'VENDEDORES',
  'FULLFILMENT',
  'ORIGEN',
  'TIPO DE PUNTO',
  'TIPO DE RECOJO',
  'RESULTADOS'
]);

export interface SheetGroups {
  base: string[];
  operativas: string[];
}

export function getSheetLabel(sheetName: string): string {
  return SHEET_LABELS[sheetName] ?? sheetName;
}

export function groupSheetsByDomain(sheets: string[]): SheetGroups {
  return sheets.reduce<SheetGroups>(
    (acc, sheet) => {
      if (BASE_SHEETS.has(sheet)) {
        acc.base.push(sheet);
      } else {
        acc.operativas.push(sheet);
      }

      return acc;
    },
    { base: [], operativas: [] }
  );
}
