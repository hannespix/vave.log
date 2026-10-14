import { useEffect, useRef, useState } from 'react';

type Gesture = readonly (readonly [position: number, durationMs: number])[];
// Scrub the original shape morphs in both directions. Every gesture starts and
// ends at zero, so a new variation never snaps back to the first frame.
const gestures: readonly Gesture[] = [
  [[0, 1200], [1, 4200], [1, 900], [0, 5800], [0, 2100]], // Long, quiet breath.
  [[0.66, 3600], [0.25, 2600], [1, 4600], [1, 700], [0, 5700], [0, 2200]], // Double wave.
  [[0.42, 3400], [0.08, 2400], [0.78, 4300], [0.38, 2800], [0, 3900], [0, 2600]], // Smaller ripples.
];
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export function Logo({ large = false }: { large?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    // lottie_light (~70 kB gzip) lädt als eigener Chunk erst, wenn das Logo
    // wirklich gerendert wird; bis dahin (und bei Ladefehlern) steht die
    // Wortmarke als Fallback.
    let cancelled = false;
    let teardown: (() => void) | undefined;
    void import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
      if (cancelled || !node.isConnected) return;
      teardown = setup(lottie);
    }).catch(() => { /* Fallback-Wortmarke bleibt sichtbar. */ });
    const setup = (lottie: typeof import('lottie-web/build/player/lottie_light')['default']) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const item = lottie.loadAnimation({
      container: node,
      renderer: 'svg',
      loop: false,
      autoplay: false,
      path: `${import.meta.env.BASE_URL}vave-logo.json`,
      rendererSettings: { progressiveLoad: true, preserveAspectRatio: 'xMidYMid meet' },
    });
    let ready = false;
    let disposed = false;
    let inView = !('IntersectionObserver' in window);
    let requestId: number | undefined;
    let lastTime: number | undefined;
    let lastFrame = -1;
    let variation = 0;
    let segment = 0;
    let elapsed = 0;
    let from = 0;
    const varyTiming = () => gestures[variation].map(([position, ms]) => [position, ms * (0.9 + Math.random() * 0.3)] as const);
    let sequence = varyTiming();

    const draw = (position: number) => {
      const frame = position * Math.max(0, item.totalFrames - 1);
      if (Math.abs(frame - lastFrame) > 0.0001) {
        item.goToAndStop(frame, true);
        lastFrame = frame;
      }
    };
    const canAnimate = () => ready && !disposed && inView && !document.hidden && !reduced.matches;
    const stop = () => {
      if (requestId !== undefined) cancelAnimationFrame(requestId);
      requestId = undefined;
      lastTime = undefined;
    };
    const tick = (now: number) => {
      requestId = undefined;
      if (!canAnimate()) { lastTime = undefined; return; }
      // A background tab or stalled frame must not fast-forward the logo.
      if (lastTime !== undefined) elapsed += Math.min(now - lastTime, 100);
      lastTime = now;
      while (elapsed >= sequence[segment][1]) {
        elapsed -= sequence[segment][1];
        from = sequence[segment][0];
        segment++;
        if (segment === sequence.length) {
          // Pick either other gesture; never repeat the same loop immediately.
          variation = (variation + 1 + Math.floor(Math.random() * (gestures.length - 1))) % gestures.length;
          sequence = varyTiming();
          segment = 0;
        }
      }
      const [to, duration] = sequence[segment];
      draw(from + (to - from) * ease(elapsed / duration));
      requestId = requestAnimationFrame(tick);
    };
    const syncMotion = () => {
      stop();
      if (ready && reduced.matches) {
        segment = 0;
        elapsed = 0;
        from = 0;
        draw(0);
      }
      if (canAnimate()) requestId = requestAnimationFrame(tick);
    };
    const onReady = () => {
      if (disposed) return;
      ready = true;
      item.setSubframe(true);
      draw(0);
      setLoaded(true);
      syncMotion();
    };
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncMotion();
    }) : undefined;
    observer?.observe(node);
    item.addEventListener('DOMLoaded', onReady);
    reduced.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);
    return () => {
      disposed = true;
      stop();
      observer?.disconnect();
      reduced.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncMotion);
      item.removeEventListener('DOMLoaded', onReady);
      item.destroy();
    };
    };
    return () => { cancelled = true; teardown?.(); };
  }, []);

  return <div className={`brand ${large ? 'brand-large' : ''}`}>
    <div className="brand-word" role="img" aria-label="VAVE">
      <div ref={container} className={`brand-animation ${loaded ? 'is-loaded' : ''}`} aria-hidden="true" />
      {!loaded && <span className="brand-fallback" aria-hidden="true">VAVE</span>}
    </div>
    <span className="brand-dot" aria-hidden="true" />
    <span className="brand-log">LOG</span>
  </div>;
}
