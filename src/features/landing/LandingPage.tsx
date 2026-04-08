import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  MapPinned,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  Star,
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

const storyStages = [
  'Recojo y control del pedido.',
  'Apertura de caja y preparación final.',
  'Entrega segura al cliente.',
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function useStoryProgress(sectionRef: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);
  const [motionEnabled, setMotionEnabled] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 767px), (prefers-reduced-motion: reduce)');

    const syncMotionPreference = (matches: boolean) => setMotionEnabled(!matches);

    const updateProgress = () => {
      const section = sectionRef.current;

      if (!section) {
        setProgress(0);
        return;
      }

      const rect = section.getBoundingClientRect();
      const totalScrollableDistance = Math.max(section.offsetHeight - window.innerHeight, 1);
      setProgress(clamp(-rect.top / totalScrollableDistance, 0, 1));
    };

    syncMotionPreference(mediaQuery.matches);

    const handleMediaChange = (event: MediaQueryListEvent) => {
      syncMotionPreference(event.matches);
      updateProgress();
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
    }

    let rafId = 0;

    const requestUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        updateProgress();
        rafId = 0;
      });
    };

    requestUpdate();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);

      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }

      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [sectionRef]);

  return { progress, motionEnabled };
}

function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
        <a href="#inicio" className="flex items-center gap-3">
          <img src="/icon-dinsides.png" alt="Dinsides Courier" className="h-10 w-10 rounded-2xl border border-white/10 object-cover" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-red-300">Dinsides Courier</p>
            <p className="text-sm text-white/80">La satisfacción de tu cliente es nuestra prioridad</p>
          </div>
        </a>

        <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="transition hover:text-white">
              {item.label}
            </a>
          ))}
        </nav>

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
    </header>
  );
}

function BoxReveal({ progress, motionEnabled }: { progress: number; motionEnabled: boolean }) {
  const p = motionEnabled ? progress : 0.65;
  const lidRotation = -clamp(p * 120, 0, 102);
  const innerLift = clamp((p - 0.16) / 0.84, 0, 1);
  const cardTranslate = 80 - innerLift * 132;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[28rem] rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_50%_20%,rgba(230,0,0,0.2),transparent_30%),linear-gradient(180deg,#111_0%,#050505_100%)] p-6">
      <div className="landing-grid absolute inset-0 rounded-[2.2rem] opacity-20" />

      <div className="absolute inset-x-6 bottom-6 top-10 rounded-[1.6rem] border border-white/10 bg-black/40">
        <div className="absolute inset-x-[13%] bottom-[12%] h-[32%] rounded-[1.5rem] border border-[#6f4a2f] bg-[linear-gradient(180deg,#6d462b_0%,#51311d_100%)]" />

        <div
          className="absolute inset-x-[13%] bottom-[39%] h-[12%] origin-bottom rounded-t-[1.4rem] border border-[#7a5336] bg-[linear-gradient(180deg,#94603b_0%,#70452b_100%)]"
          style={{ transform: `perspective(900px) rotateX(${lidRotation}deg)` }}
        />

        <div
          className="absolute inset-x-[21%] bottom-[34%] rounded-[1.3rem] border border-white/12 bg-white/10 p-4 backdrop-blur-sm"
          style={{ transform: `translate3d(0, ${cardTranslate}px, 0)` }}
        >
          <p className="text-[10px] uppercase tracking-[0.26em] text-red-200">Entrega Dinsides</p>
          <p className="mt-2 text-xl font-black text-white">Tu pedido llega seguro</p>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const storyRef = useRef<HTMLElement | null>(null);
  const { progress, motionEnabled } = useStoryProgress(storyRef);
  const stageOpacities = [0.18, 0.52, 0.84].map((center) => clamp(1 - Math.abs(progress - center) / 0.22, 0, 1));

  return (
    <div className="min-h-screen bg-black text-white selection:bg-red-600 selection:text-white">
      <Header />

      <main>
        <section ref={storyRef} id="inicio" className={`relative overflow-hidden border-b border-white/10 ${motionEnabled ? 'min-h-[250svh]' : 'min-h-screen'}`}>
          {motionEnabled ? (
            <div className="sticky top-[76px] h-[calc(100svh-76px)] overflow-hidden">
              <div className="landing-noise absolute inset-0 opacity-35" />
              <div className="landing-grid absolute inset-0 opacity-15" />

              <div className="relative mx-auto h-full max-w-7xl px-5 py-6 sm:px-8 lg:px-10">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.32em] text-white/52">
                  <span>Lima, Perú</span>
                  <a
                    href={whatsappPremiumUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-semibold tracking-[0.18em] text-white transition hover:bg-white/10"
                  >
                    Tarifas exclusivas
                    <ArrowRight size={14} />
                  </a>
                </div>

                <div className="pointer-events-none absolute inset-x-0 top-[16%] text-center">
                  <h1 className="text-[18vw] font-black uppercase leading-[0.84] tracking-[0.14em] text-white/[0.08] md:text-[13vw]">DINSIDES</h1>
                </div>

                <div className="absolute inset-x-0 top-[20%]">
                  <BoxReveal progress={progress} motionEnabled={motionEnabled} />
                </div>

                <article
                  className="absolute left-5 top-[24%] max-w-xs rounded-[1.5rem] border border-white/10 bg-black/55 p-5 backdrop-blur-sm md:left-10"
                  style={{ opacity: 0.25 + stageOpacities[0] * 0.75, transform: `translate3d(0, ${(1 - stageOpacities[0]) * 24}px,0)` }}
                >
                  <p className="text-[10px] uppercase tracking-[0.3em] text-red-300">01</p>
                  <p className="mt-3 text-xl font-semibold text-white">{storyStages[0]}</p>
                </article>

                <article
                  className="absolute right-5 top-[44%] max-w-xs rounded-[1.5rem] border border-white/10 bg-black/55 p-5 backdrop-blur-sm md:right-10"
                  style={{ opacity: 0.25 + stageOpacities[1] * 0.75, transform: `translate3d(0, ${(1 - stageOpacities[1]) * 24}px,0)` }}
                >
                  <p className="text-[10px] uppercase tracking-[0.3em] text-red-300">02</p>
                  <p className="mt-3 text-xl font-semibold text-white">{storyStages[1]}</p>
                </article>

                <article
                  className="absolute left-5 bottom-[18%] max-w-xs rounded-[1.5rem] border border-white/10 bg-black/55 p-5 backdrop-blur-sm md:left-10"
                  style={{ opacity: 0.25 + stageOpacities[2] * 0.75, transform: `translate3d(0, ${(1 - stageOpacities[2]) * 24}px,0)` }}
                >
                  <p className="text-[10px] uppercase tracking-[0.3em] text-red-300">03</p>
                  <p className="mt-3 text-xl font-semibold text-white">{storyStages[2]}</p>
                </article>

                <div className="absolute bottom-8 right-5 flex flex-col gap-3 sm:flex-row md:right-10">
                  <a
                    href={whatsappSalesUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200"
                  >
                    Conoce nuestro servicio
                    <ArrowRight size={16} />
                  </a>
                  <a
                    href="#nosotros"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Seguir bajando
                    <ChevronDown size={16} />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative mx-auto max-w-7xl px-5 pb-10 pt-28 sm:px-8 lg:px-10">
              <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-center">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.32em] text-red-300">Lima, Perú</p>
                  <h1 className="mt-3 text-[4.8rem] font-black uppercase leading-[0.84] tracking-[-0.08em] md:text-[7rem]">DINSIDES</h1>
                  <p className="mt-4 max-w-xl text-white/75">Impulsamos el crecimiento de tu marca con entregas seguras, rápidas y formales.</p>
                </div>
                <BoxReveal progress={0.7} motionEnabled={false} />
              </div>
            </div>
          )}
        </section>

        <section id="nosotros" className="mx-auto max-w-7xl px-5 py-18 sm:px-8 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-red-300">Nosotros</p>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] md:text-5xl">Nuestro objetivo es impulsar el crecimiento de tu marca.</h2>
            </div>

            <div className="space-y-4 text-white/75">
              <p className="text-base leading-8">Somos el operador logístico oficial de Gamarra, avalados por la Cámara de Comercio de Gamarra.</p>
              <p className="text-base leading-8">Empresa 100% formal con permiso del Ministerio de Transporte.</p>
              <p className="text-base leading-8">Av. Arica 1702, Cercado de Lima · Jirón Antonio Bazo 1218, La Victoria.</p>
            </div>
          </div>
        </section>

        <section id="servicios" className="border-y border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-7xl px-5 py-18 sm:px-8 lg:px-10">
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <h2 className="text-4xl font-black tracking-[-0.06em] md:text-5xl">Servicios</h2>
              <a
                href={whatsappPremiumUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Solicita tu plan premium
                <ArrowRight size={16} />
              </a>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {services.map(({ title, description, icon: Icon }) => (
                <article key={title} className="rounded-[1.6rem] border border-white/10 bg-black/35 p-5">
                  <Icon size={20} className="text-red-300" />
                  <h3 className="mt-4 text-2xl font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/70">{description}</p>
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
              <p className="mt-5 max-w-xl text-sm leading-7 text-white/70">Precios referenciales para paquetes de 30cm x 20cm x 15cm o 1.5 kg. Medidas mayores, consultar.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {coverageHighlights.map(({ district, price }) => (
                <article key={district} className="flex items-center justify-between rounded-[1.3rem] border border-white/10 bg-white/5 px-4 py-3">
                  <div className="flex items-center gap-2 text-white/85">
                    <MapPinned size={16} className="text-red-300" />
                    <span>{district}</span>
                  </div>
                  <span className="font-semibold text-red-200">{price}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-7xl px-5 py-18 sm:px-8 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-red-300">Testimonios</p>
                <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] md:text-5xl">Nuestros clientes hablan por nosotros</h2>
                <div className="mt-6 space-y-4">
                  {testimonials.map(({ quote, author }) => (
                    <article key={author} className="rounded-[1.4rem] border border-white/10 bg-black/30 p-5">
                      <div className="mb-3 flex gap-1 text-red-400">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star key={`${author}-${index}`} size={14} fill="currentColor" />
                        ))}
                      </div>
                      <p className="text-sm leading-7 text-white/75">“{quote}”</p>
                      <p className="mt-4 text-sm font-semibold text-white">{author}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-red-300">Normas ISO</p>
                <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] md:text-5xl">Formalidad y respaldo</h2>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {isoCodes.map((code) => (
                    <article key={code} className="rounded-[1.3rem] border border-white/10 bg-black/30 p-4">
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
