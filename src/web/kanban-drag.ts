import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Kanban-Ziehen mit Zeigerereignissen statt HTML5-Drag-and-Drop: Die Karte
 * haftet als gekippte Kopie am Zeiger, die Zielspalte leuchtet auf, beim
 * Loslassen fliegt die Kopie an den neuen Platz (bzw. zurück). Funktioniert mit
 * Maus, Stift und Touch (dort nach kurzem Halten, damit Scrollen frei bleibt).
 * Spalten tragen `data-drop-status`, Karten `data-task-card`; Elemente mit
 * `data-no-drag` (Menü, Statusauswahl) starten kein Ziehen.
 */
export const DRAG_THRESHOLD = 6;
export const TOUCH_HOLD_MS = 220;
const TOUCH_SLOP = 10;
const EDGE = 72;
const SETTLE_MS = 240;

export interface KanbanDrag<S extends string> { id: string; from: S; over: S | null; height: number }
interface Session<S extends string> {
  id: string; from: S; card: HTMLElement; pointerId: number; touch: boolean;
  startX: number; startY: number; x: number; y: number; rect: DOMRect;
  ghost: HTMLElement | null; over: S | null; timer: number; frame: number;
  listeners: [string, EventListener, AddEventListenerOptions | boolean][];
}

/** Zielspalte unter dem Zeiger (die Kopie selbst ist für Treffer durchlässig). */
export function dropStatusAt<S extends string>(x: number, y: number, doc: Document = document): S | null {
  const column = doc.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-status]');
  return (column?.dataset.dropStatus as S | undefined) ?? null;
}
/** Scrollgeschwindigkeit nahe am oberen/unteren Fensterrand (px je Bild), sonst 0. */
export function edgeSpeed(y: number, height: number, edge = EDGE): number {
  if (y < edge) return -Math.ceil(((edge - y) / edge) * 18);
  if (y > height - edge) return Math.ceil(((y - (height - edge)) / edge) * 18);
  return 0;
}
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useKanbanDrag<S extends string>(options: { disabled: boolean; onDrop: (id: string, to: S) => void }) {
  const [drag, setDrag] = useState<KanbanDrag<S> | null>(null);
  const [settling, setSettling] = useState('');
  const latest = useRef(options);
  const session = useRef<Session<S> | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => { latest.current = options; });

  /** Beendet die Sitzung: Zuhörer, Timer, Autoscroll. Die Kopie räumt der Aufrufer weg. */
  function cleanup() {
    const s = session.current;
    if (!s) return;
    window.clearTimeout(s.timer);
    cancelAnimationFrame(s.frame);
    for (const [type, listener, opts] of s.listeners) window.removeEventListener(type, listener, opts);
    document.body.classList.remove('kanban-dragging');
    session.current = null;
  }

  function blockTouchScroll(e: TouchEvent) { if (session.current?.ghost) e.preventDefault(); }

  function place(s: Session<S>) {
    if (s.ghost) s.ghost.style.translate = `${s.x - s.startX}px ${s.y - s.startY}px`;
  }
  function autoscroll() {
    const s = session.current;
    if (!s?.ghost) return;
    const speed = edgeSpeed(s.y, window.innerHeight);
    if (speed) {
      window.scrollBy(0, speed);
      updateOver(s);
    }
    s.frame = requestAnimationFrame(autoscroll);
  }
  function updateOver(s: Session<S>) {
    const over = dropStatusAt<S>(s.x, s.y);
    if (over !== s.over) {
      s.over = over;
      setDrag((d) => (d ? { ...d, over } : d));
    }
  }
  function begin(s: Session<S>) {
    const ghost = s.card.cloneNode(true) as HTMLElement;
    ghost.classList.add('task-card-ghost');
    ghost.removeAttribute('data-task-card');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    Object.assign(ghost.style, { left: `${s.rect.left}px`, top: `${s.rect.top}px`, width: `${s.rect.width}px`, height: `${s.rect.height}px` });
    document.body.appendChild(ghost);
    s.ghost = ghost;
    place(s);
    // Ein Bild später anheben, damit Kippen und Schatten animiert einsetzen.
    requestAnimationFrame(() => ghost.classList.add('task-card-lifted'));
    document.body.classList.add('kanban-dragging');
    window.getSelection?.()?.removeAllRanges();
    suppressClick.current = true;
    s.over = s.from;
    setDrag({ id: s.id, from: s.from, over: s.from, height: s.rect.height });
    s.frame = requestAnimationFrame(autoscroll);
  }
  function onMove(e: PointerEvent) {
    const s = session.current;
    if (!s || e.pointerId !== s.pointerId) return;
    s.x = e.clientX; s.y = e.clientY;
    const distance = Math.hypot(s.x - s.startX, s.y - s.startY);
    if (!s.ghost) {
      // Touch: Bewegung vor Ablauf der Haltezeit ist Scrollen, kein Ziehen.
      if (s.touch) { if (distance > TOUCH_SLOP) cleanup(); return; }
      if (distance < DRAG_THRESHOLD) return;
      begin(s);
    }
    e.preventDefault();
    place(s);
    updateOver(s);
  }
  function finish(drop: boolean) {
    const s = session.current;
    if (!s) return;
    const ghost = s.ghost, rect = s.rect, target = drop ? s.over : null, from = s.from, id = s.id;
    cleanup();
    setDrag(null);
    // Den Klick, der dem Loslassen folgt, schlucken – sonst öffnet sich der Editor.
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    if (!ghost) { suppressClick.current = false; return; }
    const moved = Boolean(target && target !== from);
    if (moved) {
      setSettling(id);
      latest.current.onDrop(id, target!);
    }
    if (reducedMotion()) { ghost.remove(); setSettling(''); return; }
    // Nach dem Neuzeichnen: an den neuen Platz (oder zurück) fliegen, dann ablegen.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const card = moved ? document.querySelector<HTMLElement>(`[data-task-card="${CSS.escape(id)}"]`) : null;
      const end = card?.getBoundingClientRect() ?? rect;
      ghost.classList.add('task-card-settle');
      ghost.classList.remove('task-card-lifted');
      ghost.style.translate = `${end.left - rect.left}px ${end.top - rect.top}px`;
      ghost.style.width = `${end.width}px`;
      const done = () => { ghost.remove(); setSettling((current) => (current === id ? '' : current)); };
      ghost.addEventListener('transitionend', (e) => { if (e.propertyName === 'translate') done(); }, { once: true });
      window.setTimeout(done, SETTLE_MS + 80);
    }));
  }
  function onUp(e: PointerEvent) { if (session.current && e.pointerId === session.current.pointerId) finish(true); }
  function onCancel(e: PointerEvent) { if (session.current && e.pointerId === session.current.pointerId) finish(false); }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && session.current?.ghost) { e.preventDefault(); e.stopPropagation(); finish(false); }
  }

  // Beim Verlassen der Seite mitten im Ziehen nichts hängen lassen.
  useEffect(() => () => {
    const s = session.current;
    if (!s) return;
    window.clearTimeout(s.timer);
    cancelAnimationFrame(s.frame);
    for (const [type, listener, opts] of s.listeners) window.removeEventListener(type, listener, opts);
    document.body.classList.remove('kanban-dragging');
    s.ghost?.remove();
    session.current = null;
  }, []);

  const start = (e: ReactPointerEvent<HTMLElement>, id: string, from: S) => {
    if (latest.current.disabled || session.current || e.button !== 0 || !e.isPrimary) return;
    if ((e.target as HTMLElement).closest('[data-no-drag],input,select,textarea,[role="combobox"],[role="listbox"]')) return;
    const touch = e.pointerType === 'touch';
    const s: Session<S> = {
      id, from, card: e.currentTarget, pointerId: e.pointerId, touch,
      startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, rect: e.currentTarget.getBoundingClientRect(),
      ghost: null, over: null, timer: 0, frame: 0,
      listeners: [
        ['pointermove', onMove as EventListener, { passive: false }],
        ['pointerup', onUp as EventListener, false],
        ['pointercancel', onCancel as EventListener, false],
        ['keydown', onKey as EventListener, true],
        ...(touch ? [['touchmove', blockTouchScroll as EventListener, { passive: false }] as Session<S>['listeners'][number]] : []),
      ],
    };
    session.current = s;
    for (const [type, listener, opts] of s.listeners) window.addEventListener(type, listener, opts);
    if (touch) {
      s.timer = window.setTimeout(() => { if (session.current === s) { s.rect = s.card.getBoundingClientRect(); begin(s); navigator.vibrate?.(8); } }, TOUCH_HOLD_MS);
    }
  };
  const onClickCapture = (e: ReactMouseEvent) => {
    if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); }
  };
  return { drag, settling, start, onClickCapture };
}
