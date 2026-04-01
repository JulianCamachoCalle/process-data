import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './components/Sidebar';
import { SheetView } from './components/SheetView';
import { DashboardOverview } from './features/dashboard/DashboardOverview';
import { Login } from './features/auth/Login';
import { KommoSyncPanel } from './features/kommo/KommoSyncPanel';
import { KommoExplorer } from './features/kommo/KommoExplorer';
import { prefetchSheetData } from './hooks/useSheetData';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const SHEETS = [
  'DESTINOS',
  'TARIFAS',
  'TIENDAS',
  'COURIER',
  'VENDEDORES',
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

  const w2kFont: React.CSSProperties = {
    fontFamily: "Tahoma, 'MS Sans Serif', Arial, sans-serif",
  };

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: '#008080', ...w2kFont }}
    >
      {/* Outer window frame */}
      <div
        className="flex flex-col flex-1 m-1 overflow-hidden"
        style={{
          background: '#d4d0c8',
          border: '2px solid #ffffff',
          borderRight: '2px solid #404040',
          borderBottom: '2px solid #404040',
          boxShadow: '2px 2px 0 #000',
        }}
      >
        {/* Window title bar */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 flex-shrink-0"
          style={{ background: 'linear-gradient(to right, #0a246a, #a6caf0)' }}
        >
          <div
            className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-[9px]"
            style={{ background: '#c0c0c0', border: '1px solid #808080' }}
          >
            🖥
          </div>
          <span className="text-white text-[11px] font-bold flex-1" style={w2kFont}>
            Panel Logístico — Centro de Control Administrativo
          </span>
          {/* Window controls */}
          <div className="flex gap-0.5">
            {['_', '□', '✕'].map((ch) => (
              <div
                key={ch}
                className="w-[17px] h-[14px] flex items-center justify-center text-[9px] font-bold text-black cursor-default"
                style={{
                  background: '#d4d0c8',
                  border: '1px solid #ffffff',
                  borderRight: '1px solid #404040',
                  borderBottom: '1px solid #404040',
                }}
              >
                {ch}
              </div>
            ))}
          </div>
        </div>

        {/* Menu bar */}
        <div
          className="flex items-center px-1 flex-shrink-0"
          style={{ borderBottom: '1px solid #a0a0a0', background: '#d4d0c8' }}
        >
          {['Archivo', 'Editar', 'Ver', 'Favoritos', 'Herramientas', 'Ayuda'].map((m) => (
            <span
              key={m}
              className="text-[11px] px-2 py-0.5 cursor-default hover:bg-[#0a246a] hover:text-white"
              style={w2kFont}
            >
              {m}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-2 pr-2">
            <button
              onClick={handleLogout}
              className="text-[11px] px-3 py-0.5 cursor-default"
              style={{
                ...w2kFont,
                background: '#d4d0c8',
                border: '1px solid #ffffff',
                borderRight: '1px solid #404040',
                borderBottom: '1px solid #404040',
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div
          className="flex items-center gap-1 px-2 py-1 flex-shrink-0"
          style={{ borderBottom: '1px solid #a0a0a0', background: '#d4d0c8' }}
        >
          {['◄', '►', '↑', '✕', '🔄'].map((icon) => (
            <div
              key={icon}
              className="w-7 h-6 flex items-center justify-center text-[12px] cursor-default"
              style={{
                background: '#d4d0c8',
                border: '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.border = '1px solid #808080';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.border = '1px solid transparent';
              }}
            >
              {icon}
            </div>
          ))}
          <div className="w-px h-5 bg-[#808080] mx-1" />
          <div
            className="flex items-center gap-1 flex-1 max-w-md px-1"
            style={{
              background: '#ffffff',
              border: '1px solid #808080',
              borderRight: '1px solid #ffffff',
              borderBottom: '1px solid #ffffff',
              height: 22,
            }}
          >
            <span className="text-[10px] text-gray-500" style={w2kFont}>Dirección:</span>
            <span className="text-[11px] text-[#0000ee] underline truncate" style={w2kFont}>
              http://localhost/panel-logistico
            </span>
          </div>
        </div>

        {/* Main content area: sidebar + main */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Sidebar
            sheets={SHEETS}
            prefetchHandlers={{
              onSheetHover: prefetchSheet,
              onSheetFocus: prefetchSheet,
            }}
            onSecretClick={() => setShowSecretPanel(true)}
          />

          {/* Content pane */}
          <main
            className="flex-1 overflow-y-auto p-4"
            style={{ background: '#ffffff' }}
          >
            <Routes>
              <Route path="/" element={<DashboardOverview />} />
              <Route path="/sheet/:sheetName" element={<SheetRouteWrapper />} />
              <Route path="/kommo" element={<KommoExplorer />} />
              <Route path="/kommo/:resource" element={<KommoExplorer />} />
            </Routes>
          </main>
        </div>

        {/* Status bar */}
        <div
          className="flex items-center gap-4 px-2 py-0.5 flex-shrink-0"
          style={{ borderTop: '1px solid #a0a0a0', background: '#d4d0c8' }}
        >
          <span
            className="text-[10px]"
            style={{
              ...w2kFont,
              borderRight: '1px solid #a0a0a0',
              paddingRight: 8,
              marginRight: 4,
            }}
          >
            ✔ Listo
          </span>
          <span className="text-[10px]" style={w2kFont}>
            Panel Logístico v1.0
          </span>
          <div className="ml-auto flex items-center gap-1 text-[10px]" style={w2kFont}>
            <span>🔒</span>
            <span>Zona de confianza local</span>
          </div>
        </div>
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
  if (!sheetName) return <div>No hay ninguna hoja seleccionada.</div>;
  return <SheetView key={sheetName} sheetName={sheetName} />;
}
