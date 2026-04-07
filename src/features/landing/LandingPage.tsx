import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Globe,
  MapPinned,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  Star,
  Truck,
  Warehouse,
} from 'lucide-react';

const whatsappSalesUrl =
  'https://api.whatsapp.com/send?phone=51922509459&text=Hola,%20quiero%20informaci%C3%B3n%20sobre%20sus%20servicios%20log%C3%ADsticos.';
const whatsappPremiumUrl =
  'https://api.whatsapp.com/send?phone=51992565076&text=Hola,%20quiero%20conocer%20el%20plan%20premium%20y%20sus%20tarifas.';

const services = [
  {
    title: 'Contraentrega inteligente',
    description: 'Cobro contraentrega con múltiples medios de pago para aumentar la conversión sin fricción.',
    icon: PackageCheck,
  },
  {
    title: 'Recojo y despacho ágil',
    description: 'Coordinamos el recojo, clasificamos rutas y activamos entregas rápidas con trazabilidad.',
    icon: Truck,
  },
  {
    title: 'Cambios y devoluciones',
    description: 'Gestionamos cambios de talla, color o producto cuidando la experiencia final del cliente.',
    icon: ShieldCheck,
  },
  {
    title: 'Fulfillment operativo',
    description: 'Almacenamiento, preparación, rotulado y despacho para marcas que quieren escalar con orden.',
    icon: Warehouse,
  },
];

const trustPillars = [
  'Operador logístico formal con foco en seguridad y cumplimiento.',
  'Respaldo comercial para marcas que necesitan una operación confiable.',
  'Atención humana, seguimiento real y velocidad operativa en Lima.',
];

const coverageHighlights = [
  { district: 'Breña', price: 'S/ 8.00' },
  { district: 'Cercado de Lima', price: 'S/ 10.00' },
  { district: 'San Isidro', price: 'S/ 10.00' },
  { district: 'Miraflores', price: 'S/ 10.00' },
  { district: 'Ate', price: 'S/ 12.00' },
  { district: 'Chosica', price: 'S/ 22.00' },
];

const testimonials = [
  {
    quote:
      'Siempre cumplen con los envíos y nos facilitan el trabajo diario. Se siente que hay orden y compromiso real detrás del servicio.',
    author: 'Maritza Valdivia',
    company: 'Pinky Cat',
  },
  {
    quote:
      'El courier se adaptó a lo que necesitábamos como emprendedores. Resuelven rápido y eso para nosotros vale oro.',
    author: 'Cindy Yaro',
    company: 'Lucy Collection',
  },
  {
    quote:
      'La atención es cercana, clara y resolutiva. Cuando aparece un inconveniente, lo encaran y lo solucionan.',
    author: 'Magaly Tenicela Ore',
    company: 'Cliente recurrente',
  },
];

const isoStandards = ['ISO 9001', 'ISO 14001', 'ISO 45001', 'ISO 27001', 'ISO 28000', 'ISO 50001'];

const storyStages = [
  {
    eyebrow: '01 · promesa de marca',
    title: 'La entrega no es el final de la venta. Es el momento donde tu marca se juega la confianza.',
    description:
      'Dinsides Courier convierte la operación en una experiencia controlada: presentación correcta, comunicación clara y ejecución consistente.',
    bullets: ['Imagen seria frente al cliente final', 'Operación formal, visible y medible'],
    metricLabel: 'Posicionamiento',
    metricValue: 'Entrega con estándar de marca',
  },
  {
    eyebrow: '02 · velocidad y trazabilidad',
    title: 'Mientras el fondo avanza, mostramos lo que realmente importa: rapidez, cobertura y seguimiento real.',
    description:
      'Recojo, clasificación y despacho se activan con foco en tiempos de respuesta, visibilidad del pedido y coordinación humana.',
    bullets: ['Lima, Callao y despacho a agencias', 'Seguimiento operativo con respuesta ágil'],
    metricLabel: 'Cobertura',
    metricValue: 'Lima metropolitana + agencias',
  },
  {
    eyebrow: '03 · fulfillment y contraentrega',
    title: 'Cobrar, almacenar, preparar y entregar sin fricción también es parte del relato comercial.',
    description:
      'La narrativa pasa de la promesa a la ejecución: fulfillment, contraentrega y devoluciones diseñadas para sostener la conversión.',
    bullets: ['Cobro contraentrega con soporte operativo', 'Cambios, devoluciones y preparación de pedidos'],
    metricLabel: 'Modelo operativo',
    metricValue: 'B2C · fulfillment · contraentrega',
  },
  {
    eyebrow: '04 · transición al sitio',
    title: 'Cuando la historia queda clara, la animación termina y el sitio sigue normal: servicios, cobertura, testimonios y contacto.',
    description:
      'El scroll inicial dura lo necesario para explicar el valor comercial. Después, la landing vuelve al flujo natural para convertir.',
    bullets: ['CTA directo a WhatsApp', 'Paso limpio hacia las secciones informativas'],
    metricLabel: 'Siguiente paso',
    metricValue: 'Seguí bajando y revisá la operación',
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function useStoryParallax(sectionRef: React.RefObject<HTMLElement | null>) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [motionEnabled, setMotionEnabled] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 767px), (prefers-reduced-motion: reduce)');

    const syncMotionPreference = (matches: boolean) => {
      setMotionEnabled(!matches);
    };

    const updateProgress = () => {
      const section = sectionRef.current;

      if (!section) {
        setScrollProgress(0);
        return;
      }

      const rect = section.getBoundingClientRect();
      const totalScrollableDistance = Math.max(section.offsetHeight - window.innerHeight, 1);
      const nextProgress = clamp(-rect.top / totalScrollableDistance, 0, 1);

      setScrollProgress(nextProgress);
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

      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [sectionRef]);

  return { motionEnabled, scrollProgress };
}

function getStageVisualState(index: number, progress: number) {
  const centers = [0.12, 0.38, 0.64, 0.88];
  const center = centers[index] ?? 0.5;
  const distance = Math.abs(progress - center);
  const opacity = clamp(1 - distance / 0.2, 0, 1);
  const translateY = (progress - center) * -90;
  const scale = 0.96 + opacity * 0.04;

  return { opacity, translateY, scale };
}

function LandingHeader() {
  return (
    <header className="flex items-center justify-between gap-4 rounded-full border border-white/12 bg-black/55 px-4 py-3 backdrop-blur-md">
      <a href="#inicio" className="flex items-center gap-3">
        <img src="/icon-dinsides.png" alt="Dinsides Courier" className="h-10 w-10 rounded-2xl object-cover ring-1 ring-white/10" />
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-red-300/85">Dinsides Courier</p>
          <p className="text-sm font-semibold text-white">Logística seria para marcas que necesitan control</p>
        </div>
      </a>
      <nav className="hidden items-center gap-6 text-sm text-neutral-300 md:flex">
        <a href="#nosotros" className="transition hover:text-white">Nosotros</a>
        <a href="#servicios" className="transition hover:text-white">Servicios</a>
        <a href="#cobertura" className="transition hover:text-white">Cobertura</a>
        <a href="#contacto" className="transition hover:text-white">Contacto</a>
      </nav>
      <a
        href={whatsappPremiumUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
      >
        <MessageCircle size={16} />
        Tarifas premium
      </a>
    </header>
  );
}

export function LandingPage() {
  const storyRef = useRef<HTMLElement | null>(null);
  const { motionEnabled, scrollProgress } = useStoryParallax(storyRef);

  const backgroundY = motionEnabled ? scrollProgress * -90 : 0;
  const backgroundScale = motionEnabled ? 1.08 - scrollProgress * 0.08 : 1.02;
  const overlayOpacity = 0.24 + scrollProgress * 0.36;
  const stageIndex = Math.min(Math.floor(scrollProgress * storyStages.length), storyStages.length - 1);

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-red-600 selection:text-white">
      {motionEnabled ? (
        <section ref={storyRef} id="inicio" className="relative min-h-[320svh] border-b border-white/10 bg-black">
          <div className="sticky top-0 h-screen overflow-hidden">
            <div className="absolute inset-0">
              <img
                src="https://dinsidescourier.com/public/img/empresa/banner6.webp"
                alt="Equipo y operación logística Dinsides Courier"
                className="h-full w-full object-cover"
                style={{ transform: `translate3d(0, ${backgroundY}px, 0) scale(${backgroundScale})` }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28)_0%,rgba(0,0,0,0.58)_42%,rgba(0,0,0,0.94)_100%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(220,38,38,0.32),transparent_34%),radial-gradient(circle_at_80%_72%,rgba(255,255,255,0.1),transparent_30%)]" style={{ opacity: overlayOpacity }} />
              <div className="landing-grid absolute inset-0 opacity-25" />
              <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,rgba(0,0,0,0.72),transparent)]" />
            </div>

            <div className="relative mx-auto flex h-full max-w-7xl flex-col px-5 pb-8 pt-6 sm:px-8 lg:px-10">
              <LandingHeader />

              <div className="grid flex-1 items-end gap-8 pb-10 pt-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:pb-16">
                <div className="relative min-h-[380px] lg:min-h-[460px]">
                  {storyStages.map((stage, index) => {
                    const { opacity, scale, translateY } = getStageVisualState(index, scrollProgress);

                    return (
                      <article
                        key={stage.eyebrow}
                        className="absolute inset-0 flex max-w-3xl flex-col justify-end rounded-[2rem] border border-white/12 bg-black/45 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-sm md:p-8"
                        style={{
                          opacity,
                          transform: `translate3d(0, ${translateY}px, 0) scale(${scale})`,
                          pointerEvents: opacity > 0.45 ? 'auto' : 'none',
                        }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-300">{stage.eyebrow}</p>
                        <h1 className="mt-4 text-4xl font-black leading-[0.96] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
                          {stage.title}
                        </h1>
                        <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-200 sm:text-lg">{stage.description}</p>
                        <div className="mt-7 grid gap-3 sm:grid-cols-2">
                          {stage.bullets.map((bullet) => (
                            <div key={bullet} className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-neutral-100">
                              {bullet}
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-4 lg:pb-4">
                  <div className="rounded-[2rem] border border-white/12 bg-black/55 p-6 backdrop-blur-sm">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-neutral-400">Lectura de scroll</p>
                    <div className="mt-4 h-1.5 rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-red-600 transition-[width] duration-200" style={{ width: `${scrollProgress * 100}%` }} />
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {storyStages.map((stage, index) => {
                        const isActive = index === stageIndex;

                        return (
                          <div
                            key={stage.metricLabel}
                            className={`rounded-[1.5rem] border p-4 transition duration-200 ${
                              isActive
                                ? 'border-red-500/60 bg-red-600/12 text-white'
                                : 'border-white/10 bg-white/5 text-neutral-300'
                            }`}
                          >
                            <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">{stage.metricLabel}</p>
                            <p className="mt-2 text-sm font-semibold">{stage.metricValue}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-[2rem] border border-white/12 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="grid gap-3 text-sm text-neutral-100 sm:grid-cols-3">
                      <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-red-300/80">Tiempo de respuesta</p>
                        <p className="mt-2 font-semibold">Rápido, claro y medible</p>
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-red-300/80">Cobertura</p>
                        <p className="mt-2 font-semibold">Lima, Callao y agencias</p>
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-red-300/80">Modelo</p>
                        <p className="mt-2 font-semibold">Fulfillment + contraentrega</p>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                      <a
                        href={whatsappSalesUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500"
                      >
                        Hablar con un asesor
                        <ArrowRight size={16} />
                      </a>
                      <a
                        href="#servicios"
                        className="inline-flex items-center justify-center rounded-full border border-white/14 bg-white/8 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/14"
                      >
                        Ver servicios
                      </a>
                    </div>

                    <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.32em] text-neutral-400">
                      <span className="h-px w-12 bg-white/20" />
                      Scroll narrativo inicial · luego flujo normal
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section id="inicio" className="relative overflow-hidden border-b border-white/10 bg-black">
          <div className="absolute inset-0">
            <img
              src="https://dinsidescourier.com/public/img/empresa/banner6.webp"
              alt="Equipo y operación logística Dinsides Courier"
              className="h-full w-full object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.56)_0%,rgba(0,0,0,0.78)_45%,rgba(0,0,0,0.94)_100%)]" />
            <div className="landing-grid absolute inset-0 opacity-20" />
          </div>

          <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-6 sm:px-8 lg:px-10">
            <LandingHeader />

            <div className="mt-10 max-w-3xl rounded-[2rem] border border-white/12 bg-black/50 p-6 backdrop-blur-sm md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-300">Operación comercial y logística</p>
              <h1 className="mt-4 text-4xl font-black leading-[0.96] tracking-[-0.04em] text-white sm:text-5xl">
                Una historia clara: confianza, velocidad, cobertura y ejecución real.
              </h1>
              <p className="mt-5 text-base leading-7 text-neutral-200">
                En pantallas chicas o con reducción de movimiento, la experiencia se vuelve estática para priorizar legibilidad sin romper la narrativa.
              </p>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {storyStages.map((stage) => (
                <article key={stage.eyebrow} className="rounded-[1.75rem] border border-white/12 bg-white/5 p-5 backdrop-blur-sm">
                  <p className="text-[11px] uppercase tracking-[0.26em] text-red-300">{stage.eyebrow}</p>
                  <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">{stage.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-neutral-200">{stage.description}</p>
                </article>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={whatsappSalesUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Hablar con un asesor
                <ArrowRight size={16} />
              </a>
              <a
                href="#servicios"
                className="inline-flex items-center justify-center rounded-full border border-white/14 bg-white/8 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/14"
              >
                Ver servicios
              </a>
            </div>
          </div>
        </section>
      )}

      <main className="relative z-10 mx-auto max-w-7xl px-5 py-18 sm:px-8 lg:px-10">
        <section id="nosotros" className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.85)] backdrop-blur-sm md:p-9">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-600/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-red-200">
              <BadgeCheck size={14} />
              Confianza operacional
            </div>
            <h2 className="max-w-2xl text-3xl font-black tracking-[-0.04em] text-white md:text-4xl">
              Más que mover paquetes: protegemos la percepción de tu marca en cada entrega.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-300">
              Dinsides Courier nace con una lógica clara: logística confiable, cercana y suficientemente sólida como para sostener el crecimiento de una marca. La experiencia final del cliente no se improvisa; se diseña.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <article className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-red-300/75">Misión</p>
                <p className="mt-3 text-sm leading-6 text-neutral-200">Brindar un servicio responsable que genere satisfacción real para clientes y equipos.</p>
              </article>
              <article className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-red-300/75">Visión</p>
                <p className="mt-3 text-sm leading-6 text-neutral-200">Convertirse en un referente peruano en experiencias logísticas seguras y confiables.</p>
              </article>
              <article className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-red-300/75">Valores</p>
                <p className="mt-3 text-sm leading-6 text-neutral-200">Responsabilidad, empatía, resiliencia y aprendizaje continuo como base operativa.</p>
              </article>
            </div>
          </div>

          <div className="space-y-4">
            {trustPillars.map((pillar) => (
              <article key={pillar} className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <div className="mt-1 rounded-2xl border border-red-500/20 bg-red-600/12 p-3 text-red-200">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <p className="text-sm leading-7 text-neutral-200">{pillar}</p>
                  </div>
                </div>
              </article>
            ))}
            <article className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(127,29,29,0.32),rgba(10,10,10,0.96)_58%,rgba(255,255,255,0.06))] p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <MapPinned className="text-red-300" size={18} />
                <p className="text-sm font-semibold text-white">Sedes operativas</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-neutral-200">Av. Arica 1702, Cercado de Lima · Jirón Antonio Bazo 1218, La Victoria.</p>
            </article>
          </div>
        </section>

        <section id="servicios" className="mt-18">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-300/75">Servicios</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white md:text-4xl">Soluciones logísticas que combinan velocidad, control y experiencia.</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-neutral-300">
              Conservamos la estructura útil de la landing, pero con una dirección visual sobria y una lectura enfocada en operación comercial real.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {services.map(({ title, description, icon: Icon }) => (
              <article key={title} className="group rounded-[1.9rem] border border-white/10 bg-white/5 p-6 transition duration-300 hover:-translate-y-1 hover:border-red-500/40 hover:bg-white/7">
                <div className="inline-flex rounded-2xl border border-white/10 bg-black/25 p-3 text-red-300 transition group-hover:scale-105">
                  <Icon size={20} />
                </div>
                <h3 className="mt-5 text-xl font-bold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-300">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="cobertura" className="mt-18 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[2rem] border border-white/10 bg-white/5 p-7 backdrop-blur-sm md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-300/75">Cobertura & tarifario</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">Cobertura metropolitana con teaser de precios para activar la conversación.</h2>
            <p className="mt-4 text-sm leading-7 text-neutral-300">
              Mostramos un adelanto del tarifario regular y derivamos el detalle completo por WhatsApp para mantener la experiencia liviana y enfocada en leads.
            </p>
            <div className="mt-7 rounded-[1.75rem] border border-white/10 bg-black/25 p-5">
              <div className="flex items-center gap-3 text-white">
                <Globe size={18} className="text-red-300" />
                <p className="font-semibold">Cobertura en Lima, Callao y despacho a agencias</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-300">
                Precios referenciales para paquetes de hasta 30 × 20 × 15 cm o 1.5 kg. Para medidas mayores, el equipo comercial valida la mejor tarifa.
              </p>
            </div>
            <a
              href={whatsappPremiumUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Solicitar tarifario completo
              <ArrowRight size={16} />
            </a>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,#171717,#050505_72%,rgba(127,29,29,0.9))] p-4 shadow-[0_30px_80px_-35px_rgba(127,29,29,0.45)] md:p-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {coverageHighlights.map(({ district, price }) => (
                <div key={district} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">Zona</p>
                  <p className="mt-2 text-lg font-semibold text-white">{district}</p>
                  <p className="mt-4 text-sm text-red-300">Desde {price}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-18 rounded-[2rem] border border-white/10 bg-white/5 p-7 backdrop-blur-sm md:p-8">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-300/75">Normas ISO</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">La formalidad también se comunica.</h2>
            </div>
            <div className="hidden rounded-full border border-white/10 bg-black/25 px-4 py-2 text-xs uppercase tracking-[0.24em] text-neutral-300 md:block">
              Gestión · seguridad · calidad
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {isoStandards.map((iso) => (
              <div key={iso} className="rounded-[1.5rem] border border-white/10 bg-black/25 px-4 py-5 text-center text-sm font-semibold text-neutral-100">
                {iso}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-18">
          <div className="mb-8 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-300/75">Testimonios</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white md:text-4xl">Nuestros clientes describen mejor el impacto que cualquier promesa.</h2>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {testimonials.map(({ quote, author, company }) => (
              <article key={author} className="rounded-[1.9rem] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <div className="mb-5 flex gap-1 text-red-400">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={`${author}-${index}`} size={16} fill="currentColor" />
                  ))}
                </div>
                <p className="text-sm leading-7 text-neutral-200">“{quote}”</p>
                <div className="mt-6 border-t border-white/10 pt-5">
                  <p className="font-semibold text-white">{author}</p>
                  <p className="text-sm text-neutral-400">{company}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="contacto" className="mt-18 pb-10">
          <div className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(127,29,29,0.46),rgba(10,10,10,0.94)_46%,rgba(255,255,255,0.06))]">
            <div className="grid gap-8 px-6 py-8 md:px-8 md:py-10 lg:grid-cols-[1fr_0.85fr] lg:px-10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-200">Contacto directo</p>
                <h2 className="mt-3 max-w-xl text-3xl font-black tracking-[-0.04em] text-white md:text-5xl">
                  Llevá tu operación a un estándar serio, visible y escalable.
                </h2>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-neutral-200 md:text-base">
                  Si tu marca necesita un courier que entienda velocidad, presentación y confianza, conversemos. El objetivo no es solo entregar: es sostener tu reputación.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <a
                    href={whatsappSalesUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200"
                  >
                    <MessageCircle size={16} />
                    Contactar por WhatsApp
                  </a>
                  <a
                    href="mailto:contacto@dinsidescourier.com"
                    className="inline-flex items-center justify-center rounded-full border border-white/14 bg-white/8 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/14"
                  >
                    contacto@dinsidescourier.com
                  </a>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <article className="rounded-[1.6rem] border border-white/10 bg-black/25 p-5">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-red-300/75">Oficinas</p>
                  <p className="mt-3 text-sm leading-6 text-neutral-200">Av. Arica 1702, Cercado de Lima</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-200">Jirón Antonio Bazo 1218, La Victoria</p>
                </article>
                <article className="rounded-[1.6rem] border border-white/10 bg-black/25 p-5">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-red-300/75">Canales</p>
                  <p className="mt-3 text-sm leading-6 text-neutral-200">922 509 459 · 992 565 076</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-200">Instagram, TikTok, Facebook, LinkedIn y YouTube</p>
                </article>
                <article className="rounded-[1.6rem] border border-white/10 bg-black/25 p-5 sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-red-300/75">Cierre</p>
                  <p className="mt-3 text-sm leading-7 text-neutral-200">
                    Esta landing sigue separada del sistema autenticado para poder compartirse como página pública, pero ahora la parte superior cuenta una historia de operación y confianza en lugar de quedarse en un hero decorativo.
                  </p>
                </article>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
