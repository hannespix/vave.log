import type { Locale } from '../../shared/i18n';
import type { Rights } from '../../shared/rights';
import { searchPalette } from '../helpers';
import { HELP_TOPICS, helpText, helpVisible, type HelpTopic, type Text } from './catalog';
import { HELP_BODIES } from './articles';

const all = (text: Text) => text.join(' ');
/** Volltext eines Artikels in der aktuellen Sprache (Schritte, Hinweise, Tabellen, Listen). */
export function helpBodyText(id: string, locale: Locale): string {
  const body = HELP_BODIES[id];
  if (!body) return '';
  const parts: Text[] = [...(body.steps ?? []), ...(body.tip ? [body.tip] : []), ...(body.why ? [body.why] : []), ...(body.table?.rows.flat() ?? []), ...(body.list?.flatMap(item => [item.term, item.def]) ?? [])];
  return parts.map(text => helpText(locale, text)).join(' ');
}
/** Hilfe-Suche: ohne Eingabe alle sichtbaren Themen; sonst dieselbe Mehrwort-Suche wie die Palette über Titel, Kurzfassung (alle Sprachen) und Artikeltext (aktuelle Sprache). */
export function searchHelp(query: string, rights: Rights, locale: Locale): HelpTopic[] {
  const visible = HELP_TOPICS.filter(topic => helpVisible(topic, rights));
  if (!query.trim()) return visible;
  const entries = visible.map(topic => ({ id: topic.id, kind: 'help' as const, title: helpText(locale, topic.title), subtitle: helpText(locale, topic.summary), keywords: `${all(topic.title)} ${all(topic.summary)} ${helpBodyText(topic.id, locale)}` }));
  const byId = new Map(visible.map(topic => [topic.id, topic]));
  return searchPalette(entries, query, 40).map(hit => byId.get(hit.id)!);
}
