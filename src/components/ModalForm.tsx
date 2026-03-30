import { useMemo, useState } from 'react';
import { Save, X, FilePenLine, Lock, Sparkles } from 'lucide-react';
import {
  formatInputValueByType,
  getFormDefaultValue,
  inferFormInputType,
  isHiddenFormColumn,
  isReadOnlyFormColumn,
  type FormInputType,
} from '../lib/formRules';

type FormInitialData = Record<string, unknown>;

interface FormField {
  column: string;
  inputType: FormInputType;
  readOnly: boolean;
}

function buildInitialFormData(
  sheetName: string,
  fields: FormField[],
  initialData?: FormInitialData | null,
) {
  const values: Record<string, string> = {};

  for (const field of fields) {
    const sourceValue = initialData
      ? (initialData[field.column] ?? '')
      : getFormDefaultValue(sheetName, field.column, field.inputType);
    values[field.column] = formatInputValueByType(field.inputType, sourceValue);
  }

  return values;
}

interface ModalFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Record<string, string>) => void;
  title: string;
  sheetName: string;
  columns: string[];
  selectOptionsByColumn?: Record<string, string[]>;
  previewValuesByColumn?: Record<string, string>;
  onFormValueChange?: (column: string, value: string) => void;
  initialData?: FormInitialData | null;
  isSubmitting?: boolean;
}

export function ModalForm({
  isOpen,
  onClose,
  onSubmit,
  title,
  sheetName,
  columns,
  selectOptionsByColumn,
  previewValuesByColumn,
  onFormValueChange,
  initialData,
  isSubmitting,
}: ModalFormProps) {
  const fields = useMemo<FormField[]>(
    () =>
      columns
        .filter((column) => !isHiddenFormColumn(sheetName, column))
        .map((column) => {
          const sampleValue = initialData?.[column] ?? '';
          const inputType = inferFormInputType(sheetName, column, sampleValue);

          return {
            column,
            inputType,
            readOnly: isReadOnlyFormColumn(sheetName, column),
          };
        }),
    [columns, initialData, sheetName],
  );

  const [formData, setFormData] = useState<Record<string, string>>(() =>
    buildInitialFormData(sheetName, fields, initialData),
  );

  const editableCount = fields.filter((field) => !field.readOnly).length;
  const readOnlyCount = fields.length - editableCount;
  const hasNoEditableFields = editableCount === 0;

  if (!isOpen) return null;

  const handleChange = (col: string, val: string) => {
    setFormData(prev => ({ ...prev, [col]: val }));
    onFormValueChange?.(col, val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload = fields.reduce<Record<string, string>>((acc, field) => {
      if (!field.readOnly) {
        acc[field.column] = formData[field.column] ?? '';
      }

      return acc;
    }, {});

    onSubmit(payload);
  };

  const getInputProps = (inputType: FormInputType) => {
    switch (inputType) {
      case 'number':
        return { type: 'number' as const, inputMode: 'decimal' as const, step: 'any' };
      case 'date':
        return { type: 'date' as const };
      case 'month':
        return { type: 'month' as const };
      case 'email':
        return { type: 'email' as const, inputMode: 'email' as const };
      case 'tel':
        return { type: 'tel' as const, inputMode: 'tel' as const };
      default:
        return { type: 'text' as const };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md">
      <div className="bg-white rounded-2xl shadow-[0_30px_60px_-24px_rgba(0,0,0,0.65)] w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-gray-50 to-white">
          <div>
            <h3 className="text-lg font-bold text-gray-900 inline-flex items-center gap-2">
              <FilePenLine size={18} className="text-red-600" />
              {title}
            </h3>
            <p className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1.5">
              <Sparkles size={12} className="text-red-500" />
              {editableCount} editable(s) · {readOnlyCount} automática(s)
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 bg-white">
          <form id="modal-form" onSubmit={handleSubmit} className="space-y-5">
            {hasNoEditableFields && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Esta hoja no tiene campos editables configurados actualmente.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((field) => {
                const inputProps = getInputProps(field.inputType);
                const value = formData[field.column] || '';
                const selectOptions = selectOptionsByColumn?.[field.column] ?? [];
                const isSelectField = selectOptions.length > 0;
                const previewValue = previewValuesByColumn?.[field.column];
                const readOnlyDisplayValue =
                  previewValue !== undefined && previewValue !== null && previewValue !== ''
                    ? previewValue
                    : value;

                return (
                  <div key={field.column} className={field.inputType === 'textarea' ? 'md:col-span-2' : ''}>
                    <label className="text-sm font-semibold text-gray-700 mb-1.5 inline-flex items-center gap-2">
                      {field.column}
                      {field.readOnly && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-[11px] font-semibold">
                          <Lock size={10} />
                          Auto
                        </span>
                      )}
                    </label>

                    {field.readOnly ? (
                      <div className="w-full px-3 py-2.5 border rounded-xl shadow-sm sm:text-sm transition-all bg-gray-50 text-gray-600 border-gray-200 min-h-[42px] inline-flex items-center">
                        {readOnlyDisplayValue || 'Se calcula automáticamente'}
                      </div>
                    ) : isSelectField ? (
                      <select
                        value={value}
                        onChange={(e) => handleChange(field.column, e.target.value)}
                        disabled={false}
                        className={`w-full px-3 py-2.5 border rounded-xl shadow-sm sm:text-sm transition-all ${
                          'border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400'
                        }`}
                      >
                        <option value="">Seleccioná {field.column}</option>
                        {selectOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : field.inputType === 'textarea' ? (
                      <textarea
                        value={value}
                        onChange={(e) => handleChange(field.column, e.target.value)}
                        readOnly={false}
                        rows={3}
                        placeholder={`Ingresá ${field.column}`}
                        className={`w-full px-3 py-2.5 border rounded-xl shadow-sm sm:text-sm transition-all resize-y min-h-24 ${
                          'border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400'
                        }`}
                      />
                    ) : (
                      <input
                        {...inputProps}
                        value={value}
                        onChange={(e) => handleChange(field.column, e.target.value)}
                        readOnly={false}
                        placeholder={`Ingresá ${field.column}`}
                        className={`w-full px-3 py-2.5 border rounded-xl shadow-sm sm:text-sm transition-all ${
                          'border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </form>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 inline-flex items-center gap-1.5">
            <X size={15} />
            Cancelar
          </button>
          <button 
            type="submit" 
            form="modal-form"
            disabled={isSubmitting || hasNoEditableFields}
            className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-red-500 border border-transparent rounded-xl hover:from-red-700 hover:to-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <Save size={15} />
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
