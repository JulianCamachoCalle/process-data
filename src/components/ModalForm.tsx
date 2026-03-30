import { useState, useEffect } from 'react';
import { Save, X, FilePenLine } from 'lucide-react';

interface ModalFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Record<string, string>) => void;
  title: string;
  columns: string[];
  initialData?: Record<string, any> | null;
  isSubmitting?: boolean;
}

export function ModalForm({ isOpen, onClose, onSubmit, title, columns, initialData, isSubmitting }: ModalFormProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        const strData: Record<string, string> = {};
        for (const col of columns) {
          strData[col] = initialData[col] !== undefined && initialData[col] !== null ? String(initialData[col]) : '';
        }
        if (initialData._rowIndex !== undefined) {
          strData._rowIndex = String(initialData._rowIndex);
        }
        setFormData(strData);
      } else {
        const empty: Record<string, string> = {};
        for (const col of columns) empty[col] = '';
        setFormData(empty);
      }
    }
  }, [isOpen, initialData, columns]);

  if (!isOpen) return null;

  const handleChange = (col: string, val: string) => {
    setFormData(prev => ({ ...prev, [col]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md">
      <div className="bg-white rounded-2xl shadow-[0_30px_60px_-24px_rgba(0,0,0,0.65)] w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-gray-50 to-white">
          <h3 className="text-lg font-bold text-gray-900 inline-flex items-center gap-2">
            <FilePenLine size={18} className="text-red-600" />
            {title}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 bg-white">
          <form id="modal-form" onSubmit={handleSubmit} className="space-y-4">
            {columns.map(col => (
              <div key={col}>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">{col}</label>
                <input
                  type="text"
                  value={formData[col] || ''}
                  onChange={e => handleChange(col, e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 sm:text-sm transition-all"
                />
              </div>
            ))}
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
            disabled={isSubmitting}
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
