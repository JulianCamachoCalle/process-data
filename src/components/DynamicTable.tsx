import { useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { useDeleteRow } from '../hooks/useSheetData';
import { DateRangePicker } from './DateRangePicker';
import {
  Pencil,
  Trash2,
  TableProperties,
  Search,
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
  const PAGE_SIZE = 10;
  const deleteMutation = useDeleteRow(sheetName);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedFilterColumn, setSelectedFilterColumn] = useState('');
  const [selectedFilterValue, setSelectedFilterValue] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const visibleColumns = useMemo(() => {
    if (sheetName !== 'RECOJOS') return columns;

    return columns.filter((column) => {
      const normalized = normalizeText(column);
      return normalized !== normalizeText('Observaciones') && normalized !== normalizeText('observaciones');
    });
  }, [columns, sheetName]);

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

  const filterableColumns = useMemo(() => {
    return visibleColumns.filter((column) => {
      const normalized = normalizeText(column);
      if (!normalized || normalized === '__id' || normalized === '_id' || normalized === '_rownumber') {
        return false;
      }

      return rows.some((row) => String(row[column] ?? '').trim().length > 0);
    });
  }, [visibleColumns, rows]);

  const activeFilterColumn = useMemo(() => {
    if (!filterableColumns.length) return '';
    if (selectedFilterColumn && filterableColumns.includes(selectedFilterColumn)) return selectedFilterColumn;
    if (typeColumn && filterableColumns.includes(typeColumn)) return typeColumn;
    return filterableColumns[0] ?? '';
  }, [filterableColumns, selectedFilterColumn, typeColumn]);

  const filterValueOptions = useMemo(() => {
    if (!activeFilterColumn) return [] as string[];

    return Array.from(
      new Set(
        rows
          .map((row) => String(row[activeFilterColumn] ?? '').trim())
          .filter((value) => value.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, 'es'));
  }, [rows, activeFilterColumn]);

  const hasSelectedFilterValue = useMemo(() => {
    if (!selectedFilterValue) return false;
    return filterValueOptions.some((option) => normalizeText(option) === normalizeText(selectedFilterValue));
  }, [filterValueOptions, selectedFilterValue]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (searchTerm) {
        const normalizedQuery = normalizeText(searchTerm);
        const hasQueryMatch = columns.some((column) =>
          normalizeText(row[column]).includes(normalizedQuery)
        );

        if (!hasQueryMatch) return false;
      }

      if (activeFilterColumn && selectedFilterValue && hasSelectedFilterValue) {
        const rowValue = String(row[activeFilterColumn] ?? '').trim();
        if (normalizeText(rowValue) !== normalizeText(selectedFilterValue)) return false;
      }

      if (dateColumn && (dateFrom || dateTo)) {
        const rowDate = parseDateValue(row[dateColumn]);
        if (!rowDate) return false;

        const requiresLeadGanadoDate = sheetName === 'ENVIOS' || sheetName === 'RECOJOS';
        const leadGanadoDate = requiresLeadGanadoDate
          ? parseDateValue(row.__fecha_lead_ganado)
          : null;

        if (dateFrom) {
          const fromDate = parseDateValue(dateFrom);
          if (fromDate) {
            if (rowDate < fromDate) return false;
            if (requiresLeadGanadoDate && (!leadGanadoDate || leadGanadoDate < fromDate)) return false;
          }
        }

        if (dateTo) {
          const toDate = parseDateValue(dateTo);
          if (toDate) {
            const inclusiveTo = new Date(toDate);
            inclusiveTo.setHours(23, 59, 59, 999);
            if (rowDate > inclusiveTo) return false;
            if (requiresLeadGanadoDate && (!leadGanadoDate || leadGanadoDate > inclusiveTo)) return false;
          }
        }
      }

      return true;
    });
  }, [rows, columns, searchTerm, activeFilterColumn, selectedFilterValue, hasSelectedFilterValue, dateColumn, dateFrom, dateTo, sheetName]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safeCurrentPage]);

  const typeCoverage = useMemo(() => {
    if (!typeColumn || !typeOptions.length) return null;

    if (activeFilterColumn === typeColumn && selectedFilterValue && hasSelectedFilterValue) {
      const totalSelectedType = rows.filter(
        (row) => normalizeText(String(row[typeColumn] ?? '')) === normalizeText(selectedFilterValue)
      ).length;

      const visibleSelectedType = filteredRows.filter(
        (row) => normalizeText(String(row[typeColumn] ?? '')) === normalizeText(selectedFilterValue)
      ).length;

      const percentage = totalSelectedType > 0 ? (visibleSelectedType / totalSelectedType) * 100 : 0;

      return {
        label: `Cobertura del tipo: ${selectedFilterValue}`,
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
  }, [typeColumn, typeOptions.length, activeFilterColumn, selectedFilterValue, hasSelectedFilterValue, rows, filteredRows]);

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
    const normalized = normalizeText(columnName);
    if (normalized === normalizeText('Tipo de cobro') || normalized === normalizeText('Tipo de recojo')) {
      return false;
    }

    if (!currencyColumns.includes(columnName)) return false;
    return parseNumericValue(rawValue) !== null;
  };

  const renderCellValue = (columnName: string, rawValue: unknown) => {
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
      const tipoCol = getColumnByCandidates(['Tipo de cobro', 'tipo de cobro', 'Tipo de Recojo', 'tipo de recojo']);
      const vecesCol = getColumnByCandidates(['Veces', 'veces']);
      const ingresoCol = getColumnByCandidates(['Ingreso recojo total', 'ingreso recojo total']);
      const costoCol = getColumnByCandidates(['Costo recojo total', 'costo recojo total']);

      const recojosGratis = filteredRows.reduce((acc, row) => {
        const tipo = normalizeText(String(row[tipoCol ?? ''] ?? ''));
        const veces = Math.max(0, parseNumericValue(row[vecesCol ?? '']) ?? 0);
        return tipo.includes('2+ pedido') ? acc + veces : acc;
      }, 0);

      const recojosCobrados = filteredRows.reduce((acc, row) => {
        const tipo = normalizeText(String(row[tipoCol ?? ''] ?? ''));
        const veces = Math.max(0, parseNumericValue(row[vecesCol ?? '']) ?? 0);
        return tipo.includes('1 pedido') ? acc + veces : acc;
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
          helper: 'Suma de veces con tipo 1 pedido',
        },
        {
          label: 'Recojos gratis (veces)',
          value: formatNumberEs(recojosGratis),
          helper: 'Suma de veces con tipo 2+ pedido',
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
    setSelectedFilterValue('');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(searchTerm || dateFrom || dateTo || selectedFilterValue);
  const searchColumnClassName = dateColumn ? 'xl:col-span-3 xl:self-end' : 'xl:col-span-8 xl:self-end';

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

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-12 xl:items-end">
              {dateColumn ? (
                <DateRangePicker
                  startDate={dateFrom}
                  endDate={dateTo}
                  onStartDateChange={(value) => {
                    setDateFrom(value);
                    setCurrentPage(1);
                  }}
                  onEndDateChange={(value) => {
                    setDateTo(value);
                    setCurrentPage(1);
                  }}
                  showPresets={false}
                  startLabel="Fecha desde"
                  endLabel="Fecha hasta"
                  className="xl:col-span-5"
                  layoutClassName="grid-cols-1 gap-2 sm:grid-cols-2"
                  fieldClassName="rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-600 shadow-none"
                  inputWrapperClassName="mt-0 border-0 bg-transparent p-0"
                  inputClassName="text-sm"
                  helperClassName="tracking-normal"
                  startAdornment={<CalendarRange size={15} className="text-gray-400" />}
                  endAdornment={<CalendarRange size={15} className="text-gray-400" />}
                />
              ) : null}

              <label className={`rounded-xl bg-white px-0 py-0 inline-flex items-center gap-2 text-sm text-gray-600 ${searchColumnClassName}`}>
                <Search size={15} className="text-gray-400 shrink-0" />
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Buscar en todos los campos"
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
                />
              </label>

              {filterableColumns.length ? (
                <div className="grid grid-cols-1 gap-3 xl:col-span-4 xl:grid-cols-2 xl:self-end">
                  <label className="rounded-xl bg-white px-0 py-0 inline-flex items-center gap-2 text-sm text-gray-600">
                    <Tags size={15} className="text-gray-400 shrink-0" />
                    <select
                      value={activeFilterColumn}
                      onChange={(event) => {
                        setSelectedFilterColumn(event.target.value);
                        setSelectedFilterValue('');
                        setCurrentPage(1);
                      }}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
                      aria-label="Seleccionar campo a filtrar"
                    >
                      {filterableColumns.map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="rounded-xl bg-white px-0 py-0 inline-flex items-center gap-2 text-sm text-gray-600">
                    <ListFilter size={15} className="text-gray-400 shrink-0" />
                    <select
                      value={selectedFilterValue}
                      onChange={(event) => {
                        setSelectedFilterValue(event.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
                      aria-label={activeFilterColumn ? `Filtrar por valor de ${activeFilterColumn}` : 'Filtrar por valor'}
                      disabled={!activeFilterColumn || filterValueOptions.length === 0}
                    >
                      <option value="">Todos los valores</option>
                      {filterValueOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 inline-flex items-center gap-2 xl:col-span-4 xl:self-end">
                  <Tags size={14} className="text-gray-400" />
                  No hay columnas con valores para filtrar
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
                {visibleColumns.map((col) => (
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
                  <td colSpan={visibleColumns.length + 1} className="px-6 py-10 text-center text-sm text-gray-500">
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
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                            title="Editar"
                            aria-label="Editar"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(row)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
                            title="Eliminar"
                            aria-label="Eliminar"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                      {visibleColumns.map((col) => (
                        <td key={`${key}-${col}`} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {renderCellValue(col, row[col])}
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
            <span className="inline-flex items-center rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-sm font-semibold text-gray-700">10</span>
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
