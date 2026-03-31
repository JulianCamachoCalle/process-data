import { useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { useDeleteRow } from '../hooks/useSheetData';
import {
  Pencil,
  Trash2,
  TableProperties,
  Search,
  Filter,
  CalendarRange,
  Tags,
  BarChart3,
  ListFilter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  formatCurrencyPen,
  formatNumberEs,
  isLikelyCurrencyColumn,
  isDateColumn,
  isTypeColumn,
  normalizeText,
  parseDateValue,
  parseNumericValue,
} from '../lib/tableHelpers';
import type { SheetRow } from '../hooks/useSheetData';

const BASE_SHEET_NAMES = new Set([
  'DESTINOS',
  'TARIFAS',
  'TIENDAS',
  'COURIER',
  'VENDEDORES',
  'FULLFILMENT',
  'ORIGEN',
  'RESULTADOS',
  'TIPO DE PUNTO',
  'TIPO DE RECOJO',
]);

interface DynamicTableProps {
  sheetName: string;
  columns: string[];
  rows: SheetRow[];
  onEdit: (row: SheetRow) => void;
}

interface InsightCard {
  label: string;
  value: string;
  helper: string;
}

export function DynamicTable({ sheetName, columns, rows, onEdit }: DynamicTableProps) {
  const deleteMutation = useDeleteRow(sheetName);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const dateColumn = useMemo(() => {
    if (sheetName === 'LEADS GANADOS') {
      const fechaLeadGanado = columns.find(
        (column) => normalizeText(column) === normalizeText('Fecha Lead Ganado'),
      );

      if (fechaLeadGanado) return fechaLeadGanado;
    }

    return columns.find((column) => isDateColumn(column)) ?? null;
  }, [columns, sheetName]);
  const typeColumn = useMemo(() => columns.find((column) => isTypeColumn(column)) ?? null, [columns]);

  const numericInsightColumn = useMemo(() => {
    const candidates = columns
      .map((column) => {
        const normalized = normalizeText(column);
        const isIdLike = normalized.startsWith('id') || normalized === '__id' || normalized.endsWith(' id');
        if (isIdLike) {
          return { column, numericCount: 0 };
        }

        const numericCount = rows.reduce((acc, row) => {
          return parseNumericValue(row[column]) !== null ? acc + 1 : acc;
        }, 0);

        return { column, numericCount };
      })
      .filter((candidate) => candidate.numericCount > 0)
      .sort((a, b) => b.numericCount - a.numericCount);

    return candidates[0]?.column ?? null;
  }, [columns, rows]);

  const typeOptions = useMemo(() => {
    if (!typeColumn) return [] as string[];

    return Array.from(
      new Set(
        rows
          .map((row) => String(row[typeColumn] ?? '').trim())
          .filter((value) => value.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, 'es'));
  }, [rows, typeColumn]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (searchTerm) {
        const normalizedQuery = normalizeText(searchTerm);
        const hasQueryMatch = columns.some((column) =>
          normalizeText(row[column]).includes(normalizedQuery)
        );

        if (!hasQueryMatch) return false;
      }

      if (typeColumn && selectedType) {
        const rowType = String(row[typeColumn] ?? '').trim();
        if (normalizeText(rowType) !== normalizeText(selectedType)) return false;
      }

      if (dateColumn && (dateFrom || dateTo)) {
        const rowDate = parseDateValue(row[dateColumn]);
        if (!rowDate) return false;

        if (dateFrom) {
          const fromDate = parseDateValue(dateFrom);
          if (fromDate && rowDate < fromDate) return false;
        }

        if (dateTo) {
          const toDate = parseDateValue(dateTo);
          if (toDate) {
            const inclusiveTo = new Date(toDate);
            inclusiveTo.setHours(23, 59, 59, 999);
            if (rowDate > inclusiveTo) return false;
          }
        }
      }

      return true;
    });
  }, [rows, columns, searchTerm, typeColumn, selectedType, dateColumn, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safeCurrentPage, pageSize]);

  const typeCoverage = useMemo(() => {
    if (!typeColumn || !typeOptions.length) return null;

    if (selectedType) {
      const totalSelectedType = rows.filter(
        (row) => normalizeText(String(row[typeColumn] ?? '')) === normalizeText(selectedType)
      ).length;

      const visibleSelectedType = filteredRows.filter(
        (row) => normalizeText(String(row[typeColumn] ?? '')) === normalizeText(selectedType)
      ).length;

      const percentage = totalSelectedType > 0 ? (visibleSelectedType / totalSelectedType) * 100 : 0;

      return {
        label: `Cobertura del tipo: ${selectedType}`,
        value: `${Math.round(percentage)}%`,
        helper: `${visibleSelectedType} de ${totalSelectedType} visibles`,
      };
    }

    const visibleTypes = new Set(
      filteredRows.map((row) => normalizeText(String(row[typeColumn] ?? ''))).filter(Boolean)
    ).size;
    const totalTypes = new Set(rows.map((row) => normalizeText(String(row[typeColumn] ?? ''))).filter(Boolean))
      .size;
    const percentage = totalTypes > 0 ? (visibleTypes / totalTypes) * 100 : 0;

    return {
      label: 'Cobertura de tipos visibles',
      value: `${Math.round(percentage)}%`,
      helper: `${visibleTypes} de ${totalTypes} tipos`,
    };
  }, [typeColumn, typeOptions.length, selectedType, rows, filteredRows]);

  const numericInsight = useMemo(() => {
    if (!numericInsightColumn) return null;

    const visibleSum = filteredRows.reduce((acc, row) => {
      const numeric = parseNumericValue(row[numericInsightColumn]);
      return numeric !== null ? acc + numeric : acc;
    }, 0);

    return {
      label: `Suma visible: ${numericInsightColumn}`,
      value: formatNumberEs(visibleSum),
      helper: 'Total calculado sobre registros filtrados',
    };
  }, [filteredRows, numericInsightColumn]);

  const firstNonIdTextColumn = useMemo(() => {
    return (
      columns.find((column) => {
        const normalized = normalizeText(column);
        if (!normalized || normalized.startsWith('id') || normalized === '__id') return false;

        const hasTextValue = rows.some((row) => {
          const value = row[column];
          return typeof value === 'string' && value.trim().length > 0;
        });

        return hasTextValue;
      }) ?? null
    );
  }, [columns, rows]);

  const uniqueBaseRecords = useMemo(() => {
    if (!firstNonIdTextColumn) return 0;

    return new Set(
      rows
        .map((row) => normalizeText(String(row[firstNonIdTextColumn] ?? '')))
        .filter(Boolean),
    ).size;
  }, [firstNonIdTextColumn, rows]);

  const currencyColumns = useMemo(
    () => columns.filter((column) => isLikelyCurrencyColumn(column)),
    [columns],
  );

  const shouldRenderAsCurrency = (columnName: string, rawValue: unknown) => {
    if (!currencyColumns.includes(columnName)) return false;
    return parseNumericValue(rawValue) !== null;
  };

  const isDateWithinRange = (value: unknown) => {
    const parsed = parseDateValue(value);
    if (!parsed) return false;

    const fromDate = dateFrom ? parseDateValue(dateFrom) : null;
    const toDateRaw = dateTo ? parseDateValue(dateTo) : null;
    const toDate = toDateRaw ? new Date(toDateRaw) : null;

    if (toDate) {
      toDate.setHours(23, 59, 59, 999);
    }

    if (fromDate && parsed < fromDate) return false;
    if (toDate && parsed > toDate) return false;

    return true;
  };

  const renderCellValue = (columnName: string, rawValue: unknown, row: SheetRow) => {
    if (sheetName === 'LEADS GANADOS' && normalizeText(columnName) === normalizeText('Lead ganado en periodo?')) {
      const fechaCol = columns.find((col) => normalizeText(col) === normalizeText('Fecha Lead Ganado'));
      if (!fechaCol) return '-';

      if (!dateFrom && !dateTo) return 'Si';

      return isDateWithinRange(row[fechaCol]) ? 'Si' : 'No';
    }

    if (rawValue === undefined || rawValue === null || rawValue === '') return '-';

    const numericValue = parseNumericValue(rawValue);
    if (shouldRenderAsCurrency(columnName, rawValue) && numericValue !== null) {
      return formatCurrencyPen(numericValue);
    }

    return String(rawValue);
  };

  const insightCards = useMemo<InsightCard[]>(() => {
    const totalRecords = rows.length;
    const visibleRecords = filteredRows.length;

    const getColumnByCandidates = (candidates: string[]) => {
      return (
        columns.find((column) => {
          const normalizedColumn = normalizeText(column);
          return candidates.some((candidate) => normalizeText(candidate) === normalizedColumn);
        }) ?? null
      );
    };

    const sumByColumn = (column: string | null) => {
      if (!column) return 0;
      return filteredRows.reduce((acc, row) => {
        const value = parseNumericValue(row[column]);
        return value !== null ? acc + value : acc;
      }, 0);
    };

    if (sheetName === 'ENVIOS') {
      const ingresoCol = getColumnByCandidates(['ingreso total fila', 'Ingreso total fila']);
      const costoCol = getColumnByCandidates(['costo total fila', 'Costo total fila']);
      const ingreso = sumByColumn(ingresoCol);
      const costo = sumByColumn(costoCol);
      const margen = ingreso - costo;

      return [
        {
          label: 'Total de envíos',
          value: formatNumberEs(totalRecords),
          helper: 'Registros disponibles en la tabla',
        },
        {
          label: 'Envíos visibles',
          value: formatNumberEs(visibleRecords),
          helper: 'Resultado actual de filtros y búsqueda',
        },
        {
          label: 'Ingreso visible',
          value: formatCurrencyPen(ingreso),
          helper: 'Suma de ingreso total fila (filtrado)',
        },
        {
          label: 'Margen visible',
          value: formatCurrencyPen(margen),
          helper: 'Ingreso visible - costo visible',
        },
      ];
    }

    if (sheetName === 'RECOJOS') {
      const tipoCol = getColumnByCandidates(['Tipo de Recojo', 'tipo de recojo']);
      const vecesCol = getColumnByCandidates(['Veces', 'veces']);
      const ingresoCol = getColumnByCandidates(['Ingreso recojo total', 'ingreso recojo total']);
      const costoCol = getColumnByCandidates(['Costo recojo total', 'costo recojo total']);

      const recojosGratis = filteredRows.reduce((acc, row) => {
        const tipo = normalizeText(String(row[tipoCol ?? ''] ?? ''));
        const veces = Math.max(0, parseNumericValue(row[vecesCol ?? '']) ?? 0);
        return tipo.includes('gratis') ? acc + veces : acc;
      }, 0);

      const recojosCobrados = filteredRows.reduce((acc, row) => {
        const tipo = normalizeText(String(row[tipoCol ?? ''] ?? ''));
        const veces = Math.max(0, parseNumericValue(row[vecesCol ?? '']) ?? 0);
        return tipo.includes('cobra') || tipo.includes('pedido') ? acc + veces : acc;
      }, 0);

      const margenRecojos = sumByColumn(ingresoCol) - sumByColumn(costoCol);

      return [
        {
          label: 'Total de filas',
          value: formatNumberEs(totalRecords),
          helper: 'Registros disponibles en la tabla',
        },
        {
          label: 'Recojos cobrados (veces)',
          value: formatNumberEs(recojosCobrados),
          helper: 'Suma de veces con tipo cobrado',
        },
        {
          label: 'Recojos gratis (veces)',
          value: formatNumberEs(recojosGratis),
          helper: 'Suma de veces con tipo gratis',
        },
        {
          label: 'Margen recojos visible',
          value: formatCurrencyPen(margenRecojos),
          helper: 'Ingreso recojo total - costo recojo total',
        },
      ];
    }

    if (sheetName === 'LEADS GANADOS') {
      const anuladosCol = getColumnByCandidates(['Anulados Fullfilment', 'anulados fullfilment']);
      const ingresoAnuladosCol = getColumnByCandidates([
        'Ingreso anulados fullfilment',
        'ingreso anulados fullfilment',
      ]);
      const distritoCol = getColumnByCandidates(['Distrito', 'distrito']);

      const anulados = sumByColumn(anuladosCol);
      const ingresoAnulados = sumByColumn(ingresoAnuladosCol);

      const distritoFrecuente = (() => {
        const freq = new Map<string, number>();
        for (const row of filteredRows) {
          const value = String(row[distritoCol ?? ''] ?? '').trim();
          if (!value) continue;
          freq.set(value, (freq.get(value) ?? 0) + 1);
        }
        let winner = '';
        let winnerCount = 0;
        for (const [value, count] of freq) {
          if (count > winnerCount) {
            winner = value;
            winnerCount = count;
          }
        }
        return winner || 'N/D';
      })();

      return [
        {
          label: 'Total de leads',
          value: formatNumberEs(totalRecords),
          helper: 'Registros disponibles en la tabla',
        },
        {
          label: 'Leads visibles',
          value: formatNumberEs(visibleRecords),
          helper: 'Resultado actual de filtros y búsqueda',
        },
        {
          label: 'Ingreso anulados visible',
          value: formatCurrencyPen(ingresoAnulados),
          helper: `Anulados visibles: ${formatNumberEs(anulados)}`,
        },
        {
          label: 'Distrito más frecuente',
          value: distritoFrecuente,
          helper: 'Calculado sobre registros filtrados',
        },
      ];
    }

    if (BASE_SHEET_NAMES.has(sheetName)) {
      const coverage = totalRecords > 0 ? Math.round((visibleRecords / totalRecords) * 100) : 0;
      const singularLabelBySheet: Record<string, string> = {
        DESTINOS: 'destinos',
        TARIFAS: 'tarifas',
        TIENDAS: 'tiendas',
        COURIER: 'couriers',
        VENDEDORES: 'vendedores',
        FULLFILMENT: 'fullfilment',
        ORIGEN: 'orígenes',
        RESULTADOS: 'resultados',
        'TIPO DE PUNTO': 'tipos de punto',
        'TIPO DE RECOJO': 'tipos de recojo',
      };
      const singular = singularLabelBySheet[sheetName] ?? 'registros';
      const uniqueHelperColumnLabel = firstNonIdTextColumn ?? 'columna principal';

      return [
        {
          label: `Total de ${singular}`,
          value: formatNumberEs(totalRecords),
          helper: 'Registros disponibles en la tabla',
        },
        {
          label: `${singular.charAt(0).toUpperCase()}${singular.slice(1)} visibles`,
          value: formatNumberEs(visibleRecords),
          helper: 'Resultado actual de filtros y búsqueda',
        },
        {
          label: `${singular.charAt(0).toUpperCase()}${singular.slice(1)} únicos`,
          value: formatNumberEs(uniqueBaseRecords),
          helper: firstNonIdTextColumn
            ? `Valores únicos en columna ${uniqueHelperColumnLabel}`
            : 'No se detectó una columna principal de texto',
        },
        {
          label: 'Cobertura visible',
          value: `${coverage}%`,
          helper: `${visibleRecords} de ${totalRecords} registros`,
        },
      ];
    }

    return [
      {
        label: 'Total de registros',
        value: formatNumberEs(totalRecords),
        helper: 'Registros disponibles en la tabla',
      },
      {
        label: 'Registros visibles',
        value: formatNumberEs(visibleRecords),
        helper: 'Resultado actual de filtros y búsqueda',
      },
      {
        label: typeCoverage?.label ?? 'Cobertura de tipos',
        value: typeCoverage?.value ?? 'N/D',
        helper: typeCoverage?.helper ?? 'No se detectó una columna de tipo o categoría',
      },
      {
        label: numericInsight?.label ?? 'Indicador numérico',
        value: numericInsight?.value ?? 'N/D',
        helper: numericInsight?.helper ?? 'No se detectó una columna numérica útil',
      },
    ];
  }, [
    sheetName,
    rows,
    columns,
    filteredRows,
    totalPages,
    uniqueBaseRecords,
    firstNonIdTextColumn,
    typeCoverage,
    numericInsight,
  ]);

  const handleDelete = (row: SheetRow) => {
    Swal.fire({
      title: '¿Confirmás esta eliminación?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (result.isConfirmed) {
        const rowId = row._id;
        if (typeof rowId !== 'string' || !rowId.trim()) {
          Swal.fire('Error', 'No se encontró el identificador del registro para eliminar.', 'error');
          return;
        }

        deleteMutation.mutate({ rowId, rowNumber: typeof row._rowNumber === 'number' ? row._rowNumber : null }, {
          onSuccess: () => {
            Swal.fire('Eliminado', 'El registro fue eliminado correctamente.', 'success');
          },
          onError: (err) => {
            Swal.fire('Error', err.message || 'No se pudo eliminar el registro.', 'error');
          },
        });
      }
    });
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setSelectedType('');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(searchTerm || dateFrom || dateTo || selectedType);

  if (!columns.length) {
    return <div className="p-4 text-gray-500">No hay datos disponibles en esta tabla.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {insightCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.helper}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-[0_24px_50px_-36px_rgba(15,23,42,0.8)] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold text-gray-700 inline-flex items-center gap-2">
                <TableProperties size={16} className="text-red-600" />
                Registros
              </p>
              <span className="text-xs font-medium text-gray-500">
                Mostrando {paginatedRows.length} de {filteredRows.length} (total: {rows.length})
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3">
              <label className="rounded-xl border border-gray-200 bg-white px-3 py-2 inline-flex items-center gap-2 text-sm text-gray-600">
                <Search size={15} className="text-gray-400" />
                <input
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setCurrentPage(1);
                    }}
                  placeholder="Buscar en todos los campos"
                  className="w-full bg-transparent outline-none"
                />
              </label>

              {dateColumn ? (
                <label className="rounded-xl border border-gray-200 bg-white px-3 py-2 inline-flex items-center gap-2 text-sm text-gray-600">
                  <CalendarRange size={15} className="text-gray-400" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => {
                      setDateFrom(event.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full bg-transparent outline-none"
                    aria-label="Fecha desde"
                  />
                </label>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 inline-flex items-center gap-2">
                  <CalendarRange size={14} className="text-gray-400" />
                  No se detectó columna de fecha
                </div>
              )}

              {dateColumn ? (
                <label className="rounded-xl border border-gray-200 bg-white px-3 py-2 inline-flex items-center gap-2 text-sm text-gray-600">
                  <CalendarRange size={15} className="text-gray-400" />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => {
                      setDateTo(event.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full bg-transparent outline-none"
                    aria-label="Fecha hasta"
                  />
                </label>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 inline-flex items-center gap-2">
                  <Filter size={14} className="text-gray-400" />
                  Filtro de fecha no disponible
                </div>
              )}

              {typeColumn ? (
                <label className="rounded-xl border border-gray-200 bg-white px-3 py-2 inline-flex items-center gap-2 text-sm text-gray-600">
                  <Tags size={15} className="text-gray-400" />
                  <select
                    value={selectedType}
                    onChange={(event) => {
                      setSelectedType(event.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full bg-transparent outline-none"
                    aria-label="Filtrar por tipo o categoría"
                  >
                    <option value="">Todos los tipos</option>
                    {typeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 inline-flex items-center gap-2">
                  <Tags size={14} className="text-gray-400" />
                  No se detectó columna de tipo o categoría
                </div>
              )}
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs text-gray-500 inline-flex items-center gap-2">
                <BarChart3 size={14} className="text-red-500" />
                {hasActiveFilters
                  ? 'Hay filtros activos aplicados sobre la tabla.'
                  : 'No hay filtros activos. Se muestran todos los registros.'}
              </div>
              <button
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ListFilter size={14} />
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/90">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap w-36">
                  Acciones
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-6 py-10 text-center text-sm text-gray-500">
                    No se encontraron resultados para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const key = row._id;

                  return (
                    <tr key={key} className="hover:bg-red-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => onEdit(row)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors text-xs font-semibold"
                          >
                            <Pencil size={13} />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(row)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors text-xs font-semibold"
                          >
                            <Trash2 size={13} />
                            Eliminar
                          </button>
                        </div>
                      </td>
                      {columns.map((col) => (
                        <td key={`${key}-${col}`} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {renderCellValue(col, row[col], row)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 bg-white flex items-center justify-between gap-4 flex-wrap">
          <div className="inline-flex items-center gap-2 text-sm text-gray-600">
            <span>Filas por página:</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 rounded-lg border border-gray-300 bg-white text-sm"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="inline-flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, Math.min(prev, totalPages) - 1))}
              disabled={safeCurrentPage === 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={15} />
              Anterior
            </button>
            <span className="text-sm text-gray-600 px-2">
              Página {safeCurrentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))}
              disabled={safeCurrentPage === totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
