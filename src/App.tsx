import LoginPage from './components/auth/LoginPage'
import { AppProvider, useApp } from './context/AppContext'

function ConnectedView() {
  const { user, signOut, spreadsheetId, spreadsheetTitle } = useApp()

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_30px_100px_-50px_rgba(30,64,175,0.4)]">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">Sesion Activa</p>
        <h1 className="text-2xl font-bold text-slate-900">Login completado</h1>
        <p className="mt-2 text-sm text-slate-600">El acceso a Google y al Sheet fue validado correctamente.</p>

        <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
          <p>
            <span className="font-semibold text-slate-900">Usuario:</span> {user?.name || 'Usuario'}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Email:</span> {user?.email || 'Sin email'}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Spreadsheet:</span> {spreadsheetTitle || 'Sin titulo'}
          </p>
          <p className="break-all">
            <span className="font-semibold text-slate-900">ID:</span> {spreadsheetId}
          </p>
        </div>

        <button
          onClick={signOut}
          className="mt-6 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Cerrar sesion
        </button>
      </section>
    </main>
  )
}

function AppContent() {
  const { isSignedIn } = useApp()

  if (!isSignedIn) {
    return <LoginPage />
  }

  return <ConnectedView />
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
