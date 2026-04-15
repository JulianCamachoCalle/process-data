import { ArrowLeft, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage({ inPanel = false }: { inPanel?: boolean }) {
  return (
    <section
      className={[
        'relative isolate flex w-full items-center justify-center overflow-hidden px-6 py-10 sm:px-8 sm:py-12',
        inPanel
          ? 'min-h-[calc(100dvh-8rem)] rounded-[1.5rem] border border-black/10 bg-white/80 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.6)] backdrop-blur-sm'
          : 'min-h-screen bg-white',
      ].join(' ')}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_15%,rgba(239,68,68,0.18),transparent_45%),radial-gradient(circle_at_85%_85%,rgba(15,23,42,0.08),transparent_35%)]" />

      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-8 text-center">
        <img
          src="/ImagenError404.png"
          alt="Error 404 - página no encontrada"
          className="h-auto w-full max-w-xl object-contain"
        />

        <div className="max-w-2xl space-y-3">
          <h1 className="text-3xl font-black tracking-tight text-gray-900 sm:text-4xl">Ups... esta página no existe</h1>
          <p className="text-sm leading-7 text-gray-600 sm:text-base">
            La ruta que intentaste abrir no está disponible o fue movida. Tranquilo: volvamos al inicio y seguimos.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            <Home size={16} />
            Ir al inicio
          </Link>

          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 rounded-full border border-black/15 px-5 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-black/5"
          >
            <ArrowLeft size={16} />
            Volver atrás
          </button>

          {inPanel ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-red-500/60 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              Panel
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
