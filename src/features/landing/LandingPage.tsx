import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Award,
  BadgeCheck,
  MapPinned,
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
  { value: 'Lima', label: 'Metropolitana' },
  { value: '+500', label: 'Clientes activos' },
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

const coverageHighlights = [
  { district: 'Breña', price: 'S/ 8.00' },
  { district: 'Cercado de Lima', price: 'S/ 10.00' },
  { district: 'Miraflores', price: 'S/ 10.00' },
  { district: 'San Isidro', price: 'S/ 10.00' },
  { district: 'Ate', price: 'S/ 12.00' },
  { district: 'Callao', price: 'S/ 12.00' },
  { district: 'Chosica', price: 'S/ 22.00' },
  { district: 'Pucusana', price: 'S/ 28.00' },
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
        'fixed inset-x-0 top-0 z-50 border-b backdrop-blur-lg transition-colors duration-500',
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
                isNight ? 'hover:text-white' : 'hover:text-black',
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
            href={whatsappPremiumUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-red-500"
          >
            <MessageCircle size={13} />
            Tarifas exclusivas
          </a>
        </div>
      </div>
    </header>
  );
}

export function LandingPage() {
  const [isNight, setIsNight] = useState(true);
  const [isThemeAnimating, setIsThemeAnimating] = useState(false);
  const heroBgRef = useRef<HTMLDivElement>(null);

  useScrollReveal();

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

  const n = isNight;
  const bg = n ? '#080808' : '#f5f5f5';
  const border = n ? 'border-white/[0.09]' : 'border-black/[0.08]';
  const muted = n ? 'text-white/60' : 'text-gray-500';
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
            <div className="mx-auto w-full max-w-7xl">
              <p className="mb-5 text-[10px] uppercase tracking-[0.34em] text-red-400">
                Operador logístico oficial · Lima, Perú
              </p>

              <h1
                className={cx(
                  'text-[22vw] font-black uppercase leading-[0.80] tracking-[-0.02em] md:text-[12vw] lg:text-[10vw]',
                  n ? 'text-white/90' : 'text-black/85',
                )}
              >
                DINS
                <br />
                IDES
              </h1>

              <p className={cx('mt-7 max-w-sm text-sm leading-7 md:text-base md:max-w-md', muted)}>
                Más que un courier — somos el motor que impulsa tu marca en Lima Metropolitana.
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
          <div className="grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:items-start">
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
              <p className={cx('mt-5 text-sm leading-7', muted)}>
                Precios para paquetes de 30×20×15cm o hasta 1.5 kg. Para pesos o medidas mayores,
                consultanos directamente.
              </p>
              <a
                href={whatsappSalesUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                <MessageCircle size={14} />
                Consultar precio
              </a>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {coverageHighlights.map(({ district, price }, i) => (
                <article
                  key={district}
                  className={cx(
                    'reveal rounded-2xl border p-4 flex items-center justify-between gap-2',
                    i > 0 && `reveal-delay-${i % 3}`,
                    cardBase,
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPinned size={13} className="text-red-400 shrink-0" />
                    <span
                      className={cx('truncate text-sm', n ? 'text-white/80' : 'text-gray-700')}
                    >
                      {district}
                    </span>
                  </div>
                  <span
                    className={cx('text-sm font-bold shrink-0', n ? 'text-white' : 'text-black')}
                  >
                    {price}
                  </span>
                </article>
              ))}
            </div>
          </div>
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
          <div className="reveal overflow-hidden rounded-[2.2rem] border border-white/[0.11] bg-[linear-gradient(135deg,rgba(127,29,29,0.58)_0%,rgba(8,8,8,0.97)_48%,rgba(18,18,18,0.99)_100%)] p-8 md:p-12">
            <p className="text-[10px] uppercase tracking-[0.3em] text-red-300">Contacto</p>
            <h2 className="mt-4 max-w-xl text-3xl font-black leading-tight text-white md:text-4xl">
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
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.08] px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.14]"
              >
                Tarifario premium
              </a>
            </div>

            <div className="mt-10 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.09] bg-black/30 p-5">
                <p className="text-[10px] uppercase tracking-[0.28em] text-red-300 mb-3">Sedes</p>
                <p className="text-sm leading-7 text-white/60">Av. Arica 1702, Cercado de Lima</p>
                <p className="text-sm leading-7 text-white/60">Jr. Antonio Bazo 1220, La Victoria</p>
              </div>
              <div className="rounded-2xl border border-white/[0.09] bg-black/30 p-5">
                <p className="text-[10px] uppercase tracking-[0.28em] text-red-300 mb-3">
                  Teléfonos
                </p>
                <p className="text-sm leading-7 text-white/60">922 509 459</p>
                <p className="text-sm leading-7 text-white/60">992 565 076</p>
              </div>
              <div className="rounded-2xl border border-white/[0.09] bg-black/30 p-5">
                <p className="text-[10px] uppercase tracking-[0.28em] text-red-300 mb-3">Email</p>
                <p className="text-sm leading-7 text-white/60">contacto@dinsidescourier.com</p>
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
    </div>
  );
}
