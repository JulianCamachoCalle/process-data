import { LogOut, RefreshCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import type { NavSection } from './shared'

export default function DashboardLayout({
  userName,
  navSections,
  activeSection,
  onSelectSection,
  activeSectionLabel,
  activeSectionDescription,
  globalRangeLabel,
  loadedSheetsCount,
  globalStartInput,
  globalEndInput,
  onChangeStart,
  onChangeEnd,
  onRefresh,
  onSignOut,
  sectionLoading,
  busyMutation,
  statusMessage,
  error,
  children,
}: {
  userName: string
  navSections: NavSection[]
  activeSection: string
  onSelectSection: (id: string) => void
  activeSectionLabel: string
  activeSectionDescription: string
  globalRangeLabel: string
  loadedSheetsCount: number
  globalStartInput: string
  globalEndInput: string
  onChangeStart: (value: string) => void
  onChangeEnd: (value: string) => void
  onRefresh: () => void
  onSignOut: () => void
  sectionLoading: boolean
  busyMutation: boolean
  statusMessage: string
  error: string | null
  children: ReactNode
}) {
  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="mx-auto w-full max-w-[1540px] rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_26px_56px_-34px_rgba(15,23,42,0.75)] md:p-4">
        <div className="grid min-w-0 gap-4 xl:grid-cols-[310px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-red-200/80 bg-white p-4 shadow-[0_18px_36px_-26px_rgba(15,23,42,0.75)] md:sticky md:top-4 md:h-[calc(100vh-5rem)] md:overflow-auto">
            <div className="mb-4 rounded-2xl bg-gradient-to-br from-red-900 via-red-800 to-red-700 px-4 py-4 text-white">
              <p className="text-[11px] uppercase tracking-[0.16em] text-red-200">Panel Administracion</p>
              <h1 className="mt-1 text-xl font-extrabold tracking-tight">Clientes Nuevos</h1>
              <p className="mt-1 text-xs text-red-100">{userName}</p>
            </div>

            <nav className="space-y-4">
              {navSections
                .filter((section) => section.items.length > 0)
                .map((section) => (
                  <section key={section.id} className="space-y-2">
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{section.title}</p>
                    <div className="space-y-1.5 rounded-2xl border border-slate-200/80 bg-slate-50/65 p-2">
                      {section.items.map((item) => {
                        const active = item.id === activeSection
                        return (
                          <button
                            key={item.id}
                            onClick={() => onSelectSection(item.id)}
                            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                              active
                                ? 'bg-white text-red-700 ring-1 ring-red-200 shadow-[0_10px_18px_-12px_rgba(185,28,28,0.65)]'
                                : 'text-slate-600 hover:bg-white hover:text-slate-900'
                            }`}
                          >
                            {item.icon}
                            <span className="truncate">{item.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
            </nav>
          </aside>

          <section className="min-w-0 space-y-4 overflow-hidden">
            <header className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_18px_36px_-26px_rgba(15,23,42,0.75)]">
              <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Seccion activa</p>
                  <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{activeSectionLabel}</h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600">{activeSectionDescription}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700">
                      Rango: {globalRangeLabel}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700">
                      Hojas cargadas: {loadedSheetsCount}
                    </span>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Filtro global de fecha</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:max-w-lg">
                      <label className="text-xs text-slate-600">
                        Desde
                        <input
                          type="date"
                          value={globalStartInput}
                          onChange={(event) => onChangeStart(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
                        />
                      </label>
                      <label className="text-xs text-slate-600">
                        Hasta
                        <input
                          type="date"
                          value={globalEndInput}
                          onChange={(event) => onChangeEnd(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 max-h-14 lg:justify-end">
                  <button
                    onClick={onRefresh}
                    disabled={sectionLoading || busyMutation}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-900 to-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <RefreshCcw size={15} />
                    Actualizar seccion
                  </button>
                  <button
                    onClick={onSignOut}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <LogOut size={15} />
                    Cerrar sesion
                  </button>
                </div>
              </div>

              {sectionLoading && <p className="mt-3 text-sm text-slate-500">Cargando informacion de la seccion...</p>}
              {statusMessage && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p>}
              {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            </header>

            {children}
          </section>
        </div>
      </div>
    </main>
  )
}
