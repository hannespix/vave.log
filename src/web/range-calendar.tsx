import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { shiftDate } from '../shared/holidays';
import { monthDays } from '../shared/vacation';
import { useI18n } from './i18n';
import { longDate } from './helpers';

/**
 * Zeitraum im Kalender wählen: über Tage ziehen – oder erst den Beginn, dann das Ende anklicken.
 * Zwei Monate nebeneinander, Wochenenden und Feiertage sind sichtbar, bestehende Einträge markiert.
 * Tastatur: Pfeiltasten bewegen den Fokus, Eingabe oder Leertaste wählt.
 */
export interface DayInfo { holiday?: string; makeup?: string; own?: string; others?: number; off?: boolean }
interface Props { from: string; to: string; onChange: (from: string, to: string) => void; today: string; info: (day: string) => DayInfo; disabled?: boolean; label: string; month: string; onMonth: (month: string) => void; months?: number }

const shiftMonth = (month: string, by: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
export const monthOfDay = (day: string) => day.slice(0, 7);

export function RangeCalendar({ from, to, onChange, today, info, disabled, label, month, onMonth, months = 2 }: Props) {
  const { t, locale } = useI18n();
  const [drag, setDrag] = useState<{ a: string; b: string } | null>(null);
  const dragging = useRef<{ a: string; b: string; moved: boolean } | null>(null);
  // Nach einem einzelnen Klick wartet der Kalender auf das Ende des Zeitraums.
  const [anchor, setAnchor] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null); const skipClick = useRef(false);
  const lo = drag ? (drag.a < drag.b ? drag.a : drag.b) : from, hi = drag ? (drag.a < drag.b ? drag.b : drag.a) : to;
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const heads = Array.from({ length: 7 }, (_, i) => weekday.format(new Date(Date.UTC(2024, 0, 1 + i))).slice(0, 2)); // 1.1.2024 war ein Montag
  const dayAt = (e: ReactPointerEvent<HTMLElement>) => (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-range-day]')?.dataset.rangeDay ?? null;

  const choose = (day: string) => {
    if (anchor && anchor !== day) { onChange(anchor < day ? anchor : day, anchor < day ? day : anchor); setAnchor(null); }
    else { onChange(day, day); setAnchor(day); }
  };
  function down(e: ReactPointerEvent<HTMLDivElement>) {
    const day = (e.target as HTMLElement).closest<HTMLElement>('[data-range-day]')?.dataset.rangeDay;
    if (!day || disabled || e.button !== 0 || e.pointerType === 'touch') return;
    dragging.current = { a: day, b: day, moved: false }; e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragging.current; if (!d) return;
    const day = dayAt(e);
    if (day && day !== d.b) { d.b = day; d.moved = true; setDrag({ a: d.a, b: d.b }); }
  }
  function up(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragging.current; dragging.current = null; setDrag(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d) return;
    // Der Klick, der auf das Loslassen folgt, ist damit schon verarbeitet.
    skipClick.current = true; window.setTimeout(() => { skipClick.current = false; }, 0);
    if (d.moved) { onChange(d.a < d.b ? d.a : d.b, d.a < d.b ? d.b : d.a); setAnchor(null); }
    else choose(d.a);
  }
  function key(e: KeyboardEvent<HTMLButtonElement>, day: string) {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0;
    if (!step) return;
    e.preventDefault();
    const next = shiftDate(day, step);
    if (monthOfDay(next) < month) onMonth(shiftMonth(month, -1)); else if (monthOfDay(next) > shiftMonth(month, months - 1)) onMonth(shiftMonth(month, 1));
    window.setTimeout(() => root.current?.querySelector<HTMLElement>(`[data-range-day="${next}"]`)?.focus(), 0);
  }

  return <div className="range-cal" ref={root} role="group" aria-label={label}>
    <div className="range-cal-nav"><button type="button" className="icon-button" onClick={() => onMonth(shiftMonth(month, -1))} aria-label={t('Vorheriger Monat')}><ChevronLeft size={17}/></button><button type="button" className="icon-button" onClick={() => onMonth(shiftMonth(month, 1))} aria-label={t('Nächster Monat')}><ChevronRight size={17}/></button></div>
    <div className="range-cal-months" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { dragging.current = null; setDrag(null); }}>
      {Array.from({ length: months }, (_, n) => {
        const key2 = shiftMonth(month, n), [y, m] = key2.split('-').map(Number), days = monthDays(y, m);
        const lead = (new Date(`${days[0]}T12:00:00Z`).getUTCDay() + 6) % 7;
        return <div className="range-cal-month" key={key2}>
          <p className="range-cal-title">{monthLabel.format(new Date(Date.UTC(y, m - 1, 1)))}</p>
          <div className="range-cal-grid">{heads.map((h, i) => <span key={h + i} className={`range-cal-head${i > 4 ? ' range-weekend' : ''}`} aria-hidden="true">{h}</span>)}
            {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} aria-hidden="true"/>)}
            {days.map((day) => {
              const d = info(day), dow = new Date(`${day}T12:00:00Z`).getUTCDay(), weekend = (dow === 0 || dow === 6) && !d.makeup;
              const inRange = day >= lo && day <= hi;
              const extra = [d.holiday, d.makeup, d.own, d.others ? t('{count} weitere abwesend', { count: d.others }) : ''].filter(Boolean).join(', ');
              return <button type="button" key={day} data-range-day={day} disabled={disabled} aria-pressed={inRange} tabIndex={day === from || (from < days[0] && day === days[0] && n === 0) ? 0 : -1}
                className={`range-day${weekend ? ' range-weekend' : ''}${d.holiday ? ' range-holiday' : ''}${d.off ? ' range-off' : ''}${d.own ? ' range-own' : ''}${inRange ? ' range-in' : ''}${day === lo ? ' range-start' : ''}${day === hi ? ' range-end' : ''}${day === today ? ' range-today' : ''}`}
                aria-label={`${longDate(day)}${extra ? `, ${extra}` : ''}`} title={extra || undefined} onKeyDown={(e) => key(e, day)} onClick={() => { if (skipClick.current) { skipClick.current = false; return; } choose(day); }}>
                <span>{Number(day.slice(8))}</span>{d.others ? <i className="range-dot" aria-hidden="true"/> : null}
              </button>;
            })}
          </div>
        </div>;
      })}
    </div>
    <p className="range-cal-legend" aria-hidden="true"><span><i className="lg-holiday"/>{t('Feiertag')}</span><span><i className="lg-others"/>{t('Andere sind weg')}</span><span><i className="lg-own"/>{t('Schon eingetragen')}</span></p>
    <p className="range-cal-hint muted">{anchor ? t('Jetzt das Ende anklicken – oder noch einmal denselben Tag für einen einzelnen Tag.') : t('Über Tage ziehen oder Beginn und Ende anklicken.')}</p>
  </div>;
}
