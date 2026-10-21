/**
 * Stärkenprofile aus Zeit- und Projektdaten, rein gerechnet und mit
 * Mindeststichprobe. Kategorie einer Aufgabe = ihre Tags, sonst die Tags des
 * Projekts, sonst der Kunde bzw. das Projekt. Signale je Person × Kategorie:
 * Geschwindigkeit (gebucht ÷ Schätzung, Median), Termintreue, Durchlaufzeit,
 * Wiedereröffnungen, Bewertung durch die Leitung, Erfahrung (Stunden, Aufgaben).
 * Die Zahlen sind Gesprächsgrundlage, kein Ranking: kleine Stichproben,
 * Schätzqualität und Teamarbeit stehen nicht in den Daten.
 */
export interface SkillTask { id: string; project_id: string; title: string; status: 'todo' | 'doing' | 'done'; assignee_id: string | null; due_date: string | null; estimated_minutes?: number | null; tags?: string[] | null; rating?: number | null; started_at?: string | null; done_at?: string | null; reopened_count?: number | null; created_at?: string }
export interface SkillProject { id: string; code: string; name: string; client: string; tags?: string[] | null }
export interface CategoryStats { category: string; tasks: number; done: number; minutes: number; speed: number | null; speedSamples: number; onTime: number | null; onTimeSamples: number; cycleDays: number | null; cycleSamples: number; reopened: number; rating: number | null; ratingSamples: number; lastDone: string | null }
export interface SkillProfile { user_id: string; categories: CategoryStats[]; totalDone: number; totalMinutes: number }
export interface Recommendation { user_id: string; category: string; fit: number; reasons: string[]; stats: CategoryStats | null; freeMinutes: number | null }

export const MIN_SAMPLES = 3;
export const normalizeTags = (raw: string | string[]): string[] => { const list = Array.isArray(raw) ? raw : raw.split(/[,;\n]/); const out: string[] = []; for (const t of list) { const v = t.trim().toLowerCase().slice(0, 30); if (v && !out.includes(v)) out.push(v); if (out.length >= 10) break; } return out; };
/** Kategorien einer Aufgabe: eigene Tags, sonst Projekt-Tags, sonst Kunde/Projekt. */
export function taskCategories(task: SkillTask, project: SkillProject | undefined): string[] {
  if (task.tags?.length) return task.tags;
  if (project?.tags?.length) return project.tags;
  return [project?.client ? `kunde:${project.client.toLowerCase()}` : `projekt:${project?.code?.toLowerCase() ?? task.project_id}`];
}
const median = (values: number[]) => { if (!values.length) return null; const s = [...values].sort((a, b) => a - b); const mid = Math.floor(s.length / 2); return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2; };
const days = (from: string, to: string) => Math.max(0, (Date.parse(to) - Date.parse(from)) / 86400000);

export function skillProfiles(userIds: string[], tasks: SkillTask[], projects: SkillProject[], effort: Map<string, number>): SkillProfile[] {
  return userIds.map((user_id) => {
    const own = tasks.filter((t) => t.assignee_id === user_id);
    const buckets = new Map<string, SkillTask[]>();
    for (const task of own) for (const cat of taskCategories(task, projects.find((p) => p.id === task.project_id))) { let list = buckets.get(cat); if (!list) { list = []; buckets.set(cat, list); } list.push(task); }
    const categories: CategoryStats[] = [...buckets.entries()].map(([category, list]) => {
      const done = list.filter((t) => t.status === 'done');
      const speeds = done.filter((t) => t.estimated_minutes && effort.get(t.id)).map((t) => (effort.get(t.id) ?? 0) / (t.estimated_minutes ?? 1));
      const onTimeList: number[] = done.filter((t) => t.due_date && t.done_at).map((t) => (t.done_at as string).slice(0, 10) <= (t.due_date as string) ? 1 : 0);
      const cycles = done.filter((t) => t.done_at && (t.started_at || t.created_at)).map((t) => days((t.started_at ?? t.created_at) as string, t.done_at as string));
      const ratings = done.filter((t) => t.rating).map((t) => t.rating as number);
      const lastDone = done.map((t) => t.done_at ?? '').filter(Boolean).sort().at(-1) ?? null;
      return { category, tasks: list.length, done: done.length, minutes: list.reduce((s, t) => s + (effort.get(t.id) ?? 0), 0), speed: median(speeds), speedSamples: speeds.length, onTime: onTimeList.length ? onTimeList.reduce((a, b) => a + b, 0) / onTimeList.length : null, onTimeSamples: onTimeList.length, cycleDays: median(cycles), cycleSamples: cycles.length, reopened: done.reduce((s, t) => s + (t.reopened_count ?? 0), 0), rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null, ratingSamples: ratings.length, lastDone: lastDone ? lastDone.slice(0, 10) : null };
    }).sort((a, b) => b.done - a.done || b.minutes - a.minutes || a.category.localeCompare(b.category));
    return { user_id, categories, totalDone: own.filter((t) => t.status === 'done').length, totalMinutes: own.reduce((s, t) => s + (effort.get(t.id) ?? 0), 0) };
  });
}
/** Passung 0–100 aus Geschwindigkeit, Termintreue, Wiedereröffnungen und Bewertung; null unter der Mindeststichprobe. */
export function fitScore(stats: CategoryStats | null): number | null {
  if (!stats || stats.done < MIN_SAMPLES) return null;
  const parts: number[] = [];
  if (stats.speed != null && stats.speedSamples >= 2) parts.push(Math.max(0, Math.min(1, 1.5 - stats.speed)));
  if (stats.onTime != null && stats.onTimeSamples >= 2) parts.push(stats.onTime);
  parts.push(Math.max(0, 1 - stats.reopened / stats.done));
  if (stats.rating != null) parts.push((stats.rating - 1) / 4);
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length * 100);
}
/** Empfehlung für eine Aufgabe: Kandidaten mit Passung je Kategorie, freie Kapazität als Zweitkriterium. */
export function recommendAssignees(task: { project_id: string; tags?: string[] | null }, project: SkillProject | undefined, profiles: SkillProfile[], free: Map<string, number | null>): Recommendation[] {
  const categories = taskCategories({ id: '', project_id: task.project_id, title: '', status: 'todo', assignee_id: null, due_date: null, tags: task.tags }, project);
  const list: Recommendation[] = [];
  for (const profile of profiles) {
    let best: { stats: CategoryStats; fit: number } | null = null;
    for (const category of categories) { const stats = profile.categories.find((c) => c.category === category); const fit = fitScore(stats ?? null); if (stats && fit != null && (!best || fit > best.fit)) best = { stats, fit }; }
    const freeMinutes = free.get(profile.user_id) ?? null;
    if (!best && (freeMinutes == null || freeMinutes <= 0)) continue;
    const reasons: string[] = [];
    if (best) { reasons.push(`${best.stats.done}×${best.stats.category}`); if (best.stats.speed != null) reasons.push(`speed:${best.stats.speed.toFixed(2)}`); if (best.stats.onTime != null) reasons.push(`ontime:${Math.round(best.stats.onTime * 100)}`); if (best.stats.rating != null) reasons.push(`rating:${best.stats.rating.toFixed(1)}`); }
    list.push({ user_id: profile.user_id, category: best?.stats.category ?? categories[0], fit: best?.fit ?? 0, reasons, stats: best?.stats ?? null, freeMinutes });
  }
  return list.sort((a, b) => b.fit - a.fit || (b.freeMinutes ?? -1) - (a.freeMinutes ?? -1)).slice(0, 5);
}
