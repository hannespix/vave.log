/**
 * Projektzuordnung für KI-Vorschläge, rein gerechnet: Ein KI-Client kennt den
 * Kalendereintrag „Jour fixe Museum" oder den Ordner „VAV-002 Renderings", nicht
 * die Projekt-IDs. match_project sucht diakritikatolerant und tokenweise über
 * Code, Name, Kunde, Tags und Aufgabentitel und liefert bewertete Treffer.
 */
export interface MatchableProject { id: string; code: string; name: string; client: string; status: 'active' | 'paused' | 'archived'; tags?: string[] | null }
export interface MatchableTask { id: string; project_id: string; title: string; status: 'todo' | 'doing' | 'done' }
export interface ProjectMatch { project_id: string; code: string; name: string; client: string; score: number; task_id: string | null; task_title: string | null; reasons: string[] }

export const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replaceAll('ß', 'ss').toLowerCase();
const tokens = (text: string) => fold(text).split(/[^a-z0-9]+/).filter((t) => t.length >= 2);

/** Bewertet, wie gut ein Freitext zu einem Projekt passt (0–100): Code exakt 100, Wortanfänge, Teilwörter. */
function scoreText(queryTokens: string[], haystack: string): number {
  const words = tokens(haystack);
  if (!words.length || !queryTokens.length) return 0;
  let hits = 0;
  for (const q of queryTokens) {
    if (words.includes(q)) hits += 1;
    else if (words.some((w) => w.startsWith(q) || q.startsWith(w) && w.length >= 3)) hits += 0.6;
    else if (words.some((w) => w.includes(q) && q.length >= 3)) hits += 0.3;
  }
  return Math.round(hits / queryTokens.length * 100);
}
export function matchProject(query: string, projects: MatchableProject[], tasks: MatchableTask[] = [], limit = 5): ProjectMatch[] {
  const q = fold(query).trim();
  const qt = tokens(query);
  if (!q) return [];
  const results: ProjectMatch[] = [];
  for (const p of projects) {
    const reasons: string[] = [];
    let score = 0;
    if (fold(p.code) === q || q.includes(fold(p.code))) { score = 100; reasons.push('code'); }
    const byName = scoreText(qt, p.name); if (byName > score) { score = byName; reasons.length = 0; reasons.push('name'); } else if (byName >= 60) reasons.push('name');
    const byClient = p.client ? scoreText(qt, p.client) : 0; if (byClient > score) { score = byClient; reasons.length = 0; reasons.push('client'); } else if (byClient >= 60) reasons.push('client');
    const byTags = p.tags?.length ? scoreText(qt, p.tags.join(' ')) : 0; if (byTags > score) { score = byTags; reasons.length = 0; reasons.push('tags'); } else if (byTags >= 60) reasons.push('tags');
    let task: MatchableTask | null = null, taskScore = 0;
    for (const t of tasks) { if (t.project_id !== p.id || t.status === 'done') continue; const s = scoreText(qt, t.title); if (s > taskScore) { taskScore = s; task = t; } }
    if (task && taskScore >= 50) { reasons.push('task'); score = Math.max(score, Math.round(taskScore * 0.9)); }
    if (p.status !== 'active') score = Math.round(score * 0.5);
    if (score >= 30) results.push({ project_id: p.id, code: p.code, name: p.name, client: p.client, score, task_id: task && taskScore >= 50 ? task.id : null, task_title: task && taskScore >= 50 ? task.title : null, reasons });
  }
  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}
/** Rundet Minuten auf Viertelstunden (mindestens 15). */
export const roundQuarter = (minutes: number) => Math.max(15, Math.round(minutes / 15) * 15);
/** Summe der Minuten je Tag, um Tagesdeckel und Doppelungen vor dem Übernehmen zu prüfen. */
export function overlapsBooked(day: string, minutes: number, entries: { work_date: string; minutes: number }[]): { booked: number; total: number; overDay: boolean } {
  const booked = entries.filter((e) => e.work_date === day).reduce((s, e) => s + e.minutes, 0);
  return { booked, total: booked + minutes, overDay: booked + minutes > 1440 };
}
