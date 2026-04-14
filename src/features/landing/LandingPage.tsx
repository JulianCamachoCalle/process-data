import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  Award,
  BadgeCheck,
  CircleUserRound,
  MessageCircle,
  Moon,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Star,
  Sun,
  Truck,
  Warehouse,
} from 'lucide-react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import * as L from 'leaflet';

const whatsappSalesUrl =
  'https://api.whatsapp.com/send?phone=51922509459&text=Hola,%20necesito%20m%C3%A1s%20informaci%C3%B3n%20sobre%20sus%20servicios.';
const whatsappPremiumUrl =
  'https://api.whatsapp.com/send?phone=51992565076&text=Hola,%20necesito%20m%C3%A1s%20informaci%C3%B3n%20sobre%20sus%20tarifas%20exclusivas.';

const navItems = [
  { href: '#nosotros', label: 'Nosotros' },
  { href: '#servicios', label: 'Servicios' },
  { href: '#cobertura', label: 'Cobertura' },
  { href: '#contacto', label: 'Contacto' },
];

const stats = [
  { value: 'Lima', label: 'Y Callao' },
  { value: '+1000', label: 'Clientes activos' },
  { value: '6', label: 'Certificaciones ISO' },
  { value: '24h', label: 'Tiempo de entrega' },
];

const services = [
  {
    id: 'contraentrega',
    title: 'Contraentrega',
    description:
      'Cobro al entregar con efectivo, transferencias, Yape, Plin y POS. Seguridad en cada transacción.',
    icon: PackageCheck,
    featured: true,
  },
  {
    id: 'recojo',
    title: 'Recojo a domicilio',
    description: 'Recojo, clasificación y despacho con seguimiento operativo en tiempo real.',
    icon: Truck,
    featured: false,
  },
  {
    id: 'cambio-prenda',
    title: 'Cambio de prenda',
    description: 'Cambio de talla o color con devolución del producto no elegido.',
    icon: ShieldCheck,
    featured: false,
  },
  {
    id: 'cambio-producto',
    title: 'Cambio de producto',
    description: 'Recojo del artículo anterior y entrega del nuevo en una sola gestión.',
    icon: RefreshCw,
    featured: false,
  },
  {
    id: 'reutilizado',
    title: 'Reutilizado',
    description: 'Si no se concreta una venta, el pedido se redirige — nada se pierde.',
    icon: BadgeCheck,
    featured: false,
  },
  {
    id: 'fulfillment',
    title: 'Fulfillment',
    description:
      'Almacenamiento, empaquetado, rotulado, envío y cobro integral de tu operación logística.',
    icon: Warehouse,
    featured: true,
  },
];

const testimonials = [
  {
    quote: 'Muy feliz de trabajar con ustedes, siempre cumplen con los envíos.',
    author: 'Maritza Valdivia',
    role: 'Emprendedora',
  },
  {
    quote: 'El mejor courier con el que hemos trabajado, facilitan nuestro tiempo al mil.',
    author: 'Itzzait Angulo',
    role: 'Dueña de negocio',
  },
  {
    quote: 'Se adecuaron a las necesidades de los emprendedores, por eso los refiero.',
    author: 'Cindy Yaro',
    role: 'Emprendedora',
  },
];

const coverageTariffs = [
  { district: 'Ancón', price: 'S/ 17.00' },
  { district: 'Ate', price: 'S/ 12.00' },
  { district: 'Barranco', price: 'S/ 10.00' },
  { district: 'Bellavista', price: 'S/ 12.00' },
  { district: 'Breña', price: 'S/ 8.00' },
  { district: 'Cajamarquilla', price: 'S/ 21.00' },
  { district: 'Callao', price: 'S/ 12.00' },
  { district: 'Carabayllo', price: 'S/ 12.00' },
  { district: 'Carmen de la Legua Reynoso', price: 'S/ 12.00' },
  { district: 'Cercado de Lima', price: 'S/ 10.00' },
  { district: 'Chaclacayo', price: 'S/ 17.00' },
  { district: 'Chorrillos', price: 'S/ 12.00' },
  { district: 'Chosica', price: 'S/ 22.00' },
  { district: 'Cieneguilla', price: 'S/ 17.00' },
  { district: 'Comas', price: 'S/ 12.00' },
  { district: 'El Agustino', price: 'S/ 10.00' },
  { district: 'El Márquez - Callao', price: 'S/ 12.00' },
  { district: 'Envío Agencia Marvisur', price: 'S/ 5.00' },
  { district: 'Envio Agencia Olva Courier', price: 'S/ 5.00' },
  { district: 'Envío Agencia Shalom', price: 'S/ 5.00' },
  { district: 'Huachipa', price: 'S/ 14.00' },
  { district: 'Huaycan', price: 'S/ 12.00' },
  { district: 'Independencia', price: 'S/ 12.00' },
  { district: 'Jesús María', price: 'S/ 10.00' },
  { district: 'Jicamarca - Anexo 22', price: 'S/ 14.00' },
  { district: 'Jicamarca - Anexo 8', price: 'S/ 21.00' },
  { district: 'La Molina', price: 'S/ 10.00' },
  { district: 'La Perla', price: 'S/ 12.00' },
  { district: 'La Punta', price: 'S/ 12.00' },
  { district: 'La Victoria', price: 'S/ 10.00' },
  { district: 'Lince', price: 'S/ 10.00' },
  { district: 'Los Olivos', price: 'S/ 12.00' },
  { district: 'Lurigancho - Chosica', price: 'S/ 14.00' },
  { district: 'Lurin', price: 'S/ 14.00' },
  { district: 'Magdalena del Mar', price: 'S/ 10.00' },
  { district: 'Manchay', price: 'S/ 17.00' },
  { district: 'Mi Perú', price: 'S/ 12.00' },
  { district: 'Miraflores', price: 'S/ 10.00' },
  { district: 'Pachacamac', price: 'S/ 19.00' },
  { district: 'Pucusana', price: 'S/ 28.00' },
  { district: 'Pueblo Libre', price: 'S/ 10.00' },
  { district: 'Puente Piedra', price: 'S/ 12.00' },
  { district: 'Punta Hermosa', price: 'S/ 17.00' },
  { district: 'Punta Negra', price: 'S/ 21.00' },
  { district: 'Retiro Sede Cercado (Av Arica 1702)', price: 'S/ 8.00' },
  { district: 'Retiro Sede Gamarra (Antonio Bazo 1218)', price: 'S/ 8.00' },
  { district: 'Ricardo Palma', price: 'S/ 25.00' },
  { district: 'Rímac', price: 'S/ 10.00' },
  { district: 'Salamanca Ate', price: 'S/ 10.00' },
  { district: 'San Bartolo', price: 'S/ 22.00' },
  { district: 'San Borja', price: 'S/ 10.00' },
  { district: 'San Isidro', price: 'S/ 10.00' },
  { district: 'San Juan de Lurigancho', price: 'S/ 10.00' },
  { district: 'San Juan de Miraflores', price: 'S/ 12.00' },
  { district: 'San Luis', price: 'S/ 10.00' },
  { district: 'San Martín de Porres', price: 'S/ 12.00' },
  { district: 'San Miguel', price: 'S/ 10.00' },
  { district: 'Santa Anita', price: 'S/ 10.00' },
  { district: 'Santa Clara - Ate', price: 'S/ 12.00' },
  { district: 'Santa Eulalia', price: 'S/ 25.00' },
  { district: 'Santa María del Mar', price: 'S/ 25.00' },
  { district: 'Santa Rosa', price: 'S/ 17.00' },
  { district: 'Santiago de Surco', price: 'S/ 10.00' },
  { district: 'Surquillo', price: 'S/ 10.00' },
  { district: 'Ventanilla', price: 'S/ 12.00' },
  { district: 'Villa El Salvador', price: 'S/ 12.00' },
  { district: 'Villa María del Triunfo', price: 'S/ 12.00' },
] as const;

type AnyProps = Record<string, unknown>;

const LeafletMap = MapContainer as unknown as ComponentType<AnyProps>;
const LeafletTiles = TileLayer as unknown as ComponentType<AnyProps>;
const LeafletGeoJson = GeoJSON as unknown as ComponentType<AnyProps>;

const COVERAGE_PLACEMARKS_URL = '/maps/coverage-placemarks.json';
const COVERAGE_STYLES_URL = '/maps/coverage-styles.json';

type GeometryType = 'Point' | 'Polygon' | 'LineString' | 'Unknown';

interface CoveragePlacemark {
  name: string;
  folder: string;
  styleUrl: string;
  geometryType: GeometryType;
  coordinates: string;
}

interface KmlStyle {
  id: string;
  polyColor: string | null;
  lineColor: string | null;
  iconHref: string | null;
}

interface KmlStyleMap {
  id: string;
  normal: string | null;
  highlight: string | null;
}

interface CoverageStylesPayload {
  styles: KmlStyle[];
  styleMaps: KmlStyleMap[];
}

function normalizeLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function fixMojibake(value: string) {
  if (!value) return value;
  try {
    const bytes = Uint8Array.from(value, (ch) => ch.charCodeAt(0));
    const decoded = new TextDecoder('utf-8').decode(bytes);
    return decoded.includes('�') ? value : decoded;
  } catch {
    return value;
  }
}

function isGreenZoneStyle(styleUrl: string) {
  return styleUrl.toUpperCase().includes('POLY-0F9D58');
}

function parseKmlColor(kmlColor: string | null | undefined, fallback: string) {
  if (!kmlColor || kmlColor.length !== 8) {
    return { color: fallback, opacity: 0.75 };
  }

  const aa = kmlColor.slice(0, 2);
  const bb = kmlColor.slice(2, 4);
  const gg = kmlColor.slice(4, 6);
  const rr = kmlColor.slice(6, 8);

  const opacity = Number.parseInt(aa, 16) / 255;
  return {
    color: `#${rr}${gg}${bb}`,
    opacity: Number.isFinite(opacity) ? opacity : 0.75,
  };
}

function parseKmlCoords(raw: string) {
  return raw
    .trim()
    .split(/\s+/)
    .map((token) => token.split(',').slice(0, 2).map((v) => Number(v)))
    .filter((pair) => pair.length === 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
    .map((pair) => [pair[0], pair[1]] as [number, number]);
}


const isoCodes = ['ISO 9001', 'ISO 14001', 'ISO 45001', 'ISO 27001', 'ISO 28000', 'ISO 50001'];

const values = ['Responsabilidad', 'Empatía', 'Resiliencia', 'Aprendizaje'];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -48px 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

function Header({
  isNight,
  isAnimating,
  onToggleTheme,
}: {
  isNight: boolean;
  isAnimating: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <header
      className={cx(
        'fixed inset-x-0 top-0 z-[1200] border-b backdrop-blur-lg transition-colors duration-500',
        isNight ? 'border-white/10 bg-black/70' : 'border-black/10 bg-white/82',
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8 lg:px-10">
        <a href="#inicio" className="flex items-center gap-2.5">
          <img
            src="/icon-dinsides.png"
            alt="Dinsides Courier"
            className="h-9 w-9 rounded-xl object-cover"
          />
          <div className="flex flex-col leading-none gap-[3px]">
            <span
              className={cx(
                'text-[11px] uppercase tracking-[0.12em] font-black',
                isNight ? 'text-white' : 'text-black',
              )}
            >
              Dinsides
            </span>
            <span
              className={cx(
                'text-[8px] uppercase tracking-[0.18em] font-light',
                isNight ? 'text-white/45' : 'text-red-500',
              )}
            >
              Courier
            </span>
          </div>
        </a>

        <nav
          className={cx(
            'hidden items-center gap-8 text-[13px] md:flex',
            isNight ? 'text-white/55' : 'text-gray-500',
          )}
        >
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cx(
                'transition-colors',
                isNight ? 'hover:text-white text-white/55' : 'hover:text-black text-gray-800',
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Cambiar tema"
            className={cx(
              'h-8 w-8 inline-flex items-center justify-center rounded-full border transition duration-500',
              isNight
                ? 'border-white/15 bg-white/5 text-white hover:bg-white/10'
                : 'border-black/15 bg-black/5 text-black hover:bg-black/10',
              isAnimating && 'ring-2 ring-red-500/30',
            )}
          >
            {isNight ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <a
            href="/login"
            className={cx(
              'hidden sm:inline-flex h-10 items-center justify-center gap-2 rounded-full border px-3 shadow-[0_10px_20px_-12px_rgba(220,38,38,0.9)] transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/80 focus-visible:ring-offset-2',
              isNight
                ? 'border-red-500/80 bg-red-600 text-white hover:bg-red-500'
                : 'border-red-500/80 bg-red-600 text-white hover:bg-red-500',
            )}
            aria-label="Login"
            title="Login"
          >
            <CircleUserRound size={20} />
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">Clientes</span>
          </a>
        </div>
      </div>
    </header>
  );
}

export function LandingPage() {
  const [isNight, setIsNight] = useState(false);
  const [isThemeAnimating, setIsThemeAnimating] = useState(false);
  const [coverageGeoJson, setCoverageGeoJson] = useState<AnyProps | null>(null);
  const heroBgRef = useRef<HTMLDivElement>(null);
  const mapIconCache = useRef(new Map<string, L.Icon>());

  useScrollReveal();

  const tariffLookup = useRef(
    new Map(
      coverageTariffs.map((item) => [
        normalizeLabel(item.district)
          .replace(/^SANTIAGO DE SURCO$/, 'SURCO')
          .replace(/^LURIGANCHO CHOSICA$/, 'CHOSICA')
          .replace(/^EL MARQUEZ CALLAO$/, 'MARQUEZ CALLAO')
          .replace(/^SALAMANCA ATE$/, 'SALAMANCA')
          .trim(),
        item,
      ]),
    ),
  );

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      try {
        const [placemarksResponse, stylesResponse] = await Promise.all([
          fetch(COVERAGE_PLACEMARKS_URL),
          fetch(COVERAGE_STYLES_URL),
        ]);
        if (!placemarksResponse.ok || !stylesResponse.ok) return;

        const placemarks = (await placemarksResponse.json()) as CoveragePlacemark[];
        const stylesPayload = (await stylesResponse.json()) as CoverageStylesPayload;

        const styleById = new Map(stylesPayload.styles.map((s) => [s.id, s] as const));
        const styleMapById = new Map(stylesPayload.styleMaps.map((s) => [s.id, s] as const));

        const resolveStyle = (styleUrl: string) => {
          const raw = styleUrl.replace('#', '').trim();
          const mapped = styleMapById.get(raw)?.normal ?? raw;
          return styleById.get(mapped) ?? null;
        };

        const features = placemarks
          .map((placemark) => {
            const coords = parseKmlCoords(placemark.coordinates);
            if (!coords.length) return null;

            // Quitar puntos de encuentro y rutas: solo polígonos de zonas
            if (placemark.geometryType !== 'Polygon') return null;

            let geometry: Record<string, unknown> | null = null;
            if (coords.length < 3) return null;
            const ring = [...coords];
            const first = ring[0];
            const last = ring[ring.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
            geometry = { type: 'Polygon', coordinates: [ring] };

            if (!geometry) return null;

            const style = resolveStyle(placemark.styleUrl);
            const isLaPunta = normalizeLabel(fixMojibake(placemark.name)) === 'LA PUNTA';
            if (!isGreenZoneStyle(placemark.styleUrl) && !isLaPunta) return null;
            const fill = parseKmlColor(style?.polyColor, '#ef4444');
            const stroke = parseKmlColor(style?.lineColor, '#111827');
            const cleanedName = fixMojibake(placemark.name);
            const cleanedFolder = fixMojibake(placemark.folder);

            const normalizedName = normalizeLabel(cleanedName)
              .replace(/^SANTIAGO DE SURCO$/, 'SURCO')
              .replace(/^LURIGANCHO CHOSICA$/, 'CHOSICA')
              .replace(/^EL MARQUEZ CALLAO$/, 'MARQUEZ CALLAO')
              .replace(/^SALAMANCA ATE$/, 'SALAMANCA')
              .trim();
            const tariff = tariffLookup.current.get(normalizedName) ?? null;

            return {
              type: 'Feature',
              geometry,
              properties: {
                name: cleanedName,
                folder: cleanedFolder,
                styleUrl: placemark.styleUrl,
                geometryType: placemark.geometryType,
                fillColor: fill.color,
                fillOpacity: fill.opacity,
                strokeColor: stroke.color,
                strokeOpacity: stroke.opacity,
                iconHref: style?.iconHref ?? null,
                tariffPrice: tariff?.price ?? null,
                tariffDistrict: tariff?.district ?? null,
                isGreenZone: isGreenZoneStyle(placemark.styleUrl),
              },
            };
          })
          .filter((f) => f !== null) as Record<string, unknown>[];

        if (isMounted) setCoverageGeoJson({ type: 'FeatureCollection', features });
      } catch {
        // no-op
      }
    };

    void run();
    return () => {
      isMounted = false;
    };
  }, []);

  const getMarkerIcon = (iconHref: string | null) => {
    const key = iconHref ?? '__default__';
    const cached = mapIconCache.current.get(key);
    if (cached) return cached;

    const icon = L.icon({
      iconUrl: iconHref ? `/maps/google-export/${iconHref}` : '/maps/google-export/images/icon-1.png',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    mapIconCache.current.set(key, icon);
    return icon;
  };

  useEffect(() => {
    const handleScroll = () => {
      if (heroBgRef.current) {
        heroBgRef.current.style.transform = `translateY(${window.scrollY * 0.32}px)`;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleToggleTheme = () => {
    setIsThemeAnimating(true);
    setIsNight((v) => !v);
    window.setTimeout(() => setIsThemeAnimating(false), 520);
  };

  const handleScrollToTop = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const n = isNight;
  const bg = n ? '#080808' : '#f5f5f5';
  const border = n ? 'border-white/[0.09]' : 'border-black/[0.08]';
  const muted = n ? 'text-white/60' : 'text-gray-800';
  const cardBase = n
    ? 'bg-white/[0.04] border-white/[0.09]'
    : 'bg-black/[0.025] border-black/[0.07]';
  const cardSolid = n ? 'bg-[#111] border-white/[0.09]' : 'bg-white border-black/[0.08]';
  const divideColor = n ? 'divide-white/[0.08]' : 'divide-black/[0.07]';

  return (
    <div
      className={cx(
        'relative min-h-screen overflow-x-hidden selection:bg-red-600 selection:text-white landing-root',
        n ? 'text-white' : 'text-gray-900',
      )}
      style={{ backgroundColor: bg }}
    >
      {/* Theme transition flash */}
      <div
        className={cx(
          'pointer-events-none fixed inset-0 z-40 bg-[radial-gradient(circle_at_20%_20%,rgba(220,38,38,0.15),transparent_55%)] transition-opacity duration-500',
          isThemeAnimating ? 'opacity-100' : 'opacity-0',
        )}
      />

      <Header isNight={n} isAnimating={isThemeAnimating} onToggleTheme={handleToggleTheme} />

      <main>
        {/* ── HERO ────────────────────────────────────────────── */}
        <section id="inicio" className="relative h-[100svh] overflow-hidden">
          {/* Parallax background */}
          <div ref={heroBgRef} className="hero-parallax absolute inset-0 scale-[1.12]">
            <img
              src="/hero/slide-01.jpg"
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover object-[center_38%]"
            />
          </div>

          {/* Gradient overlay */}
          <div
            className={cx(
              'absolute inset-0',
              n
                ? 'bg-[linear-gradient(108deg,rgba(0,0,0,0.82)_0%,rgba(0,0,0,0.44)_52%,rgba(0,0,0,0.68)_100%)]'
                : 'bg-[linear-gradient(108deg,rgba(255,255,255,0.90)_0%,rgba(255,255,255,0.58)_52%,rgba(240,240,240,0.42)_100%)]',
            )}
          />

          {/* Subtle noise */}
          <div className={cx('landing-noise absolute inset-0', n ? 'opacity-28' : 'opacity-8')} />
          <div className={cx('landing-grid absolute inset-0', n ? 'opacity-10' : 'opacity-7')} />

          {/* Hero content */}
          <div className="relative z-10 flex h-full items-center px-6 sm:px-12 lg:px-20">
            <div className="mx-auto grid w-full max-w-7xl items-stretch gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="max-w-xl self-center">
              <p className="mb-5 text-[10px] uppercase tracking-[0.34em] text-red-400">
                Operador logístico oficial · Lima, Perú
              </p>

              <h1
                className={cx(
                  'text-[22vw] font-black uppercase leading-[0.80] tracking-[-0.02em] md:text-[12vw] lg:text-[10vw]',
                  n ? 'text-white/90' : 'text-black/85',
                )}
              >
                DINSIDES
              </h1>

              <p className={cx('mt-7 max-w-sm text-sm leading-7 md:text-base md:max-w-lg', muted)}>
                Más que un courier somos el motor que impulsa tu marca.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={whatsappSalesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500"
                >
                  <MessageCircle size={15} />
                  Contáctanos
                </a>
                <a
                  href="#servicios"
                  className={cx(
                    'inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold transition',
                    n
                      ? 'border-white/20 text-white hover:bg-white/8'
                      : 'border-black/20 text-black hover:bg-black/5',
                  )}
                >
                  Ver servicios
                  <ArrowRight size={15} />
                </a>
              </div>
              </div>

              <div className="hidden h-full lg:block">
                <div className="h-full min-h-[520px] overflow-hidden rounded-[1.8rem]">
                  <img
                    src="/ImagenHeader.png"
                    alt="Dinsides Courier"
                    className="h-full w-full object-cover object-center"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Scroll hint */}
          <div
            className={cx(
              'absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2',
              muted,
            )}
          >
            <span className="text-[9px] uppercase tracking-[0.22em]">Scroll</span>
            <ArrowDown size={13} className="animate-bounce" />
          </div>

          {/* Bottom fade into page */}
          <div
            className="absolute bottom-0 left-0 right-0 h-36 pointer-events-none"
            style={{ background: `linear-gradient(to top, ${bg}, transparent)` }}
          />
        </section>

        {/* ── STATS BAR ───────────────────────────────────────── */}
        <div className={cx('border-y', border)}>
          <dl
            className={cx(
              'mx-auto max-w-7xl grid grid-cols-2 md:grid-cols-4 divide-x',
              divideColor,
            )}
          >
            {stats.map(({ value, label }, i) => (
              <div
                key={label}
                className={cx('reveal px-6 py-8 text-center', i > 0 && `reveal-delay-${i}`)}
              >
                <dt className={cx('text-2xl font-black md:text-3xl', n ? 'text-white' : 'text-black')}>
                  {value}
                </dt>
                <dd className={cx('mt-1.5 text-[10px] uppercase tracking-[0.22em]', muted)}>
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── NOSOTROS ────────────────────────────────────────── */}
        <section id="nosotros" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
          <div className="reveal mb-10">
            <p className="text-[10px] uppercase tracking-[0.3em] text-red-400">Nosotros</p>
            <div className="editorial-rule mt-3" />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {/* Mission — large card spanning 2 cols */}
            <article
              className={cx(
                'reveal rounded-[1.8rem] border p-7 lg:col-span-2 md:p-9',
                cardBase,
              )}
            >
              <p className={cx('text-[10px] uppercase tracking-[0.26em] mb-5', muted)}>Misión</p>
              <h2
                className={cx(
                  'text-xl font-bold leading-snug md:text-2xl md:leading-snug',
                  n ? 'text-white' : 'text-black',
                )}
              >
                Contribuir al propósito de nuestros clientes y talento, prestando un servicio
                responsable que genere satisfacción real.
              </h2>
              <p className={cx('mt-6 text-sm leading-7', muted)}>
                Empresa 100% formal, avalada por la Cámara de Comercio de Gamarra, con permiso del
                Ministerio de Transporte.
              </p>
              <p className={cx('mt-2 text-sm leading-7', muted)}>
                Av. Arica 1702, Cercado de Lima · Jr. Antonio Bazo 1218, La Victoria.
              </p>
            </article>

            <div className="flex flex-col gap-3">
              {/* Vision */}
              <article className={cx('reveal reveal-delay-1 rounded-[1.8rem] border p-6', cardBase)}>
                <p className={cx('text-[10px] uppercase tracking-[0.26em] mb-3', muted)}>Visión</p>
                <p className={cx('text-sm leading-7', n ? 'text-white/75' : 'text-gray-600')}>
                  Ser el referente de experiencias logísticas seguras y confiables del Perú.
                </p>
              </article>

              {/* Values */}
              <article
                className={cx('reveal reveal-delay-2 rounded-[1.8rem] border p-6 flex-1', cardBase)}
              >
                <p className={cx('text-[10px] uppercase tracking-[0.26em] mb-4', muted)}>Valores</p>
                <ul className="grid grid-cols-2 gap-y-2.5 gap-x-2">
                  {values.map((v) => (
                    <li
                      key={v}
                      className={cx('text-sm font-medium', n ? 'text-white/80' : 'text-black/70')}
                    >
                      <span className="text-red-500 mr-1.5 font-bold">·</span>
                      {v}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* ── SERVICIOS ───────────────────────────────────────── */}
        <section id="servicios" className={cx('border-y', border)}>
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
            <div className="reveal mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-red-400">Servicios</p>
                <div className="editorial-rule mt-3" />
                <h2
                  className={cx(
                    'mt-5 text-3xl font-black tracking-tight md:text-4xl',
                    n ? 'text-white' : 'text-black',
                  )}
                >
                  Soluciones logísticas
                  <br />
                  para tu negocio.
                </h2>
              </div>
              <a
                href={whatsappPremiumUrl}
                target="_blank"
                rel="noreferrer"
                className={cx(
                  'inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition self-start',
                  n
                    ? 'border-white/15 text-white hover:bg-white/[0.07]'
                    : 'border-black/15 text-black hover:bg-black/[0.05]',
                )}
              >
                Plan premium
                <ArrowRight size={14} />
              </a>
            </div>

            {/* Bento services grid */}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {services.map(({ id, title, description, icon: Icon, featured }, i) => (
                <article
                  key={id}
                  className={cx(
                    'reveal rounded-[1.8rem] border p-6 transition-colors',
                    i > 0 && `reveal-delay-${i % 3}`,
                    featured
                      ? cx(
                          'md:p-8',
                          n
                            ? 'bg-white/[0.06] border-white/[0.11]'
                            : 'bg-black/[0.04] border-black/[0.09]',
                        )
                      : cardBase,
                  )}
                >
                  <div
                    className={cx(
                      'inline-flex h-10 w-10 items-center justify-center rounded-2xl mb-5',
                      n ? 'bg-white/[0.07]' : 'bg-black/[0.05]',
                    )}
                  >
                    <Icon size={17} className="text-red-400" />
                  </div>
                  <h3
                    className={cx(
                      'font-bold',
                      featured ? 'text-xl' : 'text-base',
                      n ? 'text-white' : 'text-black',
                    )}
                  >
                    {title}
                  </h3>
                  <p className={cx('mt-2.5 text-sm leading-6', muted)}>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── COBERTURA ───────────────────────────────────────── */}
        <section id="cobertura" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
          <div className="reveal">
            <p className="text-[10px] uppercase tracking-[0.3em] text-red-400">Cobertura</p>
            <div className="editorial-rule mt-3" />
            <h2
              className={cx(
                'mt-5 text-3xl font-black tracking-tight md:text-4xl',
                n ? 'text-white' : 'text-black',
              )}
            >
              Tarifario regular
            </h2>
            <p className={cx('mt-5 max-w-4xl text-sm leading-7', muted)}>
              Precios para paquetes de 30cm x 20cm x 15cm o hasta 1.5 kg. Para pesos o medidas mayores, consultanos directamente.
            </p>
          </div>

          <article className={cx('reveal mt-8 overflow-hidden rounded-[1.5rem] border p-2', cardBase)}>
            <div className="overflow-hidden rounded-[1.15rem]">
              <LeafletMap
                center={[-12.06, -76.99]}
                zoom={10}
                scrollWheelZoom
                attributionControl={false}
                className="h-[620px] w-full"
              >
                <LeafletTiles
                  url={
                    n
                      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                  }
                />

                {coverageGeoJson ? (
                  <LeafletGeoJson
                    data={coverageGeoJson}
                    style={(feature: { properties?: Record<string, unknown>; geometry?: { type?: string } }) => {
                      const geometryType = String(feature.geometry?.type ?? '');
                      const strokeColor = n ? '#ffffff' : '#111111';
                      const fillColor = '#0f9d58';

                      if (geometryType === 'Polygon') {
                        return {
                          fillColor,
                          fillOpacity: n ? 0.42 : 0.34,
                          color: strokeColor,
                          opacity: 0.95,
                          weight: 2,
                        };
                      }

                      if (geometryType === 'LineString') {
                        return {
                          color: strokeColor,
                          opacity: 0.95,
                          weight: 3,
                        };
                      }

                      return {
                        color: strokeColor,
                        opacity: 0.95,
                        weight: 1,
                      };
                    }}
                    pointToLayer={(feature: { properties?: Record<string, unknown> }, latlng: { lat: number; lng: number }) => {
                      const iconHref = feature.properties?.iconHref;
                      const markerIcon = getMarkerIcon(typeof iconHref === 'string' ? iconHref : null);
                      return L.marker([latlng.lat, latlng.lng], { icon: markerIcon });
                    }}
                    onEachFeature={(feature: { properties?: Record<string, unknown>; geometry?: { type?: string } }, layer: Record<string, unknown>) => {
                      const name = String(feature.properties?.name ?? 'Sin nombre');
                      const styleUrl = String(feature.properties?.styleUrl ?? '');
                      const geometryType = String(feature.geometry?.type ?? '');
                      const tariffPrice = feature.properties?.tariffPrice;
                      const tariffDistrict = feature.properties?.tariffDistrict;

                      const leafletLayer = layer as {
                        bindPopup: (content: string) => void;
                        on: (events: Record<string, (e: { target: { setStyle: (style: Record<string, unknown>) => void; getBounds: () => unknown; _map?: { fitBounds: (bounds: unknown) => void } } }) => void>) => void;
                      };

                      const popupTitle = typeof tariffDistrict === 'string' && tariffDistrict.trim().length > 0
                        ? tariffDistrict
                        : name;
                      const popupTariff = typeof tariffPrice === 'string' && tariffPrice.trim().length > 0
                        ? `Tarifa: ${tariffPrice}`
                        : null;

                      const popupHtml = popupTariff
                        ? `<strong>${popupTitle}</strong><br/>${popupTariff}`
                        : `<strong>${popupTitle}</strong><br/>${geometryType}<br/>${styleUrl}`;

                      leafletLayer.bindPopup(popupHtml);

                      leafletLayer.on({
                        mouseover: (e) => {
                          e.target.setStyle({
                            weight: 4,
                            color: n ? '#ffffff' : '#111111',
                            fillColor: '#0b7a45',
                            fillOpacity: n ? 0.64 : 0.56,
                          });
                        },
                        mouseout: (e) => {
                          const strokeColor = n ? '#ffffff' : '#111111';
                          const fillColor = '#0f9d58';
                          const baseWeight = geometryType === 'LineString' ? 3 : 2;

                          e.target.setStyle({
                            fillColor,
                            fillOpacity: n ? 0.42 : 0.34,
                            color: strokeColor,
                            opacity: 0.95,
                            weight: baseWeight,
                          });
                        },
                      });

                      if (geometryType === 'Polygon') {
                        const tooltipLayer = layer as {
                          bindTooltip: (content: string, options: Record<string, unknown>) => void;
                        };
                        tooltipLayer.bindTooltip(name, {
                          permanent: true,
                          direction: 'center',
                          className: 'district-center-label',
                          interactive: false,
                          opacity: 1,
                        });
                      }
                    }}
                  />
                ) : null}
              </LeafletMap>
            </div>
          </article>

          <details className={cx('mt-8 overflow-hidden rounded-2xl border', cardBase)}>
            <summary className={cx('cursor-pointer list-none px-4 py-3 text-sm font-semibold', n ? 'text-white' : 'text-gray-900')}>
              Ver con más detalle
            </summary>
            <div className="grid gap-2.5 border-t p-3 sm:grid-cols-2 lg:grid-cols-3" style={{ borderColor: n ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
              {coverageTariffs.map((item) => (
                <article key={item.district} className={cx('rounded-2xl border p-3', cardBase)}>
                  <p className={cx('text-sm font-medium', n ? 'text-white/85' : 'text-gray-800')}>{item.district}</p>
                  <p className="mt-1 text-sm font-bold text-red-500">{item.price}</p>
                </article>
              ))}
            </div>
          </details>

          <a
            href={whatsappSalesUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            <MessageCircle size={14} />
            Consultar precio
          </a>
        </section>

        {/* ── TESTIMONIOS ─────────────────────────────────────── */}
        <section className={cx('border-t', border)}>
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
            <div className="reveal mb-10">
              <p className="text-[10px] uppercase tracking-[0.3em] text-red-400">Testimonios</p>
              <div className="editorial-rule mt-3" />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {testimonials.map(({ quote, author, role }, i) => (
                <article
                  key={author}
                  className={cx(
                    'reveal rounded-[1.8rem] border p-6',
                    i > 0 && `reveal-delay-${i}`,
                    cardSolid,
                  )}
                >
                  <div className="flex gap-0.5 mb-5">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star key={idx} size={13} className="text-red-400 fill-red-400" />
                    ))}
                  </div>
                  <p className={cx('text-sm leading-7', muted)}>"{quote}"</p>
                  <div className="mt-6 pt-5 border-t" style={{ borderColor: n ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}>
                    <p className={cx('text-sm font-semibold', n ? 'text-white' : 'text-black')}>
                      {author}
                    </p>
                    <p className={cx('text-[11px] mt-0.5', muted)}>{role}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── CERTIFICACIONES ISO ─────────────────────────────── */}
        <section className={cx('border-y', border)}>
          <div className="mx-auto max-w-7xl px-5 py-11 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="reveal shrink-0">
                <p className={cx('text-[10px] uppercase tracking-[0.3em] mb-1', muted)}>
                  Formalidad y respaldo
                </p>
                <p className={cx('text-sm font-semibold', n ? 'text-white/80' : 'text-black/70')}>
                  Certificaciones internacionales
                </p>
              </div>
              <div className="reveal reveal-delay-1 flex flex-wrap gap-2">
                {isoCodes.map((code) => (
                  <span
                    key={code}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold',
                      n
                        ? 'border-white/[0.11] text-white/65'
                        : 'border-black/[0.10] text-gray-500',
                    )}
                  >
                    <Award size={11} className="text-red-400" />
                    {code}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── CONTACTO ────────────────────────────────────────── */}
        <section id="contacto" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
          <div
            className={cx(
              'reveal overflow-hidden rounded-[2.2rem] border p-8 md:p-12',
              n
                ? 'border-white/[0.11] bg-[linear-gradient(135deg,rgba(127,29,29,0.58)_0%,rgba(8,8,8,0.97)_48%,rgba(18,18,18,0.99)_100%)]'
                : 'border-black/[0.08] bg-[linear-gradient(135deg,rgba(254,242,242,0.95)_0%,rgba(255,255,255,0.98)_48%,rgba(245,245,245,0.95)_100%)]',
            )}
          >
            <p className={cx('text-[10px] uppercase tracking-[0.3em]', n ? 'text-red-300' : 'text-red-600')}>Contacto</p>
            <h2 className={cx('mt-4 max-w-xl text-3xl font-black leading-tight md:text-4xl', n ? 'text-white' : 'text-black')}>
              Lleva tu marca a su máximo potencial con Dinsides Courier.
            </h2>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={whatsappSalesUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-neutral-100"
              >
                <MessageCircle size={15} />
                Escríbenos ahora
              </a>
              <a
                href={whatsappPremiumUrl}
                target="_blank"
                rel="noreferrer"
                className={cx(
                  'inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold transition',
                  n
                    ? 'border-white/20 bg-white/[0.08] text-white hover:bg-white/[0.14]'
                    : 'border-black/15 bg-black/[0.04] text-black hover:bg-black/[0.08]',
                )}
              >
                Tarifario premium
              </a>
            </div>

            <div className="mt-10 grid gap-3 md:grid-cols-3">
              <div className={cx('rounded-2xl border p-5', n ? 'border-white/[0.09] bg-black/30' : 'border-black/10 bg-white/70')}>
                <p className={cx('mb-3 text-[10px] uppercase tracking-[0.28em]', n ? 'text-red-300' : 'text-red-600')}>Sedes</p>
                <p className={cx('text-sm leading-7', n ? 'text-white/65' : 'text-gray-700')}>Av. Arica 1702, Cercado de Lima</p>
                <p className={cx('text-sm leading-7', n ? 'text-white/65' : 'text-gray-700')}>Jr. Antonio Bazo 1220, La Victoria</p>
              </div>
              <div className={cx('rounded-2xl border p-5', n ? 'border-white/[0.09] bg-black/30' : 'border-black/10 bg-white/70')}>
                <p className={cx('mb-3 text-[10px] uppercase tracking-[0.28em]', n ? 'text-red-300' : 'text-red-600')}>
                  Teléfonos
                </p>
                <p className={cx('text-sm leading-7', n ? 'text-white/65' : 'text-gray-700')}>+51 922 509 459</p>
                <p className={cx('text-sm leading-7', n ? 'text-white/65' : 'text-gray-700')}>+51 992 565 076</p>
              </div>
              <div className={cx('rounded-2xl border p-5', n ? 'border-white/[0.09] bg-black/30' : 'border-black/10 bg-white/70')}>
                <p className={cx('mb-3 text-[10px] uppercase tracking-[0.28em]', n ? 'text-red-300' : 'text-red-600')}>Email</p>
                <p className={cx('text-sm leading-7', n ? 'text-white/65' : 'text-gray-700')}>contacto@dinsidescourier.com</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── FOOTER ──────────────────────────────────────────── */}
        <footer className={cx('border-t', border)}>
          <div
            className={cx(
              'mx-auto max-w-7xl px-5 py-6 sm:px-8 lg:px-10 flex items-center justify-between text-[11px]',
              muted,
            )}
          >
            <span>© 2025 Dinsides Courier. Todos los derechos reservados.</span>
            <span>Lima, Perú</span>
          </div>
        </footer>
      </main>

      <a
        href={whatsappSalesUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="WhatsApp Dinsides"
        className="fixed bottom-6 right-6 z-[1300] inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_-12px_rgba(37,211,102,0.8)] transition hover:bg-[#1EBE57]"
      >
        <MessageCircle size={18} />
        WhatsApp
      </a>

      <a
        href="#inicio"
        aria-label="Subir al inicio"
        onClick={handleScrollToTop}
        className={cx(
          'fixed bottom-6 left-1/2 z-[1200] inline-flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border backdrop-blur-sm transition hover:-translate-y-0.5',
          n
            ? 'border-white/20 bg-black/45 text-white/80 hover:bg-black/60'
            : 'border-black/15 bg-white/70 text-gray-700 hover:bg-white',
        )}
      >
        <ArrowUp size={16} />
      </a>
    </div>
  );
}
