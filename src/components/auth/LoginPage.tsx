import { useApp } from '../../context/useApp'
import { ArrowRight, Sheet, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  const { signIn, isLoading, isAuthenticating, error } = useApp()

  const isDisabled = isLoading || isAuthenticating

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-sky-300/35 blur-3xl" />
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-blue-200/45 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-indigo-200/30 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-[0_30px_90px_-40px_rgba(30,64,175,0.45)] backdrop-blur">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-red-500 to-red-500 text-white shadow-lg shadow-blue-500/25">
              <Sheet size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Acceso Seguro</p>
              <h1 className="text-lg font-bold text-slate-900">Clientes Nuevos Data</h1>
            </div>
          </div>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-slate-600">
          Inicia sesion con tu cuenta Google para validar acceso.
        </p>

        <div className="mb-6 space-y-3 rounded-2xl bg-slate-50 p-4">
          {[
            { icon: <ShieldCheck size={15} />, text: 'OAuth 2.0 con Google Identity' },
            { icon: <Sheet size={15} />, text: 'Validacion directa de Google Sheets API' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="text-red-600">{icon}</span>
              {text}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <button
          onClick={signIn}
          disabled={isDisabled}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          <span>{isDisabled ? 'Conectando...' : 'Continuar con Google'}</span>
          <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
        </button>

      </div>
    </div>
  )
}
