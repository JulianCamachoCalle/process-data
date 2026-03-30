import { useState } from 'react';
import { useSheetData, useAddRow, useUpdateRow } from '../hooks/useSheetData';
import { DynamicTable } from './DynamicTable';
import { ModalForm } from './ModalForm';
import Swal from 'sweetalert2';
import { Plus, RefreshCcw, Table2, ShieldAlert } from 'lucide-react';
import { getSheetLabel } from '../lib/sheetLabels';

interface SheetViewProps {
  sheetName: string;
}

export function SheetView({ sheetName }: SheetViewProps) {
  const sheetLabel = getSheetLabel(sheetName);
  const { data, isLoading, isError, error, refetch } = useSheetData(sheetName);
  const addMutation = useAddRow(sheetName);
  const updateMutation = useUpdateRow(sheetName);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);

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
    setIsModalOpen(true);
  };

  const handleOpenEdit = (row: Record<string, unknown>) => {
    setEditingRow(row);
    setIsModalOpen(true);
  };

  const handleModalSubmit = (formData: Record<string, string>) => {
    if (editingRow) {
      const rowIndex = editingRow._rowIndex;
      if (typeof rowIndex !== 'number') {
        Swal.fire('Error', 'No se encontró el índice del registro a actualizar.', 'error');
        return;
      }

      updateMutation.mutate(
        { ...formData, _rowIndex: rowIndex },
        {
          onSuccess: () => {
            setIsModalOpen(false);
            Swal.fire('Actualizado', 'El registro fue actualizado correctamente.', 'success');
          },
          onError: (err) => Swal.fire('Error', err.message, 'error'),
        }
      );
    } else {
      addMutation.mutate(formData, {
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
          <p className="text-sm text-gray-500">Gestión de registros y operaciones de la hoja seleccionada.</p>
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
          columns={data.columns} 
          rows={data.rows} 
          onEdit={handleOpenEdit} 
        />
      ) : (
        <div className="text-gray-500 italic p-6 border border-gray-200 rounded-xl bg-white text-center text-sm shadow-sm">
          No se encontraron registros.
        </div>
      )}

      {data && data.columns && (
        <ModalForm
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleModalSubmit}
          title={editingRow ? 'Editar registro' : 'Nuevo registro'}
          columns={data.columns}
          initialData={editingRow}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
