import { Plus } from 'lucide-react';
import type { Project, TimeEntry } from '../shared/types';
import { useI18n } from './i18n';
import { addDays, longDate, minutesLabel } from './helpers';

/**
 * Deine Zeit Tag für Tag: je Tag ein Balken, eingefärbt nach Projekt – man sieht auf einen Blick,
 * wo die Woche hingeht und wo noch nichts steht. Das Plus trägt Zeit für genau diesen Tag nach.
 * Bei langen Zeiträumen fasst die Leiste mehrere Tage zusammen.
 */
const MAX_ROWS = 14;
export function WeekStrip({ entries, projects, range, today, onAdd }: { entries: TimeEntry[]; projects: Project[]; range: { from: string; to: string }; today: string; onAdd?: (date: string) => void }) {
  const { t, locale } = useI18n();
  const days = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400000) + 1;
  const size = days <= MAX_ROWS ? 1 : Math.ceil(days / 8);
  const rows = Array.from({ length: Math.ceil(days / size) }, (_, i) => {
    const from = addDays(range.from, i * size), to = addDays(from, size - 1) > range.to ? range.to : addDays(from, size - 1);
    const mine = entries.filter((e) => e.work_date >= from && e.work_date <= to);
    const byProject = new Map<string, number>();
    for (const e of mine) byProject.set(e.project_id, (byProject.get(e.project_id) ?? 0) + e.minutes);
    return { from, to, total: mine.reduce((n, e) => n + e.minutes, 0), parts: [...byProject].sort((a, b) => b[1] - a[1]) };
  });
  const total = rows.reduce((n, r) => n + r.total, 0);
  const scale = Math.max(size === 1 ? 480 : 60, ...rows.map((r) => r.total));
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const dayMonth = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const project = (id: string) => projects.find((p) => p.id === id);
  const used = [...new Set(rows.flatMap((r) => r.parts.map((p) => p[0])))].map(project).filter((p): p is Project => !!p).slice(0, 5);
  return <section className="panel week-strip" aria-labelledby="week-strip-title">
    <div className="panel-heading"><div><p className="eyebrow">{t('DEIN ZEITRAUM')}</p><h2 id="week-strip-title">{t('Tag für Tag.')}</h2></div><span className="week-strip-total"><strong>{minutesLabel(total)}</strong><small className="muted">{t('erfasst')}</small></span></div>
    <ol className="week-strip-days">{rows.map((r) => { const dow = at(r.from).getUTCDay(), weekend = size === 1 && (dow === 0 || dow === 6), isToday = today >= r.from && today <= r.to;
      const label = size === 1 ? longDate(r.from) : `${longDate(r.from)} – ${longDate(r.to)}`;
      return <li key={r.from} className={`week-day${weekend ? ' week-day-off' : ''}${isToday ? ' week-day-today' : ''}`}>
        <span className="week-day-name">{size === 1 ? <><strong>{weekday.format(at(r.from))}</strong><small>{dayMonth.format(at(r.from))}</small></> : <small>{dayMonth.format(at(r.from))} – {dayMonth.format(at(r.to))}</small>}</span>
        <span className="week-day-bar" role="img" aria-label={`${label}: ${minutesLabel(r.total)}`}>{r.parts.map(([id, minutes]) => { const p = project(id); return <i key={id} style={{ width: `${minutes / scale * 100}%`, background: p?.color ?? '#bda1fc' }} title={`${p ? `${p.code} · ${p.name}` : t('Projekt')}: ${minutesLabel(minutes)}`}/>; })}</span>
        <span className="week-day-sum">{r.total ? minutesLabel(r.total) : <span className="muted">–</span>}</span>
        {onAdd && size === 1 && <button type="button" className="icon-button week-day-add" aria-label={t('Zeit für {date} erfassen', { date: longDate(r.from) })} title={t('Zeit für {date} erfassen', { date: longDate(r.from) })} onClick={() => onAdd(r.from)}><Plus size={15}/></button>}
      </li>; })}</ol>
    {used.length > 0 && <p className="week-strip-legend">{used.map((p) => <span key={p.id}><i style={{ background: p.color }} aria-hidden="true"/>{p.name}</span>)}</p>}
  </section>;
}
