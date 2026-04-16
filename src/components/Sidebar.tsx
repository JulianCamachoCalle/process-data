import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Database, Layers3, Workflow, Settings, PanelLeftClose, X, Megaphone, BarChart3, BookMarked, Send, BookImage, SplitSquareHorizontal, UserCog, ChartColumnIncreasing } from 'lucide-react';
import { getSheetLabel, groupSheetsByDomain } from '../lib/sheetLabels';

interface SidebarPrefetchHandlers {
  onSheetHover?: (sheet: string) => void;
  onSheetFocus?: (sheet: string) => void;
}

interface SidebarProps {
  sheets: string[];
  role: 'admin' | 'user';
  prefetchHandlers?: SidebarPrefetchHandlers;
  onSecretClick?: () => void;
  collapsed?: boolean;
  isMobileOpen?: boolean;
  onToggleCollapsed?: () => void;
  onCloseMobile?: () => void;
  onNavigate?: () => void;
}

export function Sidebar({
  sheets,
  role,
  prefetchHandlers,
  onSecretClick,
  collapsed = false,
  isMobileOpen = false,
  onToggleCollapsed,
  onCloseMobile,
  onNavigate,
}: SidebarProps) {
  const location = useLocation();
  const isAdmin = role === 'admin';
  const groupedSheets = groupSheetsByDomain(sheets);

  const isKommoExplorerActive = location.pathname === '/kommo' || (location.pathname.startsWith('/kommo/') && !location.pathname.startsWith('/kommo/leads-insights'));
  const isKommoInsightsActive = location.pathname === '/kommo/leads-insights';
  const isMetaAdsDashboardActive =
    location.pathname === '/meta/ads/dashboard' ||
    location.pathname === '/meta/ads' ||
    location.pathname === '/dashboard/meta/ads/dashboard' ||
    location.pathname === '/dashboard/meta/ads';
  const isMetaAdsDataActive = location.pathname === '/meta/ads/data';
  const isMetaCompareActive =
    location.pathname === '/meta/compare/dashboard' ||
    location.pathname === '/meta/compare' ||
    location.pathname === '/dashboard/meta/compare/dashboard' ||
    location.pathname === '/dashboard/meta/compare';
  const isMetaPagesActive =
    location.pathname === '/meta/pages/dashboard' ||
    location.pathname === '/meta/pages' ||
    location.pathname === '/dashboard/meta/pages/dashboard' ||
    location.pathname === '/dashboard/meta/pages';
  const isGoogleSheetsExportActive = location.pathname === '/exports/google-sheets';
  const isAdminUsersActive = location.pathname === '/admin/users';
  const isEstadisticasVendedorActive = location.pathname === '/operativas/estadisticas-vendedor';

  const renderGroup = (groupName: string, icon: ReactNode, groupSheets: string[]) => {
    if (!groupSheets.length) return null;

    return (
      <div className="space-y-1.5">
        <div
          className={`px-4 pt-3 pb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em] inline-flex items-center gap-2 ${collapsed ? 'md:justify-center' : ''}`}
          title={collapsed ? groupName : undefined}
        >
          {icon}
          <span className={collapsed ? 'md:hidden' : ''}>{groupName}</span>
        </div>

        {groupSheets.map((sheet) => {
          const path = `/tabla/${encodeURIComponent(sheet)}`;
          const isActive = location.pathname === path;

          return (
            <Link
              key={sheet}
              to={path}
              onClick={() => onNavigate?.()}
              onMouseEnter={() => prefetchHandlers?.onSheetHover?.(sheet)}
              onFocus={() => prefetchHandlers?.onSheetFocus?.(sheet)}
              title={collapsed ? getSheetLabel(sheet) : undefined}
              className={`group flex items-center w-full text-left px-4 py-2.5 rounded-xl border transition-all duration-200 ${isActive
                  ? 'bg-white/10 text-white font-semibold border-red-500/70 shadow-[0_8px_24px_-18px_rgba(255,255,255,0.8)]'
                  : 'text-gray-400 border-transparent hover:bg-white/5 hover:text-gray-100 hover:border-white/10'
                } ${collapsed ? 'md:justify-center md:px-2' : 'gap-3'}`}
            >
              <Database size={16} className={isActive ? 'text-red-500' : 'text-gray-500 group-hover:text-red-400'} />
              <span className={`text-[12px] text-gray-400 font-semibold uppercase tracking-[0.05em] ${collapsed ? 'md:hidden' : ''}`}>{getSheetLabel(sheet)}</span>
            </Link>
          );
        })}
      </div>
    );
  };

  const renderSidebarShell = (className: string, showCloseButton: boolean) => (
    <aside className={className}>
      <div className="pointer-events-none absolute -top-14 -right-12 hidden h-36 w-36 rounded-full bg-red-500/20 blur-3xl md:block" />
      <div className="pointer-events-none absolute bottom-16 -left-14 hidden h-36 w-36 rounded-full bg-white/10 blur-3xl md:block" />

      <div className={`border-b border-white/10 p-5 sm:p-6 ${collapsed ? 'md:px-3' : ''}`}>
        <div className="mb-3 flex items-center justify-between md:justify-start">
          {showCloseButton ? (
            <button
              onClick={onCloseMobile}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 text-gray-200 hover:bg-white/10 md:hidden"
              aria-label="Cerrar menú"
            >
              <X size={16} />
            </button>
          ) : <div className="md:hidden" />}
          <button
            onClick={onToggleCollapsed}
            className="group hidden md:inline-flex md:absolute md:right-3 md:top-3 md:h-7 md:w-7 md:items-center md:justify-center md:rounded-full md:border md:border-white/0 md:bg-white/0 md:text-gray-500/60 md:opacity-35 md:transition-all md:hover:border-white/10 md:hover:bg-white/5 md:hover:text-gray-100 md:hover:opacity-100 focus-visible:opacity-100"
            aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
            title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            <PanelLeftClose size={14} className={collapsed ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        </div>

        <div className="flex items-center gap-3 pr-6 md:pr-0">
          <div className="h-11 w-11 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center shadow-[0_0_24px_rgba(230,0,0,0.35)]">
            <LayoutDashboard className="text-red-500" size={22} />
          </div>
          <div className={collapsed ? 'md:hidden' : ''}>
            <h1 className="text-lg text-white font-extrabold uppercase tracking-[0.10em]">DINSIDES</h1>
            <p className="text-xs text-gray-500 uppercase tracking-[0.10em] italic">Control y Operaciones</p>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
        <Link
          to="/dashboard"
          onClick={() => onNavigate?.()}
          title={collapsed ? 'Resumen general' : undefined}
          className={`group flex items-center w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 ${location.pathname === '/dashboard'
              ? 'bg-gradient-to-r from-red-700 to-red-600 text-white font-semibold border-red-400/80 shadow-[0_12px_24px_-16px_rgba(230,0,0,0.9)]'
              : 'text-gray-300 border-transparent hover:bg-white/5 hover:text-white hover:border-white/10'
            } ${collapsed ? 'md:justify-center md:px-2' : 'gap-3'}`}
          hidden={!isAdmin}
        >
          <BookMarked size={18} className={location.pathname === '/dashboard' ? 'text-white' : 'text-red-500 group-hover:text-red-400'} />
          <span className={collapsed ? 'md:hidden' : 'text-xs text-gray-100 font-semibold uppercase tracking-[0.14em]'}>Resumen general</span>
        </Link>

        {isAdmin && renderGroup(
          'Tablas base',
          <Layers3 size={12} className="text-red-500" />,
          groupedSheets.base
        )}
        {isAdmin && renderGroup(
          'Tablas operativas',
          <Workflow size={12} className="text-red-500" />,
          groupedSheets.operativas
        )}
        {isAdmin && (
          <Link
            to="/operativas/estadisticas-vendedor"
            onClick={() => onNavigate?.()}
            title={collapsed ? 'Estadísticas de vendedor' : undefined}
            className={`group mt-1 flex items-center w-full text-left px-4 py-2.5 rounded-xl border transition-all duration-200 ${isEstadisticasVendedorActive
                ? 'bg-white/10 text-white font-semibold border-red-500/70 shadow-[0_8px_24px_-18px_rgba(255,255,255,0.8)]'
                : 'text-gray-400 border-transparent hover:bg-white/5 hover:text-gray-100 hover:border-white/10'
              } ${collapsed ? 'md:justify-center md:px-2' : 'gap-3'}`}
          >
            <ChartColumnIncreasing size={16} className={isEstadisticasVendedorActive ? 'text-red-500' : 'text-gray-500 group-hover:text-red-400'} />
            <span className={`text-[12px] text-gray-400 font-semibold uppercase tracking-[0.05em] ${collapsed ? 'md:hidden' : ''}`}>Estadísticas de vendedor</span>
          </Link>
        )}

        <div className="space-y-1.5 pt-2">
          <div
            className={`px-4 pt-3 pb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em] inline-flex items-center gap-2 ${collapsed ? 'md:justify-center' : ''}`}
            title={collapsed ? 'Meta Ads' : undefined}
          >
            <Megaphone size={12} className="text-red-500" />
            <span className={collapsed ? 'md:hidden' : ''}>Meta Ads</span>
          </div>

          <Link
            to="/meta/ads/dashboard"
            onClick={() => onNavigate?.()}
            title={collapsed ? 'Meta Ads Dashboard' : undefined}
            className={`group flex items-center w-full text-left px-4 py-2.5 rounded-xl border transition-all duration-200 ${isMetaAdsDashboardActive
                ? 'bg-white/10 text-white font-semibold border-red-500/70 shadow-[0_8px_24px_-18px_rgba(255,255,255,0.8)]'
                : 'text-gray-400 border-transparent hover:bg-white/5 hover:text-gray-100 hover:border-white/10'
              } ${collapsed ? 'md:justify-center md:px-2' : 'gap-3'}`}
          >
            <BarChart3 size={16} className={isMetaAdsDashboardActive ? 'text-red-500' : 'text-gray-500 group-hover:text-red-400'} />
            <span className={`text-[12px] text-gray-400 font-semibold uppercase tracking-[0.05em] ${collapsed ? 'md:hidden' : ''}`}>Ads Dashboard</span>
          </Link>

          {isAdmin && (
            <Link
              to="/meta/ads/data"
              onClick={() => onNavigate?.()}
              title={collapsed ? 'Meta Ads Data' : undefined}
              className={`group flex items-center w-full text-left px-4 py-2.5 rounded-xl border transition-all duration-200 ${isMetaAdsDataActive
                  ? 'bg-white/10 text-white font-semibold border-red-500/70 shadow-[0_8px_24px_-18px_rgba(255,255,255,0.8)]'
                  : 'text-gray-400 border-transparent hover:bg-white/5 hover:text-gray-100 hover:border-white/10'
                } ${collapsed ? 'md:justify-center md:px-2' : 'gap-3'}`}
            >
              <Database size={16} className={isMetaAdsDataActive ? 'text-red-500' : 'text-gray-500 group-hover:text-red-400'} />
              <span className={`text-[12px] text-gray-400 font-semibold uppercase tracking-[0.05em] ${collapsed ? 'md:hidden' : ''}`}>Ads Data</span>
            </Link>
          )}

          <Link
            to="/meta/compare/dashboard"
            onClick={() => onNavigate?.()}
            title={collapsed ? 'Ads vs Orgánico' : undefined}
            className={`group flex items-center w-full text-left px-4 py-2.5 rounded-xl border transition-all duration-200 ${isMetaCompareActive
                ? 'bg-white/10 text-white font-semibold border-red-500/70 shadow-[0_8px_24px_-18px_rgba(255,255,255,0.8)]'
                : 'text-gray-400 border-transparent hover:bg-white/5 hover:text-gray-100 hover:border-white/10'
              } ${collapsed ? 'md:justify-center md:px-2' : 'gap-3'}`}
          >
            <SplitSquareHorizontal size={16} className={isMetaCompareActive ? 'text-red-500' : 'text-gray-500 group-hover:text-red-400'} />
            <span className={`text-[12px] text-gray-400 font-semibold uppercase tracking-[0.05em] ${collapsed ? 'md:hidden' : ''}`}>Ads vs Orgánico</span>
          </Link>
        </div>

        <div className="space-y-1.5 pt-2">
          <div
            className={`px-4 pt-3 pb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em] inline-flex items-center gap-2 ${collapsed ? 'md:justify-center' : ''}`}
            title={collapsed ? 'Meta Pages' : undefined}
          >
            <BookImage size={12} className="text-red-500" />
            <span className={collapsed ? 'md:hidden' : ''}>Meta Pages</span>
          </div>

          <Link
            to="/meta/pages/dashboard"
            onClick={() => onNavigate?.()}
            title={collapsed ? 'Pages Dashboard' : undefined}
            className={`group flex items-center w-full text-left px-4 py-2.5 rounded-xl border transition-all duration-200 ${isMetaPagesActive
                ? 'bg-white/10 text-white font-semibold border-red-500/70 shadow-[0_8px_24px_-18px_rgba(255,255,255,0.8)]'
                : 'text-gray-400 border-transparent hover:bg-white/5 hover:text-gray-100 hover:border-white/10'
              } ${collapsed ? 'md:justify-center md:px-2' : 'gap-3'}`}
          >
            <BookImage size={16} className={isMetaPagesActive ? 'text-red-500' : 'text-gray-500 group-hover:text-red-400'} />
            <span className={`text-[12px] text-gray-400 font-semibold uppercase tracking-[0.05em] ${collapsed ? 'md:hidden' : ''}`}>Pages Dashboard</span>
          </Link>
        </div>

        <div className="space-y-1.5 pt-2">
          <div
            className={`px-4 pt-3 pb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em] inline-flex items-center gap-2 ${collapsed ? 'md:justify-center' : ''}`}
            title={collapsed ? 'Kommo CRM' : undefined}
          >
            <Database size={12} className="text-red-500" />
            <span className={collapsed ? 'md:hidden' : ''}>Kommo CRM</span>
          </div>

          {isAdmin && (
            <Link
              to="/kommo"
              onClick={() => onNavigate?.()}
              title={collapsed ? 'Kommo Explorer' : undefined}
              className={`group flex items-center w-full text-left px-4 py-2.5 rounded-xl border transition-all duration-200 ${isKommoExplorerActive
                  ? 'bg-white/10 text-white font-semibold border-red-500/70 shadow-[0_8px_24px_-18px_rgba(255,255,255,0.8)]'
                  : 'text-gray-400 border-transparent hover:bg-white/5 hover:text-gray-100 hover:border-white/10'
                } ${collapsed ? 'md:justify-center md:px-2' : 'gap-3'}`}
            >
              <Database size={16} className={isKommoExplorerActive ? 'text-red-500' : 'text-gray-500 group-hover:text-red-400'} />
              <span className={`text-[12px] text-gray-400 font-semibold uppercase tracking-[0.05em] ${collapsed ? 'md:hidden' : ''}`}>Kommo Explorer</span>
            </Link>
          )}

          <Link
            to="/kommo/leads-insights"
            onClick={() => onNavigate?.()}
            title={collapsed ? 'Leads Insights' : undefined}
            className={`group flex items-center w-full text-left px-4 py-2.5 rounded-xl border transition-all duration-200 ${isKommoInsightsActive
                ? 'bg-white/10 text-white font-semibold border-red-500/70 shadow-[0_8px_24px_-18px_rgba(255,255,255,0.8)]'
                : 'text-gray-400 border-transparent hover:bg-white/5 hover:text-gray-100 hover:border-white/10'
              } ${collapsed ? 'md:justify-center md:px-2' : 'gap-3'}`}
          >
            <Database size={16} className={isKommoInsightsActive ? 'text-red-500' : 'text-gray-500 group-hover:text-red-400'} />
            <span className={`text-[12px] text-gray-400 font-semibold uppercase tracking-[0.05em] ${collapsed ? 'md:hidden' : ''}`}>Leads Insights</span>
          </Link>
        </div>

        {isAdmin && (
          <div className="space-y-1.5 pt-2">
          <div
            className={`px-4 pt-3 pb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em] inline-flex items-center gap-2 ${collapsed ? 'md:justify-center' : ''}`}
            title={collapsed ? 'Exportaciones' : undefined}
          >
            <Send size={12} className="text-red-500" />
            <span className={collapsed ? 'md:hidden' : ''}>Exportaciones</span>
          </div>

          <Link
            to="/exports/google-sheets"
            onClick={() => onNavigate?.()}
            title={collapsed ? 'Google Sheets Export' : undefined}
            className={`group flex items-center w-full text-left px-4 py-2.5 rounded-xl border transition-all duration-200 ${isGoogleSheetsExportActive
                ? 'bg-white/10 text-white font-semibold border-red-500/70 shadow-[0_8px_24px_-18px_rgba(255,255,255,0.8)]'
                : 'text-gray-400 border-transparent hover:bg-white/5 hover:text-gray-100 hover:border-white/10'
              } ${collapsed ? 'md:justify-center md:px-2' : 'gap-3'}`}
          >
            <Send size={16} className={isGoogleSheetsExportActive ? 'text-red-500' : 'text-gray-500 group-hover:text-red-400'} />
            <span className={`text-[12px] text-gray-400 font-semibold uppercase tracking-[0.05em] ${collapsed ? 'md:hidden' : ''}`}>Google Sheets</span>
          </Link>
          </div>
        )}

        {isAdmin && (
          <div className="space-y-1.5 pt-2">
            <div
              className={`px-4 pt-3 pb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em] inline-flex items-center gap-2 ${collapsed ? 'md:justify-center' : ''}`}
              title={collapsed ? 'Acceso' : undefined}
            >
              <UserCog size={12} className="text-red-500" />
              <span className={collapsed ? 'md:hidden' : ''}>Acceso</span>
            </div>

            <Link
              to="/admin/users"
              onClick={() => onNavigate?.()}
              title={collapsed ? 'Usuarios y roles' : undefined}
              className={`group flex items-center w-full text-left px-4 py-2.5 rounded-xl border transition-all duration-200 ${isAdminUsersActive
                  ? 'bg-white/10 text-white font-semibold border-red-500/70 shadow-[0_8px_24px_-18px_rgba(255,255,255,0.8)]'
                  : 'text-gray-400 border-transparent hover:bg-white/5 hover:text-gray-100 hover:border-white/10'
                } ${collapsed ? 'md:justify-center md:px-2' : 'gap-3'}`}
            >
              <UserCog size={16} className={isAdminUsersActive ? 'text-red-500' : 'text-gray-500 group-hover:text-red-400'} />
              <span className={`text-[12px] text-gray-400 font-semibold uppercase tracking-[0.05em] ${collapsed ? 'md:hidden' : ''}`}>Usuarios y roles</span>
            </Link>
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 px-2 pb-4 pt-1.5 sm:pb-5" hidden={!isAdmin}>

        {/* Hidden admin trigger */}
        <button
          onClick={onSecretClick}
          title="Admin"
          className={`mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/5 text-gray-600 hover:text-gray-400 hover:bg-white/5 hover:border-white/10 transition-all opacity-30 hover:opacity-60 ${collapsed ? 'md:px-2' : ''}`}
        >
          <Settings size={14} />
          <span className={`text-[10px] ${collapsed ? 'md:hidden' : ''}`}>Admin</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {renderSidebarShell(
        `hidden print:hidden md:relative md:z-10 md:flex md:h-screen md:min-h-screen md:flex-col md:overflow-hidden md:border-r md:border-red-900/40 md:bg-gradient-to-b md:from-[#101218] md:via-[#0f1219] md:to-[#0a0c12] md:text-white md:shadow-[8px_0_30px_-14px_rgba(0,0,0,0.75)] md:backdrop-blur-xl md:transition-[width] md:duration-300 ${collapsed ? 'md:w-20' : 'md:w-72'}`,
        false,
      )}
      {renderSidebarShell(
        `fixed inset-0 z-40 flex h-[100dvh] min-h-[100dvh] w-screen max-w-none flex-col overflow-hidden border-r-0 bg-[#0b0d12] text-white shadow-none transition-transform duration-300 md:hidden print:hidden ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`,
        true,
      )}
    </>
  );
}
