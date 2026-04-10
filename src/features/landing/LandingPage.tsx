import { useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  MapPinned,
  MessageCircle,
  Moon,
  PackageCheck,
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

const services = [
  {
    title: 'Contraentrega',
    description: 'Cobro al entregar con efectivo, transferencias, Yape, Plin y POS.',
    icon: PackageCheck,
  },
  {
    title: 'Recojo a domicilio',
    description: 'Recojo, clasificación y despacho con seguimiento operativo.',
    icon: Truck,
  },
  {
    title: 'Cambio de prenda',
    description: 'Cambio de talla o color con devolución del producto no elegido.',
    icon: ShieldCheck,
  },
  {
    title: 'Cambio de producto',
    description: 'Recojo del artículo anterior y entrega del nuevo en una sola gestión.',
    icon: ArrowRight,
  },
  {
    title: 'Fulfillment',
    description: 'Almacenamiento, empaquetado, rotulado, envío y cobro.',
    icon: Warehouse,
  },
  {
    title: 'Reutilizado',
    description: 'Si no se concreta una venta, el pedido se reutiliza.',
    icon: BadgeCheck,
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
  },
  {
    quote: 'El mejor courier con el que hemos trabajado, facilitan nuestro tiempo al mil.',
    author: 'Itzzait Angulo',
  },
  {
    quote: 'Se adecuaron a las necesidades de los emprendedores, por eso los refiero.',
    author: 'Cindy Yaro',
  },
];

const isoCodes = ['ISO 9001', 'ISO 14001', 'ISO 45001', 'ISO 27001', 'ISO 28000', 'ISO 50001'];

const heroSlides = [
  {
    image: '/hero/slide-01.jpg',
    objectPosition: 'center 38%',
  },
  {
    image: '/hero/slide-02.jpg',
    objectPosition: 'center 42%',
  },
  {
    image: '/hero/slide-03.jpg',
    objectPosition: 'center 34%',
  },
] as const;

// Ajustable: glow monocromo (suave/casi imperceptible) para DINSIDES en el HERO.
const HERO_LED_GLOW = {
  blurSoftPx: 10,
  blurStrongPx: 24,
  baseOpacityNight: 0.11,
  baseOpacityDay: 0.06,
  glowOpacityNight: 0.08,
  glowOpacityDay: 0.045,
  strokeOpacityNight: 0.14,
  strokeOpacityDay: 0.08,
} as const;

// Ajustable: PNG superpuesto junto al título (detrás + delante del texto).
const HERO_OVERLAY_IMAGE = {
  src: '/ImagenHeader.png',
  heightVh: 80,
  rightPercent: -5,
  centerYOffsetPx: 40,
  frontClipPercent: 100,
} as const;

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function Header({ isNight, isAnimating, onToggleTheme }: { isNight: boolean; isAnimating: boolean; onToggleTheme: () => void }) {
  return (
    <header className={joinClasses(
      'fixed inset-x-0 top-0 z-50 border-b backdrop-blur-lg transition-colors duration-500',
      isNight ? 'border-white/10 bg-black/70' : 'border-black/10 bg-white/75',
    )}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
        <a href="#inicio" className="flex items-center gap-0.5">
          <img src="/icon-dinsides.png" alt="Dinsides Courier" className={joinClasses('h-15 w-15 rounded-2xl object-cover')} />
          <div className="hidden flex-col items-start leading-[0.9] md:flex gap-0.5">
            <p className={joinClasses('text-[12px] uppercase tracking-[0.1em] font-extrabold', isNight ? 'text-white' : 'text-black')}>Dinsides</p>
            <p className={joinClasses('text-[8px] uppercase tracking-[0.15em] font-thin', isNight ? 'text-white' : 'text-red-500')}>Courier</p>
          </div>
        </a>

        <nav className={joinClasses('hidden items-center gap-6 text-sm md:flex', isNight ? 'text-white/70' : 'text-gray-700')}>
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className={joinClasses('transition', isNight ? 'hover:text-white' : 'hover:text-black')}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Cambiar tema día y noche"
            className={joinClasses(
              'relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition duration-500',
              isNight
                ? 'border-white/15 bg-white/5 text-white hover:bg-white/10'
                : 'border-black/15 bg-black/5 text-black hover:bg-black/10',
              isAnimating && 'ring-2 ring-red-400/40',
            )}
          >
            <span className={joinClasses('transition-transform duration-500', isNight ? 'rotate-0 scale-100' : 'rotate-180 scale-95')}>
              {isNight ? <Moon size={16} /> : <Sun size={16} />}
            </span>
          </button>

          <a
            href={whatsappPremiumUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            <MessageCircle size={16} />
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
  const softBorderClass = isNight ? 'border-white/10' : 'border-black/10';
  const sectionAltClass = isNight ? 'bg-white/[0.02]' : 'bg-black/[0.02]';
  const mutedTextClass = isNight ? 'text-white/75' : 'text-gray-600';
  const cardClass = isNight ? 'bg-black/30' : 'bg-white';
  const activeHeroSlide = heroSlides[0];
  const ledRgb = isNight ? '255, 255, 255' : '0, 0, 0';
  const ledBaseOpacity = isNight ? HERO_LED_GLOW.baseOpacityNight : HERO_LED_GLOW.baseOpacityDay;
  const ledGlowOpacity = isNight ? HERO_LED_GLOW.glowOpacityNight : HERO_LED_GLOW.glowOpacityDay;
  const ledStrokeOpacity = isNight ? HERO_LED_GLOW.strokeOpacityNight : HERO_LED_GLOW.strokeOpacityDay;
  const heroLedTextStyle = {
    textShadow: `0 0 ${HERO_LED_GLOW.blurSoftPx}px rgba(${ledRgb}, ${ledBaseOpacity}), 0 0 ${HERO_LED_GLOW.blurStrongPx}px rgba(${ledRgb}, ${ledGlowOpacity})`,
    WebkitTextStroke: `1px rgba(${ledRgb}, ${ledStrokeOpacity})`,
  } as const;

  const handleToggleTheme = () => {
    setIsThemeAnimating(true);
    setIsNight((current) => !current);
    window.setTimeout(() => setIsThemeAnimating(false), 520);
  };

  return (
    <div className={joinClasses('relative min-h-screen overflow-x-hidden selection:bg-red-600 selection:text-white', isNight ? 'text-white' : 'text-gray-900')}>
      <div className={joinClasses('pointer-events-none fixed inset-0 -z-20 transition-opacity duration-700', isNight ? 'bg-black opacity-100' : 'bg-black opacity-0')} />
      <div className={joinClasses('pointer-events-none fixed inset-0 -z-20 transition-opacity duration-700', isNight ? 'bg-white opacity-0' : 'bg-white opacity-100')} />
      <div
        className={joinClasses(
          'pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(255, 0, 0, 0.22),transparent_42%)] transition-opacity duration-500',
          isThemeAnimating ? 'opacity-100' : 'opacity-0',
        )}
      />

      <Header isNight={isNight} isAnimating={isThemeAnimating} onToggleTheme={handleToggleTheme} />

      <main>
        <section
          id="inicio"
          className={joinClasses('relative overflow-hidden border-b min-h-[100svh]', softBorderClass)}
        >
          <div className={joinClasses('landing-noise absolute inset-0', isNight ? 'opacity-35' : 'opacity-10')} />
          <div className={joinClasses('landing-grid absolute inset-0', isNight ? 'opacity-15' : 'opacity-10')} />

          <div className="relative h-[100svh] overflow-hidden">
            <div className="absolute inset-0 transition-all duration-[1400ms] ease-out opacity-100 scale-100 translate-y-0">
              <img
                src={activeHeroSlide.image}
                alt="Slide principal"
                className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-[1800ms] ease-out scale-100"
                style={{ objectPosition: activeHeroSlide.objectPosition }}
              />
              <div
                className={joinClasses(
                  'absolute inset-0',
                  isNight
                    ? 'bg-[linear-gradient(96deg,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.42)_38%,rgba(0,0,0,0.58)_100%)]'
                    : 'bg-[linear-gradient(96deg,rgba(255,255,255,0.84)_0%,rgba(255,255,255,0.52)_38%,rgba(245,245,245,0.38)_100%)]',
                )}
              />
            </div>

            <div className="pointer-events-none absolute inset-0">
              <img
                src={HERO_OVERLAY_IMAGE.src}
                alt=""
                aria-hidden="true"
                className="absolute top-1/2 object-contain"
                style={{
                  height: `${HERO_OVERLAY_IMAGE.heightVh}svh`,
                  right: `${HERO_OVERLAY_IMAGE.rightPercent}%`,
                  transform: `translateY(calc(-50% + ${HERO_OVERLAY_IMAGE.centerYOffsetPx}px))`,
                  zIndex: 12,
                }}
              />

              <div className="absolute inset-0 z-20 flex items-center justify-center">
                <div className="relative inline-flex flex-col items-start">
                  <h1
                    className={joinClasses('text-[26vw] font-black uppercase leading-[0.8] tracking-[0.1em] md:text-[16vw]', isNight ? 'text-white/[0.32]' : 'text-black/[0.85]')}
                    style={heroLedTextStyle}
                  >
                    DINSIDES
                  </h1>

                  <p className={joinClasses(
                    'mt-1 max-w-[min(88vw,720px)] rounded-full px-3  text-[11px] font-medium leading-relaxed sm:mt-2 sm:px-4 sm:py-1 sm:text-sm md:text-xl backdrop-blur-[2px]',
                    isNight
                      ? '+text-white/88'
                      : 'text-black/78',
                  )}>
                    Más que un servicio logístico, somos el motor que impulsa tu marca.
                  </p>
                </div>
              </div>

              <img
                src={HERO_OVERLAY_IMAGE.src}
                alt=""
                aria-hidden="true"
                className="absolute top-1/2 object-contain"
                style={{
                  height: `${HERO_OVERLAY_IMAGE.heightVh}svh`,
                  right: `${HERO_OVERLAY_IMAGE.rightPercent}%`,
                  transform: `translateY(calc(-50% + ${HERO_OVERLAY_IMAGE.centerYOffsetPx}px))`,
                  clipPath: `inset(0 ${100 - HERO_OVERLAY_IMAGE.frontClipPercent}% 0 0)`,
                  zIndex: 28,
                }}
              />
            </div>

          </div>
        </section>

        <section id="nosotros" className="mx-auto max-w-7xl px-5 py-18 sm:px-8 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-red-300">Nosotros</p>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] md:text-5xl">Nuestro objetivo es impulsar el crecimiento de tu marca.</h2>
            </div>

            <div className={joinClasses('space-y-4', mutedTextClass)}>
              <p className="text-base leading-8">Somos el operador logístico oficial de Gamarra, avalados por la Cámara de Comercio de Gamarra.</p>
              <p className="text-base leading-8">Empresa 100% formal con permiso del Ministerio de Transporte.</p>
              <p className="text-base leading-8">Av. Arica 1702, Cercado de Lima · Jirón Antonio Bazo 1218, La Victoria.</p>
            </div>
          </div>
        </section>

        <section id="servicios" className={joinClasses('border-y', softBorderClass, sectionAltClass)}>
          <div className="mx-auto max-w-7xl px-5 py-18 sm:px-8 lg:px-10">
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <h2 className="text-4xl font-black tracking-[-0.06em] md:text-5xl">Servicios</h2>
              <a
                href={whatsappPremiumUrl}
                target="_blank"
                rel="noreferrer"
                className={joinClasses(
                  'inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition',
                  isNight ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-black/15 bg-black/5 text-black hover:bg-black/10',
                )}
              >
                Solicita tu plan premium
                <ArrowRight size={16} />
              </a>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {services.map(({ title, description, icon: Icon }) => (
                <article key={title} className={joinClasses('rounded-[1.6rem] border p-5', softBorderClass, isNight ? 'bg-black/35' : 'bg-white')}>
                  <Icon size={20} className="text-red-300" />
                  <h3 className="mt-4 text-2xl font-semibold">{title}</h3>
                  <p className={joinClasses('mt-3 text-sm leading-7', isNight ? 'text-white/70' : 'text-gray-600')}>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="cobertura" className="mx-auto max-w-7xl px-5 py-18 sm:px-8 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-red-300">Zona de cobertura</p>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] md:text-5xl">Tarifario regular</h2>
              <p className={joinClasses('mt-5 max-w-xl text-sm leading-7', isNight ? 'text-white/70' : 'text-gray-600')}>Precios referenciales para paquetes de 30cm x 20cm x 15cm o 1.5 kg. Medidas mayores, consultar.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {coverageHighlights.map(({ district, price }) => (
                <article key={district} className={joinClasses('flex items-center justify-between rounded-[1.3rem] border px-4 py-3', softBorderClass, isNight ? 'bg-white/5' : 'bg-black/[0.02]')}>
                  <div className={joinClasses('flex items-center gap-2', isNight ? 'text-white/85' : 'text-gray-700')}>
                    <MapPinned size={16} className="text-red-300" />
                    <span>{district}</span>
                  </div>
                  <span className="font-semibold text-red-200">{price}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={joinClasses('border-y', softBorderClass, sectionAltClass)}>
          <div className="mx-auto max-w-7xl px-5 py-18 sm:px-8 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-red-300">Testimonios</p>
                <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] md:text-5xl">Nuestros clientes hablan por nosotros</h2>
                <div className="mt-6 space-y-4">
                  {testimonials.map(({ quote, author }) => (
                    <article key={author} className={joinClasses('rounded-[1.4rem] border p-5', softBorderClass, cardClass)}>
                      <div className="mb-3 flex gap-1 text-red-400">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star key={`${author}-${index}`} size={14} fill="currentColor" />
                        ))}
                      </div>
                      <p className={joinClasses('text-sm leading-7', mutedTextClass)}>“{quote}”</p>
                      <p className={joinClasses('mt-4 text-sm font-semibold', isNight ? 'text-white' : 'text-black')}>{author}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-red-300">Normas ISO</p>
                <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] md:text-5xl">Formalidad y respaldo</h2>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {isoCodes.map((code) => (
                    <article key={code} className={joinClasses('rounded-[1.3rem] border p-4', softBorderClass, cardClass)}>
                      <p className="text-lg font-semibold">{code}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="contacto" className="mx-auto max-w-7xl px-5 py-18 sm:px-8 lg:px-10">
          <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(127,29,29,0.55),rgba(8,8,8,0.96)_48%,rgba(255,255,255,0.04))] p-8 md:p-10">
            <p className="text-xs uppercase tracking-[0.3em] text-red-200">Contacto</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.06em] md:text-5xl">Lleva tu marca a su máximo potencial con Dinsides Courier.</h2>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={whatsappSalesUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200"
              >
                <MessageCircle size={16} />
                Escríbenos
              </a>
              <a
                href={whatsappPremiumUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Tarifario premium
              </a>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <article className="rounded-[1.4rem] border border-white/10 bg-black/30 p-5">
                <p className="text-[11px] uppercase tracking-[0.26em] text-red-300">Sedes</p>
                <p className="mt-3 text-sm leading-7 text-white/75">Av. Arica 1702, Cercado de Lima</p>
                <p className="text-sm leading-7 text-white/75">Jirón Antonio Bazo 1220, La Victoria</p>
              </article>
              <article className="rounded-[1.4rem] border border-white/10 bg-black/30 p-5">
                <p className="text-[11px] uppercase tracking-[0.26em] text-red-300">Canales</p>
                <p className="mt-3 text-sm leading-7 text-white/75">922 509 459 · 992 565 076</p>
                <p className="text-sm leading-7 text-white/75">contacto@dinsidescourier.com</p>
              </article>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
