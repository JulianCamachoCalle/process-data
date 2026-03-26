import { useEffect, useMemo, useState } from 'react'
import type { RawSheetData } from '../../../services/sheetsData'
import type { RowRecord } from './shared'
import { formatInt } from './shared'

type CrudModalMode = 'create' | 'edit' | null

export default function CrudSection({
  sheet,
  title,
  description,
  visibleRecords,
  onCreate,
  onUpdate,
  onDelete,
  busy,
}: {
  sheet: RawSheetData
  title: string
  description: string
  visibleRecords: RowRecord[]
  onCreate: (sheetName: string, rowValues: string[]) => Promise<void>
  onUpdate: (sheetName: string, rowNumber: number, rowValues: string[]) => Promise<void>
  onDelete: (sheetName: string, rowNumber: number) => Promise<void>
  busy: boolean
}) {
  const headers = sheet.headers
  const [createDraft, setCreateDraft] = useState<string[]>(() => headers.map(() => ''))
  const [editRowNumber, setEditRowNumber] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)
  const [crudModalMode, setCrudModalMode] = useState<CrudModalMode>(null)

  useEffect(() => {
    setCreateDraft(headers.map(() => ''))
    setEditRowNumber(null)
    setEditDraft([])
    setSearchTerm('')
    setPage(1)
    setCrudModalMode(null)
  }, [sheet.sheetName, headers])

  useEffect(() => {
    if (!crudModalMode) return

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCrudModalMode(null)
      }
    }

    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [crudModalMode])

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredRecords = useMemo(() => {
    if (!normalizedSearch) return visibleRecords

    return visibleRecords.filter((record) => {
      if (String(record.rowNumber).includes(normalizedSearch)) return true
      return record.row.some((cell) => (cell || '').toLowerCase().includes(normalizedSearch))
    })
  }, [visibleRecords, normalizedSearch])

  useEffect(() => {
    setPage(1)
  }, [normalizedSearch, pageSize])

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const startIndex = (page - 1) * pageSize
  const pagedRecords = filteredRecords.slice(startIndex, startIndex + pageSize)
  const fromLabel = filteredRecords.length > 0 ? startIndex + 1 : 0
  const toLabel = filteredRecords.length > 0 ? startIndex + pagedRecords.length : 0
  const canCreate = createDraft.some((value) => value.trim().length > 0)
  const isCreateModal = crudModalMode === 'create'
  const isEditModal = crudModalMode === 'edit'

  const handleEditStart = (record: RowRecord) => {
    setEditRowNumber(record.rowNumber)
    setEditDraft(headers.map((_, index) => record.row[index] || ''))
    setCrudModalMode('edit')
  }

  const openCreateModal = () => {
    setCreateDraft(headers.map(() => ''))
    setCrudModalMode('create')
  }

  const handleCreate = async () => {
    if (!canCreate) return
    await onCreate(sheet.sheetName, createDraft)
    setCreateDraft(headers.map(() => ''))
    setCrudModalMode(null)
  }

  const handleUpdate = async () => {
    if (editRowNumber === null) return
    await onUpdate(sheet.sheetName, editRowNumber, editDraft)
    setEditRowNumber(null)
    setEditDraft([])
    setCrudModalMode(null)
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.7)] backdrop-blur">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{description}</p>
      </div>

      {headers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          La hoja no tiene cabeceras. Agrega encabezados en la primera fila para habilitar CRUD.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_auto_auto] xl:grid-cols-[1fr_auto_auto_auto]">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Buscar en filas
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Fila, tienda, vendedor, estado..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Filas por pagina
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value) || 25)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={`page-size-${size}`} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <div className="self-end rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              Mostrando {formatInt(fromLabel)} - {formatInt(toLabel)} de {formatInt(filteredRecords.length)}
            </div>

            <button
              onClick={openCreateModal}
              disabled={busy}
              className="self-end rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              Nuevo registro
            </button>
          </div>

          <div className="max-w-full rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Registros de la hoja</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSearchTerm('')}
                  disabled={!searchTerm}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  Limpiar busqueda
                </button>
                <button
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  Anterior
                </button>
                <span className="text-xs font-semibold text-slate-600">
                  Pagina {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  Siguiente
                </button>
              </div>
            </div>

            {pagedRecords.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                No hay filas que coincidan con la busqueda o el rango de fechas seleccionado.
              </div>
            ) : (
              <div className="max-h-[460px] max-w-full overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">Fila</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">Acciones</th>
                      {headers.map((header, index) => (
                        <th
                          key={`header-${index + 1}`}
                          className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRecords.map((record) => (
                      <tr key={`row-${record.rowNumber}`} className="odd:bg-white even:bg-slate-50">
                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2 font-semibold text-slate-600">
                          {record.rowNumber}
                        </td>
                        <td className="whitespace-nowrap border-b border-slate-100 px-2 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditStart(record)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => {
                                if (!window.confirm(`Eliminar fila ${record.rowNumber} de ${sheet.sheetName}?`)) return
                                void onDelete(sheet.sheetName, record.rowNumber)
                              }}
                              className="rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-700"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                        {headers.map((_, index) => (
                          <td
                            key={`cell-${record.rowNumber}-${index + 1}`}
                            className="max-w-56 truncate border-b border-slate-100 px-3 py-2 text-slate-700"
                          >
                            {record.row[index] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {crudModalMode && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" onClick={() => setCrudModalMode(null)}>
              <section
                className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      {isCreateModal ? 'Crear nuevo registro' : `Editar fila ${editRowNumber || ''}`}
                    </h4>
                    <p className="text-xs text-slate-500">{sheet.sheetName}</p>
                  </div>
                  <button
                    onClick={() => setCrudModalMode(null)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700"
                  >
                    Cerrar
                  </button>
                </header>

                <div className="max-h-[68vh] overflow-auto px-4 py-4 sm:px-5">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {headers.map((header, index) => (
                      <label
                        key={`modal-${header}-${index + 1}`}
                        className={`text-xs ${isCreateModal ? 'text-slate-600' : 'text-amber-800'}`}
                      >
                        {header}
                        <input
                          value={isCreateModal ? createDraft[index] || '' : editDraft[index] || ''}
                          onChange={(event) => {
                            const value = event.target.value
                            if (isCreateModal) {
                              const next = [...createDraft]
                              next[index] = value
                              setCreateDraft(next)
                              return
                            }

                            const next = [...editDraft]
                            next[index] = value
                            setEditDraft(next)
                          }}
                          className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm text-slate-800 ${
                            isCreateModal ? 'border-slate-300' : 'border-amber-300'
                          }`}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
                  {isCreateModal && (
                    <button
                      onClick={() => setCreateDraft(headers.map(() => ''))}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
                    >
                      Limpiar
                    </button>
                  )}
                  <button
                    onClick={() => setCrudModalMode(null)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (isCreateModal) {
                        void handleCreate()
                        return
                      }
                      if (isEditModal) {
                        void handleUpdate()
                      }
                    }}
                    disabled={busy || (isCreateModal && !canCreate) || (isEditModal && editRowNumber === null)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60 ${
                      isCreateModal ? 'bg-slate-900' : 'bg-amber-600'
                    }`}
                  >
                    {isCreateModal ? 'Crear fila' : 'Guardar cambios'}
                  </button>
                </footer>
              </section>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
