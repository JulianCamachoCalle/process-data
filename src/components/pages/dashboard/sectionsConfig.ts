import { PRIMARY_ANALYTICS_SHEETS } from '../../../services/sheetsData'
import { getReferencedTablesForSource } from '../../../config/relationalMapping'
import { SPECIAL_SHEETS } from './shared'

export type DashboardSectionKind = 'home' | 'ranking' | 'sheet'

export type DashboardSectionDefinition = {
  id: string
  path: string
  label: string
  description: string
  group: 'principal' | 'primary-data' | 'operational-data'
  kind: DashboardSectionKind
  sheetName?: string
}

const HOME_SECTION: DashboardSectionDefinition = {
  id: 'home',
  path: 'home',
  label: 'Inicio',
  description: 'Vista ejecutiva consolidada de metricas operativas y financieras.',
  group: 'principal',
  kind: 'home',
}

const RANKING_SECTION: DashboardSectionDefinition = {
  id: 'ranking',
  path: 'ranking',
  label: 'Ranking tiendas x vendedor',
  description: 'Ranking de rendimiento por tiendas filtrado por vendedor.',
  group: 'principal',
  kind: 'ranking',
}

const PRIMARY_DATA_SECTIONS: DashboardSectionDefinition[] = [
  { id: 'sheet-vendedores', path: 'hojas/vendedores', label: 'VENDEDORES', description: 'Manejo de datos vendedores.', group: 'primary-data', kind: 'sheet', sheetName: 'VENDEDORES' },
  { id: 'sheet-tiendas', path: 'hojas/tiendas', label: 'TIENDAS', description: 'Manejo de datos tiendas.', group: 'primary-data', kind: 'sheet', sheetName: 'TIENDAS' },
  { id: 'sheet-aplicativos', path: 'hojas/aplicativos', label: 'APLICATIVOS', description: 'Manejo de datos aplicativos.', group: 'primary-data', kind: 'sheet', sheetName: 'APLICATIVOS' },
  { id: 'sheet-courier', path: 'hojas/courier', label: 'COURIER', description: 'Manejo de datos courier.', group: 'primary-data', kind: 'sheet', sheetName: 'COURIER' },
  { id: 'sheet-origen', path: 'hojas/origen', label: 'ORIGEN', description: 'Manejo de datos origen.', group: 'primary-data', kind: 'sheet', sheetName: 'ORIGEN' },
  { id: 'sheet-destinos', path: 'hojas/destinos', label: 'DESTINOS', description: 'Manejo de datos destinos.', group: 'primary-data', kind: 'sheet', sheetName: 'DESTINOS' },
  { id: 'sheet-tipo-punto', path: 'hojas/tipo-de-punto', label: 'TIPO DE PUNTO', description: 'Manejo de datos maestros.', group: 'primary-data', kind: 'sheet', sheetName: 'TIPO DE PUNTO' },
  { id: 'sheet-tipo-recojo', path: 'hojas/tipo-recojo', label: 'TIPO RECOJO', description: 'Manejo de datos maestros.', group: 'primary-data', kind: 'sheet', sheetName: 'TIPO RECOJO' },
  { id: 'sheet-resultados', path: 'hojas/resultados', label: 'RESULTADOS', description: 'Manejo de datos maestros.', group: 'primary-data', kind: 'sheet', sheetName: 'RESULTADOS' },
  { id: 'sheet-fullfilment', path: 'hojas/fullfilment', label: 'FULLFILMENT', description: 'Manejo de datos maestros.', group: 'primary-data', kind: 'sheet', sheetName: 'FULLFILMENT' },
  { id: 'sheet-tarifas', path: 'hojas/tarifas', label: 'TARIFAS', description: 'Manejo de datos maestros.', group: 'primary-data', kind: 'sheet', sheetName: 'TARIFAS' },
]

const OPERATIONAL_SECTIONS: DashboardSectionDefinition[] = [
  { id: 'sheet-leads-ganados', path: 'hojas/leads-ganados', label: 'LEADS GANADOS', description: 'CRUD de datos operativos.', group: 'operational-data', kind: 'sheet', sheetName: 'LEADS GANADOS' },
  { id: 'sheet-data-envios', path: 'hojas/data-envios', label: 'ENVIOS', description: 'CRUD de datos operativos.', group: 'operational-data', kind: 'sheet', sheetName: 'ENVIOS' },
  { id: 'sheet-recojos', path: 'hojas/recojos', label: 'RECOJOS', description: 'CRUD de datos operativos.', group: 'operational-data', kind: 'sheet', sheetName: 'RECOJOS' },
]

export const DASHBOARD_SECTIONS: DashboardSectionDefinition[] = [
  HOME_SECTION,
  RANKING_SECTION,
  ...PRIMARY_DATA_SECTIONS,
  ...OPERATIONAL_SECTIONS,
]

export function getSectionById(sectionId: string): DashboardSectionDefinition | null {
  return DASHBOARD_SECTIONS.find((section) => section.id === sectionId) || null
}

export function getSectionByPath(pathname: string): DashboardSectionDefinition | null {
  const normalizedPath = pathname.replace(/\/+$/, '')
  return DASHBOARD_SECTIONS.find((section) => normalizedPath.endsWith(`/dashboard/${section.path}`)) || null
}

export function getRequiredSheetsForSection(section: DashboardSectionDefinition | null): string[] {
  if (!section) return []

  if (section.kind === 'home') {
    return [
      ...new Set([
        ...PRIMARY_ANALYTICS_SHEETS,
        'ENVIOS',
        'RECOJOS',
        'LEADS GANADOS',
        'TIENDAS',
        SPECIAL_SHEETS.commissionsLeads,
      ]),
    ]
  }

  if (section.kind === 'ranking') {
    return ['ENVIOS', 'TIENDAS', 'VENDEDORES', 'RESULTADOS']
  }

  if (section.kind === 'sheet' && section.sheetName) {
    const required = [...new Set([section.sheetName, ...getReferencedTablesForSource(section.sheetName)])]

    if (section.sheetName.toUpperCase() === 'ENVIOS') {
      if (!required.includes('TARIFAS')) required.push('TARIFAS')
      if (!required.includes('LEADS GANADOS')) required.push('LEADS GANADOS')
      if (!required.includes('FULLFILMENT')) required.push('FULLFILMENT')
      if (!required.includes('TIENDAS')) required.push('TIENDAS')
    }

    if (section.sheetName.toUpperCase() === 'RECOJOS') {
      if (!required.includes('LEADS GANADOS')) required.push('LEADS GANADOS')
    }

    return required
  }

  return []
}
