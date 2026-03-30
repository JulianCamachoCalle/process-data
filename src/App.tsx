import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { SheetView } from './components/SheetView';
import { DashboardOverview } from './features/dashboard/DashboardOverview';
import { Login } from './features/auth/Login';

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
  const token = localStorage.getItem('auth_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Layout() {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-transparent overflow-hidden text-gray-900 font-sans selection:bg-red-100 selection:text-red-900">
      <Sidebar sheets={SHEETS} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gradient-to-b from-white/90 via-white/75 to-white/95 z-10 relative backdrop-blur-sm">
        <header className="h-20 border-b border-gray-200/80 flex items-center justify-between px-8 bg-white/75 backdrop-blur-md sticky top-0 z-20 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.45)]">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-[0.16em]">Centro de Control</h2>
            <p className="text-xs text-gray-400 mt-1">Panel administrativo logístico</p>
          </div>
          <button 
            onClick={handleLogout}
            className="text-xs font-semibold text-gray-600 hover:text-red-700 transition-colors bg-white/90 hover:bg-red-50 px-4 py-2.5 rounded-full border border-gray-300 hover:border-red-300 shadow-sm"
          >
            Cerrar sesión
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-8 md:p-10 relative">
          <div className="max-w-7xl mx-auto">
            <Routes>
              <Route path="/" element={<DashboardOverview />} />
              <Route path="/sheet/:sheetName" element={<SheetRouteWrapper />} />
            </Routes>
          </div>
        </main>
      </div>
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
