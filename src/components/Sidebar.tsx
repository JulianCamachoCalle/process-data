import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Database, Sparkles, Layers3, Workflow, Settings } from 'lucide-react';
import { getSheetLabel, groupSheetsByDomain } from '../lib/sheetLabels';

interface SidebarPrefetchHandlers {
  onSheetHover?: (sheet: string) => void;
  onSheetFocus?: (sheet: string) => void;
}

interface SidebarProps {
  sheets: string[];
  prefetchHandlers?: SidebarPrefetchHandlers;
  onSecretClick?: () => void;
}

export function Sidebar({ sheets, prefetchHandlers, onSecretClick }: SidebarProps) {
  const location = useLocation();
  const groupedSheets = groupSheetsByDomain(sheets);

  const renderGroup = (groupName: string, icon: ReactNode, groupSheets: string[]) => {
    if (!groupSheets.length) return null;

    return (
      <div className="space-y-1.5">
        <div className="px-4 pt-3 pb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em] inline-flex items-center gap-2">
          {icon}
          {groupName}
        </div>

        {groupSheets.map((sheet) => {
          const path = `/sheet/${encodeURIComponent(sheet)}`;
          const isActive = location.pathname === path;

          return (
            <Link
              key={sheet}
              to={path}
              onMouseEnter={() => prefetchHandlers?.onSheetHover?.(sheet)}
              onFocus={() => prefetchHandlers?.onSheetFocus?.(sheet)}
              className={`group flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl border transition-all duration-200 ${
                isActive
                  ? 'bg-white/10 text-white font-semibold border-red-500/70 shadow-[0_8px_24px_-18px_rgba(255,255,255,0.8)]'
                  : 'text-gray-400 border-transparent hover:bg-white/5 hover:text-gray-100 hover:border-white/10'
              }`}
            >
              <Database size={16} className={isActive ? 'text-red-300' : 'text-gray-500 group-hover:text-red-200'} />
              <span className="truncate text-sm">{getSheetLabel(sheet)}</span>
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <aside className="w-72 min-h-screen flex flex-col text-white border-r border-red-900/40 bg-gradient-to-b from-[#101218] via-[#0f1219] to-[#0a0c12] shadow-[8px_0_30px_-14px_rgba(0,0,0,0.75)] backdrop-blur-xl relative overflow-hidden">
      <div className="pointer-events-none absolute -top-14 -right-12 h-36 w-36 rounded-full bg-red-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-16 -left-14 h-36 w-36 rounded-full bg-white/10 blur-3xl" />

      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-11 w-11 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center shadow-[0_0_24px_rgba(230,0,0,0.35)]">
            <LayoutDashboard className="text-red-400" size={22} />
          </div>
          <div>
            <h1 className="font-extrabold text-lg leading-tight">Panel Logístico</h1>
            <p className="text-xs text-red-200/80 tracking-wide">Control y Operaciones</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-red-500/35 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-200">
          <Sparkles size={12} />
          Experiencia Profesional
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        <Link
          to="/"
          className={`group flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
            location.pathname === '/'
              ? 'bg-gradient-to-r from-red-600 to-red-500 text-white font-semibold border-red-400/80 shadow-[0_12px_24px_-16px_rgba(230,0,0,0.9)]'
              : 'text-gray-300 border-transparent hover:bg-white/5 hover:text-white hover:border-white/10'
          }`}
        >
          <LayoutDashboard size={18} className={location.pathname === '/' ? 'text-white' : 'text-red-300 group-hover:text-red-200'} />
          <span>Resumen general</span>
        </Link>
        
        {renderGroup(
          'Tablas base',
          <Layers3 size={12} className="text-red-300" />,
          groupedSheets.base
        )}
        {renderGroup(
          'Tablas dependientes y operativas',
          <Workflow size={12} className="text-red-300" />,
          groupedSheets.operativas
        )}
      </nav>

      <div className="px-2 pb-5 pt-1.5 border-t border-white/10">
        
        {/* Hidden admin trigger */}
        <button
          onClick={onSecretClick}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/5 text-gray-600 hover:text-gray-400 hover:bg-white/5 hover:border-white/10 transition-all opacity-30 hover:opacity-60"
        >
          <Settings size={14} />
          <span className="text-[10px]">Admin</span>
        </button>
      </div>
    </aside>
  );
}
