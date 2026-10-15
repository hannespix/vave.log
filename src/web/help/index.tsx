import { useState } from 'react';
import { ArrowUpRight, BookOpen, ChevronLeft, ChevronRight, Lightbulb, Search, Sparkles } from 'lucide-react';
import type { Role } from '../../shared/types';
import { useI18n } from '../i18n';
import { Empty } from '../components';
import type { WorkflowTarget } from '../workflow-navigation';
import { HELP_CATEGORIES, HELP_CHIPS, HELP_TOPICS, helpText, helpVisible, type HelpTopic, type Text } from './catalog';
import { HELP_BODIES } from './articles';
import { searchHelp } from './search';
import './help.css';

// Hilfe im Produkt (Slack-/Linear-Muster): ein Einstieg mit Suche und den
// meistgesuchten Themen, ein nummerierter Erste-Schritte-Pfad, dann Kategorien
// mit je einem Thema pro Artikel. Rollen filtern, was gezeigt wird.
export interface HelpAreaProps { role: Role; topic: string; onTopic: (id: string) => void; onNavigate: (target: WorkflowTarget) => void }

export function HelpArea({ role, topic, onTopic, onNavigate }: HelpAreaProps) {
  const { t, locale } = useI18n();
  const x = (text: Text) => helpText(locale, text);
  const visible = HELP_TOPICS.filter(item => helpVisible(item, role));
  const current = visible.find(item => item.id === topic);
  if (topic && !current) return <section className="panel"><Empty title={t('Dieses Thema gibt es nicht – oder nicht für deine Rolle.')} text={t('Nutze die Suche oder die Übersicht, um das passende Thema zu finden.')} action={<button className="button secondary" onClick={() => onTopic('')}>{t('Zur Hilfe-Übersicht')}</button>}/></section>;
  if (current) return <HelpArticle topic={current} visible={visible} x={x} onTopic={onTopic} onNavigate={onNavigate}/>;
  return <HelpHome role={role} visible={visible} x={x} onTopic={onTopic}/>;
}

function HelpHome({ role, visible, x, onTopic }: { role: Role; visible: HelpTopic[]; x: (text: Text) => string; onTopic: (id: string) => void }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const results = searching ? searchHelp(query, role, locale) : [];
  const categoryOf = (item: HelpTopic) => HELP_CATEGORIES.find(category => category.id === item.category)!;
  const chips = HELP_CHIPS.map(id => visible.find(item => item.id === id)).filter((item): item is HelpTopic => Boolean(item));
  return <div className="help-area">
    <section className="help-hero">
      <BookOpen size={44} aria-hidden="true"/>
      <div>
        <p className="eyebrow">{t('Hilfe').toUpperCase()}</p>
        <h2>{t('Wonach suchst du?')}</h2>
        <label className="help-search"><Search size={16} aria-hidden="true"/><span className="sr-only">{t('Hilfe durchsuchen')}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Zum Beispiel „Zeiten einreichen“ oder „Rechnung stornieren“ …')}/></label>
        <div className="help-chips"><span>{t('Beliebte Themen')}:</span>{chips.map(item => <button key={item.id} type="button" className="help-chip" onClick={() => onTopic(item.id)}>{x(item.title)}</button>)}</div>
      </div>
    </section>
    {searching ? <section className="panel">{results.length === 0
      ? <Empty title={t('Keine Treffer.')} text={t('Versuche ein anderes Wort – die Suche findet Titel, Kurzfassung und Artikeltext.')}/>
      : <ul className="help-results">{results.map(item => <li key={item.id}><button type="button" className="help-result" onClick={() => onTopic(item.id)}><em>{x(categoryOf(item).title)}</em><strong>{x(item.title)}</strong><small>{x(item.summary)}</small></button></li>)}</ul>}</section>
    : <>
      <section className="panel help-start">
        <p className="eyebrow">{x(HELP_CATEGORIES[0].title).toUpperCase()}</p>
        <h2>{t('In fünf Schritten drin.')}</h2>
        <ol>{visible.filter(item => item.category === 'start').map(item => <li key={item.id}><button type="button" className="help-step" onClick={() => onTopic(item.id)}><strong>{x(item.title)}</strong><small>{x(item.summary)}</small></button></li>)}</ol>
      </section>
      <div className="help-grid">{HELP_CATEGORIES.filter(category => category.id !== 'start' && helpVisible(category, role)).map(category => <section key={category.id} className="panel help-category">
        <h3>{x(category.title)}</h3>
        <p>{x(category.intro)}</p>
        <ul className="help-topics">{visible.filter(item => item.category === category.id).map(item => <li key={item.id}><button type="button" className="help-topic" onClick={() => onTopic(item.id)}>{x(item.title)}<ChevronRight size={14} aria-hidden="true"/></button></li>)}</ul>
      </section>)}</div>
    </>}
  </div>;
}

function HelpArticle({ topic, visible, x, onTopic, onNavigate }: { topic: HelpTopic; visible: HelpTopic[]; x: (text: Text) => string; onTopic: (id: string) => void; onNavigate: (target: WorkflowTarget) => void }) {
  const { t } = useI18n();
  const body = HELP_BODIES[topic.id] ?? {};
  const category = HELP_CATEGORIES.find(item => item.id === topic.category)!;
  const siblings = visible.filter(item => item.category === topic.category);
  const index = siblings.findIndex(item => item.id === topic.id);
  const previous = siblings[index - 1], next = siblings[index + 1];
  const related = (body.related ?? []).map(id => visible.find(item => item.id === id)).filter((item): item is HelpTopic => Boolean(item));
  const keys = (cell: string) => cell.split(' / ').map((part, i) => <span key={i}>{i > 0 && ' / '}<kbd>{part}</kbd></span>);
  return <article className="panel help-article">
    <nav className="help-crumbs" aria-label={t('Hilfe')}><button type="button" className="text-button" onClick={() => onTopic('')}>{t('Hilfe')}</button><ChevronRight size={12} aria-hidden="true"/><span>{x(category.title)}</span></nav>
    <h2>{x(topic.title)}</h2>
    {topic.roles && <span className="help-role">{t('Nur für Inhaber:in und Leitung')}</span>}
    <p className="help-lead">{x(topic.summary)}</p>
    {body.steps && <ol className="help-steps">{body.steps.map((step, i) => <li key={i}>{x(step)}</li>)}</ol>}
    {body.tip && <aside className="help-callout"><Lightbulb size={16} aria-hidden="true"/><div><strong>{t('Gut zu wissen')}</strong><p>{x(body.tip)}</p></div></aside>}
    {body.why && <aside className="help-callout help-why"><Sparkles size={16} aria-hidden="true"/><div><strong>{t('Darum')}</strong><p>{x(body.why)}</p></div></aside>}
    {body.table && <div className="table-scroll help-table"><table><thead><tr>{body.table.head.map((cell, i) => <th key={i}>{x(cell)}</th>)}</tr></thead><tbody>{body.table.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{topic.id === 'ref-shortcuts' && c === 0 ? keys(x(cell)) : x(cell)}</td>)}</tr>)}</tbody></table></div>}
    {body.list && <dl className="help-list">{body.list.map((item, i) => <div key={i}><dt>{x(item.term)}</dt><dd>{x(item.def)}</dd></div>)}</dl>}
    {related.length > 0 && <div className="help-related"><p className="eyebrow">{t('Verwandte Themen').toUpperCase()}</p><div className="help-chips">{related.map(item => <button key={item.id} type="button" className="help-chip" onClick={() => onTopic(item.id)}>{x(item.title)}</button>)}</div></div>}
    <footer className="help-footer">
      <div>{previous && <button type="button" className="button secondary small" onClick={() => onTopic(previous.id)}><ChevronLeft size={14}/> {x(previous.title)}</button>}{next && <button type="button" className="button secondary small" onClick={() => onTopic(next.id)}>{x(next.title)} <ChevronRight size={14}/></button>}</div>
      {topic.area && topic.area !== 'help' && <button type="button" className="button primary small" onClick={() => onNavigate({ view: topic.area!, projectId: '' })}>{t('Zum Bereich')} <ArrowUpRight size={14}/></button>}
    </footer>
  </article>;
}
