import { useMemo } from 'react';
import { useSheetData } from '../../hooks/useSheetData';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Package, 
  DollarSign, 
  CreditCard, 
  TrendingUp,
  AlertCircle,
  Activity,
  ChartColumnBig
} from 'lucide-react';

function parseCurrency(value: string | number | boolean | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return 0;
  const cleaned = value.toString().replace(/[S/$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export function DashboardOverview() {
  const { data, isLoading, error } = useSheetData('ENVIOS');

  const metrics = useMemo(() => {
    if (!data?.rows) {
      return { totalEnvios: 0, totalIngreso: 0, totalCosto: 0, margen: 0, chartData: [] };
    }

    let totalIngreso = 0;
    let totalCosto = 0;
    
    // Grouping by "mes"
    const byMonth: Record<string, { mes: string; Ingreso: number; Costo: number }> = {};

    data.rows.forEach(row => {
      // Find keys case-insensitively just in case
      const findKey = (search: string) => Object.keys(row).find(k => k.toLowerCase().includes(search.toLowerCase()));
      
      const ingresoKey = findKey('ingreso total') || findKey('ingreso');
      const costoKey = findKey('costo total') || findKey('costo');
      const mesKey = findKey('mes');

      const ingreso = ingresoKey ? parseCurrency(row[ingresoKey]) : 0;
      const costo = costoKey ? parseCurrency(row[costoKey]) : 0;
      const mes = mesKey ? String(row[mesKey]).trim() : 'Desconocido';

      totalIngreso += ingreso;
      totalCosto += costo;

      if (mes) {
        if (!byMonth[mes]) {
          byMonth[mes] = { mes, Ingreso: 0, Costo: 0 };
        }
        byMonth[mes].Ingreso += ingreso;
        byMonth[mes].Costo += costo;
      }
    });

    const chartData = Object.values(byMonth).sort((a, b) => {
      // Very basic sort, assuming months are text like "Enero", "Febrero" or numbers
      // A more robust sort would require exact month formats, but this is a start
      return a.mes.localeCompare(b.mes);
    });

    return {
      totalEnvios: data.rows.length,
      totalIngreso,
      totalCosto,
      margen: totalIngreso - totalCosto,
      chartData
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mr-3"></div>
        Cargando datos del dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 space-y-4">
        <AlertCircle size={48} />
        <p className="text-lg font-medium">Error al cargar el dashboard</p>
        <p className="text-sm text-red-400">{error instanceof Error ? error.message : 'Error desconocido'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white/90 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)] px-6 py-5 backdrop-blur-sm flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 inline-flex items-center gap-2">
            <Activity className="text-red-600" size={24} />
            Resumen de Operaciones
          </h1>
          <p className="text-sm text-gray-500 mt-1">Métricas clave del rendimiento logístico.</p>
        </div>
        <div className="hidden md:inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
          <ChartColumnBig size={14} />
          Vista ejecutiva
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard 
          title="Total Envíos" 
          value={metrics.totalEnvios.toString()} 
          icon={<Package className="text-red-500" size={24} />} 
        />
        <KpiCard 
          title="Ingreso Total" 
          value={`S/ ${metrics.totalIngreso.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`} 
          icon={<DollarSign className="text-green-500" size={24} />} 
        />
        <KpiCard 
          title="Costo Total" 
          value={`S/ ${metrics.totalCosto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`} 
          icon={<CreditCard className="text-red-500" size={24} />} 
        />
        <KpiCard 
          title="Margen" 
          value={`S/ ${metrics.margen.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`} 
          icon={<TrendingUp className="text-purple-500" size={24} />} 
        />
      </div>

      {/* Chart */}
      <div className="bg-white p-6 rounded-2xl shadow-[0_24px_50px_-36px_rgba(15,23,42,0.8)] border border-gray-200 mt-8 h-96">
        <h2 className="text-lg font-bold text-gray-800 mb-6">Ingresos vs Costos por Mes</h2>
        {metrics.chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metrics.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} dy={10} />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#6B7280' }} 
                tickFormatter={(value) => `S/ ${value}`}
              />
              <Tooltip 
                cursor={{ fill: '#F3F4F6' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number | undefined) => [value !== undefined ? `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : 'S/ 0.00', undefined]}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="Ingreso" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={50} />
              <Bar dataKey="Costo" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            No hay datos suficientes para graficar.
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-[0_24px_50px_-36px_rgba(15,23,42,0.8)] border border-gray-200 flex items-center space-x-4 hover:-translate-y-0.5 hover:shadow-[0_28px_56px_-38px_rgba(15,23,42,0.95)] transition-all">
      <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
