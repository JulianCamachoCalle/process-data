import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { SheetView } from './components/SheetView';
import { DashboardOverview } from './features/dashboard/DashboardOverview';
import { Login } from './features/auth/Login';
import { KommoSyncPanel } from './features/kommo/sync/KommoSyncPanel';
import { KommoExplorer } from './features/kommo/explorer/KommoExplorer';
import { KommoLeadsInsights } from './features/kommo/insights/KommoLeadsInsights';
import { prefetchSheetData } from './hooks/useSheetData';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const SHEETS = [
  'DESTINOS',
  'TARIFAS',
  'TIENDAS',
  'COURIER',
  'FULLFILMENT',
  'ORIGEN',
  'RESULTADOS',
  'TIPO DE PUNTO',
  'TIPO DE RECOJO',
  'ENVIOS',
  'RECOJOS',
  'LEADS GANADOS'
];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    const validateSession = async () => {
      try {
        const response = await fetch('/api/auth', {
          method: 'GET',
          credentials: 'include',
        });

        if (!isMounted) return;
        setIsAuthenticated(response.ok);
      } catch {
        if (!isMounted) return;
        setIsAuthenticated(false);
      }
    };

    void validateSession();

    return () => {
      isMounted = false;
    };
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Verificando sesión...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function Layout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showSecretPanel, setShowSecretPanel] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const persisted = window.localStorage.getItem('sidebarCollapsed');
    setSidebarCollapsed(persisted === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const syncSidebarState = (event: MediaQueryList | MediaQueryListEvent) => {
      if (event.matches) {
        setMobileSidebarOpen(false);
      }
    };

    syncSidebarState(mediaQuery);
    const listener = (event: MediaQueryListEvent) => syncSidebarState(event);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }

    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }, []);

  const prefetchSheet = (sheetName: string) => {
    void prefetchSheetData(queryClient, sheetName);
  };

  const handleLogout = async () => {
    try {
      if (isSupabaseConfigured() && supabase) {
        await supabase.auth.signOut();
      }

      await fetch('/api/auth', {
        method: 'DELETE',
        credentials: 'include',
      });
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="relative flex min-h-screen min-h-[100dvh] bg-transparent text-gray-900 font-sans selection:bg-red-100 selection:text-red-900 md:h-screen md:overflow-hidden print:h-auto print:overflow-visible">
      {mobileSidebarOpen && (
        <button
          aria-label="Cerrar menú lateral"
          className="fixed inset-0 z-30 bg-black/45 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <Sidebar
        sheets={SHEETS}
        prefetchHandlers={{
          onSheetHover: prefetchSheet,
          onSheetFocus: prefetchSheet,
        }}
        onSecretClick={() => setShowSecretPanel(true)}
        collapsed={sidebarCollapsed}
        isMobileOpen={mobileSidebarOpen}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onNavigate={() => setMobileSidebarOpen(false)}
      />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-white/90 via-white/75 to-white/95 backdrop-blur-sm print:overflow-visible">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-gray-200/80 bg-white/75 px-4 py-3 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.45)] backdrop-blur-md sm:min-h-20 sm:px-6 md:px-8 print:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-300 bg-white/90 text-gray-700 shadow-sm hover:bg-gray-100 md:hidden"
              aria-label="Abrir menú lateral"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 sm:text-sm">Centro de Control</h2>
              <p className="mt-1 hidden text-xs text-gray-400 sm:block">Panel administrativo logístico</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="shrink-0 rounded-full border border-gray-300 bg-white/90 px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 sm:px-4 sm:py-2.5"
          >
            Cerrar sesión
          </button>
        </header>
        <main className="relative flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 lg:p-10 print:overflow-visible print:p-0">
          <div className="mx-auto w-full max-w-7xl print:max-w-none">
            <Routes>
              <Route path="/" element={<DashboardOverview />} />
              <Route path="/tabla/:sheetName" element={<SheetRouteWrapper />} />
              <Route path="/sheet/:sheetName" element={<LegacySheetRedirect />} />
              <Route path="/kommo" element={<KommoExplorer />} />
              <Route path="/kommo/leads-insights" element={<KommoLeadsInsights />} />
              <Route path="/kommo/:resource" element={<KommoExplorer />} />
            </Routes>
          </div>
        </main>
      </div>
      {showSecretPanel && <KommoSyncPanel onClose={() => setShowSecretPanel(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

function SheetRouteWrapper() {
  const { sheetName } = useParams<{ sheetName: string }>();
  if (!sheetName) return <div>No hay ninguna tabla seleccionada.</div>;
  return <SheetView key={sheetName} sheetName={sheetName} />;
}

function LegacySheetRedirect() {
  const { sheetName } = useParams<{ sheetName: string }>();
  if (!sheetName) return <Navigate to="/" replace />;
  return <Navigate to={`/tabla/${encodeURIComponent(sheetName)}`} replace />;
}
