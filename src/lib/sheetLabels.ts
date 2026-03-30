const SHEET_LABELS: Record<string, string> = {
  DESTINOS: 'Destinos',
  TARIFAS: 'Tarifas',
  TIENDAS: 'Tiendas',
  COURIER: 'Mensajerías',
  VENDEDORES: 'Vendedores',
  FULLFILMENT: 'Cumplimiento',
  ORIGEN: 'Origen',
  RESULTADOS: 'Resultados',
  'TIPO DE PUNTO': 'Tipo de punto',
  'TIPO DE RECOJO': 'Tipo de recojo',
  ENVIOS: 'Envíos',
  RECOJOS: 'Recojos',
  'LEADS GANADOS': 'Leads ganados',
};

const BASE_SHEETS = new Set([
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
