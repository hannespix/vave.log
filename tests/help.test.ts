import { describe, it, expect } from 'vitest';
import { AREA_TOPIC, HELP_CATEGORIES, HELP_CHIPS, HELP_TOPICS, helpVisible } from '../src/web/help/catalog';
import { HELP_BODIES } from '../src/web/help/articles';
import { helpBodyText, searchHelp } from '../src/web/help/search';

const ids = (list: { id: string }[]) => list.map(item => item.id);

describe('help catalog', () => {
  it('has a body for every topic, no orphan bodies and no duplicate ids', () => {
    const topicIds = ids(HELP_TOPICS);
    expect(new Set(topicIds).size).toBe(topicIds.length);
    for (const id of topicIds) expect(HELP_BODIES[id], id).toBeDefined();
    for (const id of Object.keys(HELP_BODIES)) expect(topicIds).toContain(id);
  });
  it('only links to existing topics and categories', () => {
    const topicIds = new Set(ids(HELP_TOPICS)), categoryIds = new Set(ids(HELP_CATEGORIES));
    for (const topic of HELP_TOPICS) expect(categoryIds.has(topic.category), topic.id).toBe(true);
    for (const [id, body] of Object.entries(HELP_BODIES)) for (const related of body.related ?? []) { expect(topicIds.has(related), `${id} → ${related}`).toBe(true); expect(related).not.toBe(id); }
    for (const id of [...HELP_CHIPS, ...Object.values(AREA_TOPIC)]) expect(topicIds.has(id), id).toBe(true);
  });
  it('keeps every text in three languages and every table rectangular', () => {
    const check = (text: readonly string[]) => { expect(text).toHaveLength(3); for (const part of text) expect(part.trim().length).toBeGreaterThan(0); };
    for (const topic of HELP_TOPICS) { check(topic.title); check(topic.summary); }
    for (const category of HELP_CATEGORIES) { check(category.title); check(category.intro); }
    for (const body of Object.values(HELP_BODIES)) {
      for (const step of body.steps ?? []) check(step);
      if (body.tip) check(body.tip);
      if (body.why) check(body.why);
      for (const item of body.list ?? []) { check(item.term); check(item.def); }
      if (body.table) { for (const cell of body.table.head) check(cell); for (const row of body.table.rows) { expect(row).toHaveLength(body.table.head.length); for (const cell of row) check(cell); } }
    }
  });
  it('hides manager-only topics and categories from members', () => {
    expect(HELP_TOPICS.some(topic => topic.roles)).toBe(true);
    for (const topic of HELP_TOPICS) { expect(helpVisible(topic, 'owner')).toBe(true); expect(helpVisible(topic, 'manager')).toBe(true); }
    const member = HELP_TOPICS.filter(topic => helpVisible(topic, 'member'));
    expect(ids(member)).not.toContain('fin-invoice-time');
    expect(ids(member)).not.toContain('team-invite');
    expect(ids(member)).toContain('time-submit');
    expect(ids(member)).toContain('start-roles');
    expect(HELP_CATEGORIES.filter(category => helpVisible(category, 'member')).map(c => c.id)).toEqual(['start', 'time', 'work', 'reference']);
  });
  it('starts with the getting-started path and lists every area in the context map', () => {
    expect(HELP_TOPICS.slice(0, 5).every(topic => topic.category === 'start')).toBe(true);
    expect(Object.keys(AREA_TOPIC).sort()).toEqual(['absences', 'finance', 'help', 'overview', 'projects', 'reports', 'settings', 'tasks', 'team', 'time']);
  });
});

describe('searchHelp', () => {
  it('returns all visible topics without a query and ranks title matches first', () => {
    expect(searchHelp('', 'member', 'de')).toHaveLength(HELP_TOPICS.filter(topic => helpVisible(topic, 'member')).length);
    expect(searchHelp('rechnung stornieren', 'owner', 'de')[0].id).toBe('fin-cancel');
    expect(searchHelp('cancel invoice', 'owner', 'en')[0].id).toBe('fin-cancel');
  });
  it('finds article text, not only titles, and is accent-tolerant across languages', () => {
    expect(ids(searchHelp('1.440 minuten', 'member', 'de'))).toContain('time-manual');
    expect(ids(searchHelp('1,440', 'member', 'en'))).toContain('time-manual');
    expect(ids(searchHelp('gobd', 'owner', 'zh'))).toContain('fin-cancel');
    expect(ids(searchHelp('zeiten einreichen', 'member', 'en'))).toContain('time-submit');
  });
  it('never surfaces manager-only topics to members', () => {
    for (const query of ['rechnung', 'einladen', 'datev']) for (const hit of searchHelp(query, 'member', 'de')) expect(hit.roles).toBeUndefined();
    expect(ids(searchHelp('datev', 'manager', 'de'))).toContain('fin-export');
  });
  it('flattens tables and lists into searchable text', () => {
    expect(helpBodyText('ref-shortcuts', 'de')).toContain('Strg+K');
    expect(helpBodyText('ref-glossary', 'en')).toContain('EXTF');
    expect(helpBodyText('does-not-exist', 'de')).toBe('');
  });
});
