import { useEffect, useRef, useState } from 'react';
import lottie, { type AnimationItem } from 'lottie-web/build/player/lottie_light';
import { Pause, Play } from 'lucide-react';

export function Logo({ large = false }: { large?: boolean }) {
  const container = useRef<HTMLDivElement>(null); const animation = useRef<AnimationItem | null>(null);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const item = lottie.loadAnimation({ container: container.current, renderer: 'svg', loop: true, autoplay: !reduced.matches, path: '/vave-logo.json', rendererSettings: { progressiveLoad: true, preserveAspectRatio: 'xMidYMid meet' } });
    animation.current = item;
    const ready = () => { setLoaded(true); if (reduced.matches) item.goToAndStop(25, true); };
    const onMotion = () => { if (reduced.matches) { item.pause(); setPaused(true); } };
    item.addEventListener('DOMLoaded', ready); reduced.addEventListener('change', onMotion);
    return () => { reduced.removeEventListener('change', onMotion); item.destroy(); animation.current = null; };
  }, []);
  return <div className={`brand ${large ? 'brand-large' : ''}`}><div className="brand-word" aria-label="VAVE"><div ref={container} className={`brand-animation ${loaded ? 'is-loaded' : ''}`} aria-hidden="true" />{!loaded && <span className="brand-fallback" aria-hidden="true">VAVE</span>}</div><span className="brand-log">.LOG<span className="brand-dot" /></span>{loaded && <button className="animation-toggle" type="button" aria-label={paused ? 'Logo-Animation abspielen' : 'Logo-Animation pausieren'} onClick={() => { if (paused) animation.current?.play(); else animation.current?.pause(); setPaused(!paused); }}>{paused ? <Play size={10} /> : <Pause size={10} />}</button>}</div>;
}
