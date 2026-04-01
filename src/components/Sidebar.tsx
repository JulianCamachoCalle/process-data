import { Link, useLocation } from 'react-router-dom';
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

const w2kFont: React.CSSProperties = {
  fontFamily: "Tahoma, 'MS Sans Serif', Arial, sans-serif",
};

export function Sidebar({ sheets, prefetchHandlers, onSecretClick }: SidebarProps) {
  const location = useLocation();
  const groupedSheets = groupSheetsByDomain(sheets);
  const isKommoActive = location.pathname === '/kommo' || location.pathname.startsWith('/kommo/');

  const renderGroup = (groupName: string, groupSheets: string[]) => {
    if (!groupSheets.length) return null;
    return (
      <div>
        {/* Group header — looks like a classic folder tree label */}
        <div
          className="px-2 py-1 text-[11px] font-bold select-none"
          style={{ ...w2kFont, color: '#000080' }}
        >
          📁 {groupName}
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
              className="flex items-center gap-1.5 w-full px-4 py-0.5 text-[11px] select-none"
              style={{
                ...w2kFont,
                background: isActive ? '#0a246a' : 'transparent',
                color: isActive ? '#ffffff' : '#000000',
                textDecoration: 'none',
              }}
            >
              <span style={{ opacity: 0.7 }}>🗒</span>
              <span className="truncate">{getSheetLabel(sheet)}</span>
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <aside
      className="w-56 min-h-screen flex flex-col overflow-hidden"
      style={{
        background: '#d4d0c8',
        borderRight: '2px solid #808080',
        ...w2kFont,
      }}
    >
      {/* Title bar of the sidebar window */}
      <div
        className="flex items-center gap-1.5 px-2 py-1"
        style={{
          background: 'linear-gradient(to right, #0a246a, #a6caf0)',
        }}
      >
        <div
          className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center"
          style={{ background: '#c0c0c0', border: '1px solid #808080' }}
        >
          <div style={{ width: 8, height: 6, background: '#0a246a' }} />
        </div>
        <span className="text-white text-[11px] font-bold truncate" style={w2kFont}>
          Panel Logístico
        </span>
      </div>

      {/* Explorer-style toolbar */}
      <div
        className="flex items-center gap-1 px-1 py-1"
        style={{ borderBottom: '1px solid #a0a0a0', background: '#d4d0c8' }}
      >
        <span className="text-[10px] cursor-default px-1 hover:bg-[#0a246a] hover:text-white" style={w2kFont}>Archivo</span>
        <span className="text-[10px] cursor-default px-1 hover:bg-[#0a246a] hover:text-white" style={w2kFont}>Ver</span>
        <span className="text-[10px] cursor-default px-1 hover:bg-[#0a246a] hover:text-white" style={w2kFont}>Ir</span>
      </div>

      {/* Address bar */}
      <div
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ borderBottom: '1px solid #a0a0a0', background: '#d4d0c8' }}
      >
        <span className="text-[10px] flex-shrink-0" style={w2kFont}>Dirección</span>
        <div
          className="flex-1 text-[10px] px-1 truncate"
          style={{
            background: '#ffffff',
            border: '1px solid #808080',
            borderRight: '1px solid #ffffff',
            borderBottom: '1px solid #ffffff',
            ...w2kFont,
          }}
        >
          {location.pathname}
        </div>
      </div>

      {/* Tree / nav */}
      <nav className="flex-1 overflow-y-auto py-1" style={{ background: '#ffffff' }}>
        {/* Dashboard */}
        <Link
          to="/"
          className="flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] select-none"
          style={{
            ...w2kFont,
            background: location.pathname === '/' ? '#0a246a' : 'transparent',
            color: location.pathname === '/' ? '#ffffff' : '#000000',
            textDecoration: 'none',
          }}
        >
          <span>🖥</span>
          <span>Resumen general</span>
        </Link>

        <div className="mt-1">
          {renderGroup('Tablas base', groupedSheets.base)}
          {renderGroup('Tablas operativas', groupedSheets.operativas)}

          {/* Kommo CRM group */}
          <div>
            <div
              className="px-2 py-1 text-[11px] font-bold select-none"
              style={{ ...w2kFont, color: '#000080' }}
            >
              📁 Kommo CRM
            </div>
            <Link
              to="/kommo"
              className="flex items-center gap-1.5 w-full px-4 py-0.5 text-[11px] select-none"
              style={{
                ...w2kFont,
                background: isKommoActive ? '#0a246a' : 'transparent',
                color: isKommoActive ? '#ffffff' : '#000000',
                textDecoration: 'none',
              }}
            >
              <span style={{ opacity: 0.7 }}>🗃</span>
              <span>Kommo Explorer</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Status bar */}
      <div
        className="px-2 py-1 flex items-center justify-between"
        style={{ borderTop: '1px solid #a0a0a0', background: '#d4d0c8' }}
      >
        <span className="text-[10px]" style={w2kFont}>
          {sheets.length} objeto(s)
        </span>
        <button
          onClick={onSecretClick}
          className="text-[10px] px-1 cursor-default hover:bg-[#0a246a] hover:text-white"
          style={w2kFont}
          title="Administración"
        >
          ⚙
        </button>
      </div>
    </aside>
  );
}
