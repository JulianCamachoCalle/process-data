export type FieldRelationRule = {
    sourceHeaders: string[]
    targetTable: string
    targetValueHeaders: string[]
    targetIdHeaders?: string[]
    allowCustomValue?: boolean
}

function normalizeKey(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

const TABLE_RELATION_MAP: Record<string, FieldRelationRule[]> = {
    [normalizeKey('LEADS GANADOS')]: [
        { sourceHeaders: ['IdFullFilment', 'Fulfillment', 'Fullfilment'], targetTable: 'FULLFILMENT', targetValueHeaders: ['IdFullFilment', 'Opcion', '¿Es FullFilment?'] },
    ],
    [normalizeKey('ENVIOS')]: [
        { sourceHeaders: ['IdTienda'], targetTable: 'TIENDAS', targetValueHeaders: ['IdTienda', 'Nombre'] },
            {
                sourceHeaders: ['IdVendedor', 'Vendedor ID', 'Vendedor'],
                targetTable: 'VENDEDORES',
                targetValueHeaders: ['Nombre vendedor', 'Nombre', 'Vendedor'],
                targetIdHeaders: ['IdVendedor'],
            },
        { sourceHeaders: ['IdDestino'], targetTable: 'DESTINOS', targetValueHeaders: ['IdDestino', 'Destinos'] },
        { sourceHeaders: ['IdResultado'], targetTable: 'RESULTADOS', targetValueHeaders: ['IdResultado', 'Resultado'] },
        { sourceHeaders: ['IdTipoPunto'], targetTable: 'TIPO DE PUNTO', targetValueHeaders: ['IdTipoPunto', 'Tipo Punto'] },
        { sourceHeaders: ['¿Es tienda Fulfillment?', 'Tienda fullfilment', 'Es tienda fulfillment', 'Es tienda fullfilment', 'IdFullFilment'], targetTable: 'FULLFILMENT', targetValueHeaders: ['IdFullFilment', 'Opcion', '¿Es FullFilment?'] },
    ],
    [normalizeKey('RECOJOS')]: [
        { sourceHeaders: ['IdTienda'], targetTable: 'TIENDAS', targetValueHeaders: ['IdTienda', 'Nombre'] },
        {
            sourceHeaders: ['IdTipoRecojo'],    
            targetTable: 'TIPO RECOJO',
            targetValueHeaders: ['Tipo de Recojo'],
            targetIdHeaders: ['IdTipoRecojo'],
        },
        {
            sourceHeaders: ['IdVendedor'],
            targetTable: 'VENDEDORES',
            targetValueHeaders: ['Nombre'],
            targetIdHeaders: ['IdVendedor'],
        },
    ],
    [normalizeKey('TARIFAS')]: [
        { sourceHeaders: ['IdDestino'], targetTable: 'DESTINOS', targetValueHeaders: ['IdDestino', 'Destinos'] },
    ],
    [normalizeKey('APLICATIVOS')]: [
        { sourceHeaders: ['IdTienda'], targetTable: 'TIENDAS', targetValueHeaders: ['IdTienda', 'Nombre'] },
        { sourceHeaders: ['IdCourier'], targetTable: 'COURIER', targetValueHeaders: ['IdCourier', 'Nombre'] },
    ],
}

function matchesHeader(normalizedHeader: string, headerCandidates: string[]): boolean {
    return headerCandidates.some((candidate) => {
        const normalizedCandidate = normalizeKey(candidate)
        if (!normalizedCandidate) return false
        return normalizedHeader === normalizedCandidate || normalizedHeader.includes(normalizedCandidate)
    })
}

export function findRelationRuleForField(sourceTable: string, sourceHeader: string): FieldRelationRule | null {
    const tableRules = TABLE_RELATION_MAP[normalizeKey(sourceTable)]
    if (!tableRules || tableRules.length === 0) return null

    const normalizedHeader = normalizeKey(sourceHeader)
    if (!normalizedHeader) return null

    return tableRules.find((rule) => matchesHeader(normalizedHeader, rule.sourceHeaders)) || null
}

export function getReferencedTablesForSource(sourceTable: string): string[] {
    const tableRules = TABLE_RELATION_MAP[normalizeKey(sourceTable)] || []
    return [...new Set(tableRules.map((rule) => rule.targetTable))]
}
