export default function SessionLoader() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100/80 px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-16 h-56 w-56 rounded-full bg-red-200/40 blur-3xl" />
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-slate-200/45 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-red-100/35 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.35)] backdrop-blur">
        <div className="relative mx-auto mb-5 h-24 w-24">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-red-500 border-r-red-400" />
          <div className="absolute inset-[14px] rounded-full bg-white shadow-[inset_0_8px_18px_rgba(15,23,42,0.08)]" />
          <img
            src="/icon-dinsides.png"
            alt="Dinsides"
            className="absolute inset-0 m-auto h-10 w-10 animate-pulse object-contain"
          />
        </div>

        <p className="text-center text-base font-semibold text-slate-900">Cargando ...</p>
      </div>
    </div>
  )
}
