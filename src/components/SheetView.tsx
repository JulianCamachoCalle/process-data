import { useState } from 'react';
import {
  useSheetData,
  useAddRow,
  useUpdateRow,
  useDestinoOptions,
  useEnvioFormOptions,
  useEnvioAutoPreview,
  useRecojoFormOptions,
  useRecojoAutoPreview,
  useLeadGanadoAutoPreview,
} from '../hooks/useSheetData';
import type { SheetRow } from '../hooks/useSheetData';
import { DynamicTable } from './DynamicTable';
import { ModalForm } from './ModalForm';
import Swal from 'sweetalert2';
import { Plus, RefreshCcw, Table2, ShieldAlert } from 'lucide-react';
import { getSheetLabel } from '../lib/sheetLabels';
import { getUniqueFormColumns } from '../lib/formRules';
import { normalizeText, parseNumericValue } from '../lib/tableHelpers';

interface SheetViewProps {
  sheetName: string;
}

export function SheetView({ sheetName }: SheetViewProps) {
  const sheetLabel = getSheetLabel(sheetName);
  const { data, isLoading, isError, error, refetch } = useSheetData(sheetName);
  const {
    data: destinosData,
  } = useDestinoOptions(sheetName === 'TARIFAS');

  const { data: envioFormOptions } = useEnvioFormOptions(sheetName === 'ENVIOS');
  const { data: recojoFormOptions } = useRecojoFormOptions(sheetName === 'RECOJOS');
  const { data: leadsFullfilmentData } = useSheetData(sheetName === 'LEADS GANADOS' ? 'FULLFILMENT' : '');
  const { data: leadsOrigenData } = useSheetData(sheetName === 'LEADS GANADOS' ? 'ORIGEN' : '');
  const addMutation = useAddRow(sheetName);
  const updateMutation = useUpdateRow(sheetName);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<SheetRow | null>(null);
  const [modalInstance, setModalInstance] = useState(0);
  const [previewInput, setPreviewInput] = useState({
    leadGanado: '',
    destino: '',
    resultado: '',
    tipoPunto: '',
    excedentePagadoMoto: '0',
    fechaEnvio: '',
  });
  const [leadPreviewInput, setLeadPreviewInput] = useState({
    fechaIngresoLead: '',
    fechaLeadGanado: '',
    anuladosFullfilment: '0',
    tienda: '',
  });
  const [recojoPreviewInput, setRecojoPreviewInput] = useState({
    leadGanado: '',
    tipoCobro: '',
    veces: '1',
  });

  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];

  const uniqueColumns = getUniqueFormColumns(sheetName, columns);

  const destinoOptions = (destinosData?.rows ?? [])
    .map((row) => String(row.Destinos ?? '').trim())
    .filter(Boolean);

  const selectOptionsByColumn: Record<string, string[]> =
    sheetName === 'TARIFAS'
      ? {
          Destino: Array.from(new Set(destinoOptions)),
        }
      : sheetName === 'ENVIOS'
        ? {
            'Lead Ganado': envioFormOptions?.leadsGanados ?? [],
            Destino: envioFormOptions?.destinos ?? [],
            Resultado: envioFormOptions?.resultados ?? [],
            'Tipo Punto': envioFormOptions?.tipoPunto ?? [],
          }
        : sheetName === 'LEADS GANADOS'
          ? {
              FullFilment: Array.from(new Set((leadsFullfilmentData?.rows ?? []).map((row) => String(row['¿Es FullFilment?'] ?? '').trim()).filter(Boolean))),
              Origen: Array.from(new Set((leadsOrigenData?.rows ?? []).map((row) => String(row.Opcion ?? '').trim()).filter(Boolean))),
            }
        : sheetName === 'RECOJOS'
          ? {
              'Lead Ganado': recojoFormOptions?.leadsGanados ?? [],
              'Tipo de cobro': recojoFormOptions?.tipoCobro ?? [],
            }
        : {};

  const { data: envioPreviewData } = useEnvioAutoPreview({
    enabled: isModalOpen && sheetName === 'ENVIOS',
    leadGanado: previewInput.leadGanado,
    destino: previewInput.destino,
    resultado: previewInput.resultado,
    tipoPunto: previewInput.tipoPunto,
    excedentePagadoMoto: previewInput.excedentePagadoMoto,
  });

  const { data: leadPreviewData } = useLeadGanadoAutoPreview({
    enabled: isModalOpen && sheetName === 'LEADS GANADOS',
    fechaIngresoLead: leadPreviewInput.fechaIngresoLead,
    fechaLeadGanado: leadPreviewInput.fechaLeadGanado,
    anuladosFullfilment: leadPreviewInput.anuladosFullfilment,
    tienda: leadPreviewInput.tienda,
  });

  const { data: recojoPreviewData } = useRecojoAutoPreview({
    enabled: isModalOpen && sheetName === 'RECOJOS',
    leadGanado: recojoPreviewInput.leadGanado,
    tipoCobro: recojoPreviewInput.tipoCobro,
    veces: recojoPreviewInput.veces,
  });

  const previewValuesByColumn: Record<string, string> =
    sheetName === 'ENVIOS'
      ? {
          ...(envioPreviewData ?? {}),
          'Excedente pagado moto': String(parseNumericValue(previewInput.excedentePagadoMoto) ?? 0),
        }
      : sheetName === 'LEADS GANADOS'
        ? {
            ...(leadPreviewData ?? {}),
            'Anulados Fullfilment': String(parseNumericValue(leadPreviewInput.anuladosFullfilment) ?? 0),
          }
      : sheetName === 'RECOJOS'
        ? {
            ...(recojoPreviewData ?? {}),
            Veces: String(Math.max(0, Math.round(parseNumericValue(recojoPreviewInput.veces) ?? 0))),
          }
      : {};

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 bg-white/80 rounded-2xl border border-gray-200 shadow-sm">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <div className="h-9 w-9 rounded-full border-4 border-t-red-500 border-gray-200 animate-spin"></div>
          <p className="font-medium">Cargando datos de {sheetLabel}...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50/90 text-red-700 p-6 rounded-2xl border border-red-200 shadow-[0_20px_30px_-25px_rgba(220,38,38,0.8)]">
        <h3 className="font-bold text-lg mb-2 inline-flex items-center gap-2">
          <ShieldAlert size={20} />
          Error al cargar {sheetLabel}
        </h3>
        <p className="mb-4">{error?.message || 'Ocurrió un error inesperado.'}</p>
        <button
          onClick={() => refetch()}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg shadow-md transition"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const handleOpenAdd = () => {
    setEditingRow(null);
    setPreviewInput({
      leadGanado: '',
      destino: '',
      resultado: '',
      tipoPunto: '',
      excedentePagadoMoto: '0',
      fechaEnvio: '',
    });
    setLeadPreviewInput({
      fechaIngresoLead: '',
      fechaLeadGanado: '',
      anuladosFullfilment: '0',
      tienda: '',
    });
    setRecojoPreviewInput({
      leadGanado: '',
      tipoCobro: '',
      veces: '1',
    });
    setModalInstance((prev) => prev + 1);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (row: SheetRow) => {
    setEditingRow(row);
    setPreviewInput({
      leadGanado: String(row['Lead Ganado'] ?? '').trim(),
      destino: String(row.Destino ?? '').trim(),
      resultado: String(row.Resultado ?? '').trim(),
      tipoPunto: String(row['Tipo Punto'] ?? '').trim(),
      excedentePagadoMoto: String(parseNumericValue(row['Excedente pagado moto']) ?? 0),
      fechaEnvio: String(row['Fecha envio'] ?? '').trim(),
    });
    setLeadPreviewInput({
      fechaIngresoLead: String(row['Fecha ingreso lead'] ?? '').trim(),
      fechaLeadGanado: String(row['Fecha Lead Ganado'] ?? '').trim(),
      anuladosFullfilment: String(parseNumericValue(row['Anulados Fullfilment']) ?? 0),
      tienda: String(row.Tienda ?? '').trim(),
    });
    setRecojoPreviewInput({
      leadGanado: String(row['Lead Ganado'] ?? '').trim(),
      tipoCobro: String(row['Tipo de cobro'] ?? '').trim(),
      veces: String(parseNumericValue(row.Veces) ?? 1),
    });
    setModalInstance((prev) => prev + 1);
    setIsModalOpen(true);
  };

  const handleModalSubmit = (formData: Record<string, string>) => {
    const normalizedFormData = Object.entries(formData).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = typeof value === 'string' ? value.trim() : '';
      return acc;
    }, {});

    const duplicateColumn = uniqueColumns.find((uniqueColumn) => {
      const submittedValue = normalizedFormData[uniqueColumn] ?? '';
      if (!submittedValue) return false;

      return rows.some((row) => {
        if (editingRow && row._id === editingRow._id) {
          return false;
        }

        const existingValue = String(row[uniqueColumn] ?? '').trim();
        return normalizeText(existingValue) === normalizeText(submittedValue);
      });
    });

    if (duplicateColumn) {
      Swal.fire(
        'Dato duplicado',
        `El campo "${duplicateColumn}" ya existe. Ingresá un valor diferente.`,
        'warning',
      );
      return;
    }

    if (sheetName === 'TARIFAS') {
      const destino = String(normalizedFormData.Destino ?? '').trim();
      if (!destino) {
        Swal.fire('Validación', 'Destino es obligatorio.', 'warning');
        return;
      }

      const cobroEntregaValue = parseNumericValue(normalizedFormData['Cobro Entrega']);
      const pagoMotoValue = parseNumericValue(normalizedFormData['Pago Moto']);

      const cobroEntrega = cobroEntregaValue ?? 0;
      const pagoMoto = pagoMotoValue ?? 0;

      const hasValidCostFormat = (raw: string) => {
        const text = String(raw ?? '').trim();
        if (!text) return true;
        return /^\d+(?:[.,]\d{1,2})?$/.test(text);
      };

      if (!hasValidCostFormat(normalizedFormData['Cobro Entrega']) || !hasValidCostFormat(normalizedFormData['Pago Moto'])) {
        Swal.fire('Validación', 'Cobro Entrega y Pago Moto aceptan máximo 2 decimales.', 'warning');
        return;
      }

      normalizedFormData['Cobro Entrega'] = String(cobroEntrega);
      normalizedFormData['Pago Moto'] = String(pagoMoto);
      normalizedFormData.Notas = String(normalizedFormData.Notas ?? '').trim();
    }

    if (sheetName === 'ENVIOS') {
      const requiredFields = ['Fecha envio', 'Lead Ganado', 'Destino', 'Resultado', 'Tipo Punto'];
      const missingField = requiredFields.find((field) => !String(normalizedFormData[field] ?? '').trim());

      if (missingField) {
        Swal.fire('Validación', `${missingField} es obligatorio.`, 'warning');
        return;
      }

      const excedenteText = String(normalizedFormData['Excedente pagado moto'] ?? '').trim();
      if (excedenteText && !/^\d+(?:[.,]\d{1,2})?$/.test(excedenteText)) {
        Swal.fire('Validación', 'Excedente pagado moto acepta máximo 2 decimales.', 'warning');
        return;
      }

      normalizedFormData['Excedente pagado moto'] = String(parseNumericValue(normalizedFormData['Excedente pagado moto']) ?? 0);
      normalizedFormData.observaciones = String(normalizedFormData.observaciones ?? '').trim();
    }

    if (sheetName === 'LEADS GANADOS') {
      const requiredSelects = ['Tienda', 'FullFilment', 'Origen'];
      const missingField = requiredSelects.find((field) => !String(normalizedFormData[field] ?? '').trim());

      if (missingField) {
        Swal.fire('Validación', `${missingField} es obligatorio.`, 'warning');
        return;
      }

      const requiredDates = ['Fecha ingreso lead', 'Fecha Lead Ganado'];
      const missingDate = requiredDates.find((field) => !String(normalizedFormData[field] ?? '').trim());

      if (missingDate) {
        Swal.fire('Validación', `${missingDate} es obligatoria.`, 'warning');
        return;
      }

      const hasValidCostFormat = (raw: string) => {
        const text = String(raw ?? '').trim();
        if (!text) return true;
        return /^\d+(?:[.,]\d{1,2})?$/.test(text);
      };

      if (!hasValidCostFormat(normalizedFormData['Anulados Fullfilment'])) {
        Swal.fire('Validación', 'Anulados Fullfilment acepta máximo 2 decimales.', 'warning');
        return;
      }

      normalizedFormData['Anulados Fullfilment'] = String(parseNumericValue(normalizedFormData['Anulados Fullfilment']) ?? 0);
      normalizedFormData.Notas = String(normalizedFormData.Notas ?? '').trim();
    }

    if (sheetName === 'RECOJOS') {
      const requiredFields = ['Fecha', 'Lead Ganado', 'Tipo de cobro', 'Veces'];
      const missingField = requiredFields.find((field) => !String(normalizedFormData[field] ?? '').trim());

      if (missingField) {
        Swal.fire('Validación', `${missingField} es obligatorio.`, 'warning');
        return;
      }

      const veces = parseNumericValue(normalizedFormData.Veces);
      if (veces === null || !Number.isFinite(veces)) {
        Swal.fire('Validación', 'Veces debe ser numérico.', 'warning');
        return;
      }

      const vecesRedondeadas = Math.round(veces);
      if (vecesRedondeadas < 0) {
        Swal.fire('Validación', 'Veces no puede ser negativo.', 'warning');
        return;
      }

      normalizedFormData.Veces = String(vecesRedondeadas);
      normalizedFormData.Observaciones = String(normalizedFormData.Observaciones ?? normalizedFormData.observaciones ?? '').trim();
      normalizedFormData['Tipo de cobro'] = String(normalizedFormData['Tipo de cobro'] ?? '').trim();
    }

    if (editingRow) {
      const rowId = editingRow._id;
      if (typeof rowId !== 'string' || !rowId.trim()) {
        Swal.fire('Error', 'No se encontró el identificador del registro a actualizar.', 'error');
        return;
      }

      updateMutation.mutate(
        {
          ...normalizedFormData,
          _id: rowId,
          _rowNumber:
            typeof editingRow._rowNumber === 'number' && Number.isInteger(editingRow._rowNumber)
              ? editingRow._rowNumber
              : undefined,
        },
        {
          onSuccess: () => {
            setIsModalOpen(false);
            Swal.fire('Actualizado', 'El registro fue actualizado correctamente.', 'success');
          },
          onError: (err) => Swal.fire('Error', err.message, 'error'),
        }
      );
    } else {
      addMutation.mutate(normalizedFormData, {
        onSuccess: () => {
          setIsModalOpen(false);
          Swal.fire('Creado', 'El registro fue creado correctamente.', 'success');
        },
        onError: (err) => Swal.fire('Error', err.message, 'error'),
      });
    }
  };

  const isSubmitting = addMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white/95 p-6 rounded-2xl border border-gray-200 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)] backdrop-blur-sm">
        <div className="space-y-1">
          <h2 className="text-2xl font-extrabold text-gray-900 capitalize tracking-tight inline-flex items-center gap-2">
            <Table2 className="text-red-600" size={24} />
            {sheetLabel}
          </h2>
          <p className="text-sm text-gray-500">Gestión de datos.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => refetch()}
            className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-4 py-2.5 text-sm font-semibold rounded-xl shadow-sm transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-red-500 inline-flex items-center gap-2"
          >
            <RefreshCcw size={16} />
            Actualizar datos
          </button>
          <button
            onClick={handleOpenAdd}
            className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white px-4 py-2.5 text-sm font-semibold rounded-xl border border-red-400/70 shadow-[0_14px_28px_-18px_rgba(230,0,0,0.9)] transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-red-500 flex items-center gap-2"
          >
            <Plus size={16} />
            Nuevo registro
          </button>
        </div>
      </div>
      
      {data && data.rows && data.columns ? (
        <DynamicTable 
          sheetName={sheetName} 
          columns={columns}
          rows={rows}
          onEdit={handleOpenEdit} 
        />
      ) : (
        <div className="text-gray-500 italic p-6 border border-gray-200 rounded-xl bg-white text-center text-sm shadow-sm">
          No se encontraron registros.
        </div>
      )}

      {data && data.columns && (
        <ModalForm
          key={modalInstance}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleModalSubmit}
          title={editingRow ? 'Editar registro' : 'Nuevo registro'}
          sheetName={sheetName}
          columns={columns}
          selectOptionsByColumn={selectOptionsByColumn}
          previewValuesByColumn={previewValuesByColumn}
          onFormValueChange={(column: string, value: string) => {
            if (sheetName === 'ENVIOS') {
              if (column === 'Lead Ganado') {
                setPreviewInput((prev) => ({ ...prev, leadGanado: value }));
              } else if (column === 'Destino') {
                setPreviewInput((prev) => ({ ...prev, destino: value }));
              } else if (column === 'Resultado') {
                setPreviewInput((prev) => ({ ...prev, resultado: value }));
              } else if (column === 'Tipo Punto') {
                setPreviewInput((prev) => ({ ...prev, tipoPunto: value }));
              } else if (column === 'Excedente pagado moto') {
                setPreviewInput((prev) => ({ ...prev, excedentePagadoMoto: value }));
              } else if (column === 'Fecha envio') {
                setPreviewInput((prev) => ({ ...prev, fechaEnvio: value }));
              }
              return;
            }

            if (sheetName === 'LEADS GANADOS') {
              if (column === 'Fecha ingreso lead') {
                setLeadPreviewInput((prev) => ({ ...prev, fechaIngresoLead: value }));
              } else if (column === 'Fecha Lead Ganado') {
                setLeadPreviewInput((prev) => ({ ...prev, fechaLeadGanado: value }));
              } else if (column === 'Anulados Fullfilment') {
                setLeadPreviewInput((prev) => ({ ...prev, anuladosFullfilment: value }));
              } else if (column === 'Tienda') {
                setLeadPreviewInput((prev) => ({ ...prev, tienda: value }));
              }
              return;
            }

            if (sheetName === 'RECOJOS') {
              if (column === 'Lead Ganado') {
                setRecojoPreviewInput((prev) => ({ ...prev, leadGanado: value }));
              } else if (column === 'Tipo de cobro') {
                setRecojoPreviewInput((prev) => ({ ...prev, tipoCobro: value }));
              } else if (column === 'Veces') {
                setRecojoPreviewInput((prev) => ({ ...prev, veces: value }));
              }
            }
          }}
          initialData={editingRow}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
