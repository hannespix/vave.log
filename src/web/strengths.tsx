import { useEffect, useState } from 'react';
import type { Membership, Project, Task } from '../shared/types';
import type { Service } from '../shared/service';
import { fitScore, MIN_SAMPLES, skillProfiles, type SkillProfile } from '../shared/skills';
import { Dialog, Notice } from './components';
import { useI18n } from './i18n';
import { minutesLabel, shortDate } from './helpers';
import './strengths.css';

/** Lädt die gebuchte Zeit je Aufgabe (eigene Sicht) und rechnet die Profile; null, solange geladen wird. */
export function useProfiles(service: Service, workspaceId: string, userIds: string[], tasks: Task[], projects: Project[], reloadKey: unknown): SkillProfile[] | null {
  const [effort, setEffort] = useState<Map<string, number> | null>(null);
  useEffect(() => { let alive = true; Promise.resolve().then(() => service.listTaskEffort(workspaceId)).then((rows) => { if (alive) setEffort(new Map(rows.map((r) => [r.task_id, r.minutes]))); }).catch(() => { if (alive) setEffort(new Map()); }); return () => { alive = false; }; }, [service, workspaceId, reloadKey]);
  if (!effort) return null;
  return skillProfiles(userIds, tasks, projects, effort);
}
const percent = (v: number | null, locale: string) => v == null ? '–' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v * 100)} %`;
const speedText = (v: number | null, locale: string) => v == null ? '–' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v)}×`;
const categoryLabel = (category: string, t: (s: string, v?: Record<string, string | number>) => string) => category.startsWith('kunde:') ? t('Kunde {name}', { name: category.slice(6) }) : category.startsWith('projekt:') ? t('Projekt {name}', { name: category.slice(8).toUpperCase() }) : category;

/** Tabelle je Kategorie mit Stichprobengröße an jeder Zahl. */
export function StrengthsTable({ profile }: { profile: SkillProfile }) {
  const { t, locale } = useI18n();
  if (!profile.categories.length) return <p className="muted">{t('Noch keine zugewiesenen Aufgaben – das Profil entsteht mit erledigten Aufgaben, Schätzungen und gebuchter Zeit.')}</p>;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={t('Stärkenprofil')}><table className="strengths-table"><thead><tr><th>{t('Kategorie')}</th><th>{t('Erledigt')}</th><th>{t('Stunden')}</th><th>{t('Tempo')}</th><th>{t('Termintreue')}</th><th>{t('Durchlauf')}</th><th>{t('Wieder geöffnet')}</th><th>{t('Bewertung')}</th><th>{t('Passung')}</th></tr></thead><tbody>
    {profile.categories.map((c) => { const fit = fitScore(c); return <tr key={c.category} className={c.done < MIN_SAMPLES ? 'strengths-thin' : ''}><td><strong>{categoryLabel(c.category, t)}</strong>{c.lastDone && <small className="muted">{t('zuletzt {date}', { date: shortDate(c.lastDone) })}</small>}</td><td>{c.done}<small className="muted"> / {c.tasks}</small></td><td>{minutesLabel(c.minutes)}</td><td title={t('Gebuchte Zeit geteilt durch Schätzung, Median; 1× = wie geplant')}>{speedText(c.speed, locale)}<small className="muted"> n={c.speedSamples}</small></td><td>{percent(c.onTime, locale)}<small className="muted"> n={c.onTimeSamples}</small></td><td>{c.cycleDays == null ? '–' : t('{days} Tage', { days: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(c.cycleDays) })}<small className="muted"> n={c.cycleSamples}</small></td><td>{c.reopened}</td><td>{c.rating == null ? '–' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(c.rating)} / 5`}<small className="muted"> n={c.ratingSamples}</small></td><td>{fit == null ? <span className="muted">{t('ab {count} erledigten', { count: MIN_SAMPLES })}</span> : <strong>{fit}</strong>}</td></tr>; })}
  </tbody></table></div>;
}
export function StrengthsNote() {
  const { t } = useI18n();
  return <Notice kind="info">{t('Grenzen: kleine Stichproben, Schätzqualität prägt das Tempo, Teamarbeit steht nicht in den Daten. Die Zahlen sind Gesprächsgrundlage, kein Ranking.')}</Notice>;
}
/** Dialog der Leitung je Person. */
export function StrengthsDialog({ member, tasks, projects, service, workspaceId, reloadKey, onClose }: { member: Membership; tasks: Task[]; projects: Project[]; service: Service; workspaceId: string; reloadKey: unknown; onClose: () => void }) {
  const { t } = useI18n();
  const profiles = useProfiles(service, workspaceId, [member.user_id], tasks, projects, reloadKey);
  return <Dialog title={t('Stärken: {name}', { name: member.display_name || member.email })} onClose={onClose} wide>
    <div className="form-stack">{profiles ? <StrengthsTable profile={profiles[0]}/> : <p className="muted">{t('Workspace wird aktualisiert …')}</p>}<StrengthsNote/><div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>{t('Schließen')}</button></div></div>
  </Dialog>;
}
/** Eigenes Profil auf der Übersicht – nur, wenn es schon etwas zu zeigen gibt. */
