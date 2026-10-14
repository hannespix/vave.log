import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/web/i18n';
import { ProjectInsightSummary } from '../src/web/project-insights';
import { insightText, projectInsightCopy, formatInsightHours, formatInsightDate } from '../src/web/project-insight-copy';
import type { ProjectInsight } from '../src/shared/project-insight-types';
import type { Locale } from '../src/shared/i18n';

const insight: ProjectInsight = {
 project:{id:'p',workspace_id:'w',code:'P',name:'User project',client:'',color:'#000000',created_at:'',status:'active',budget_minutes:3000,due_date:null,progress_percent:null,progress_updated_at:null},
 as_of:'2026-10-14',progress_date:null,total_minutes:1200,first_work_date:'2026-10-01',last_work_date:'2026-10-14',recent_daily:[],tasks:{total:10,done:9,overdue:1},
};
const render = (locale: Locale, data = insight) => renderToStaticMarkup(createElement(I18nProvider, {initialLocale:locale}, createElement(ProjectInsightSummary, {insight:data,onEdit:()=>{},onNavigate:()=>{}})));
describe('project insight presentation', () => {
 it.each(['en','de','zh'] as const)('covers every analysis message in %s', locale => {
  expect(Object.keys(projectInsightCopy[locale]).sort()).toEqual(Object.keys(projectInsightCopy.en).sort());
  for (const key of Object.keys(projectInsightCopy.en) as Array<keyof typeof projectInsightCopy.en>) expect(insightText(locale,key).trim()).not.toBe('');
 });
 it('falls back to English for an unavailable language', () => {expect(insightText('xx' as Locale,'title')).toBe('Project analysis');});
 it('shows full-history scope, explicit missing planning, and contextual links', () => {
  const html = render('en');
  expect(html).toContain('All recorded team time'); expect(html).toContain('Automatic progress'); expect(html).toContain('No deadline');
  for (const label of ['Tasks','Time','Reports','Planning','Invoices','Edit planning','How this is calculated']) expect(html).toContain(label);
  expect(html).toContain('Task counts are unweighted'); expect(html).not.toContain('Within deadline'); expect(html).toContain('90%');
 });
 it('weights completed effort only when every task has an estimate', () => {
  const html=render('en',{...insight,tasks:{total:2,done:1,doing:1,overdue:0,estimated:2,estimated_minutes:240,done_estimated_minutes:60,missing_estimates:0,missing_due_dates:1,unassigned:1}});
  expect(html).toContain('25%'); expect(html).toContain('Weighted by estimated effort'); expect(html).toContain('Missing data'); expect(html).toContain('Tasks without a due date: 1'); expect(html).not.toContain('Reported progress');
 });
 it('keeps no-task progress unknown and shows useful setup actions', () => {
  const html=render('en',{...insight,tasks:{total:0,done:0,overdue:0}});
  expect(html).toContain('No tasks yet'); expect(html).not.toContain('aria-valuenow='); expect(html).toContain('Add tasks');
 });
 it('shows milestones as tasks without creating a second progress total', () => {
  const html=render('en',{...insight,milestones:{total:1,done:0,overdue:1,missing_due_dates:0,items:[{id:'m',title:'Design handoff',status:'doing',due_date:'2026-10-10'}]}});
  expect(html).toContain('Milestones'); expect(html).toContain('Design handoff'); expect(html).toContain('90%'); expect(html).toContain('Overdue');
 });
 it('shows forecast budget pressure in the visible budget KPI', () => {
  const html=render('en',{...insight,tasks:{total:4,done:1,overdue:0}});
  const budget=html.match(/<dt>Time budget<\/dt>([\s\S]*?)<\/div><\/div>/)?.[1];
  expect(budget).toContain('Scenario exceeds the time budget');
  expect(budget).toContain('Total effort scenario: 80 hr');
 });
 it('localizes the complete summary in German and Chinese', () => {
  expect(render('de')).toContain('Erfasste Teamzeit'); expect(render('de')).toContain('Planung bearbeiten');
  expect(render('zh')).toContain('已记录的团队工时'); expect(render('zh')).toContain('编辑计划');
  expect(render('zh')).not.toContain('No deadline');
 });
 it('formats hours and dates with the active locale, including a year', () => {
  expect(formatInsightHours(90,'en')).toContain('1.5'); expect(formatInsightHours(90,'de')).toContain('1,5'); expect(formatInsightHours(90,'zh')).toContain('小时');
  expect(formatInsightDate('2026-10-14','en')).toContain('2026'); expect(formatInsightDate('2026-02-30','en')).toBe('—');
 });
 it('explains completion without inventing its historical completion date', () => {
  const html=render('en',{...insight,project:{...insight.project,progress_percent:12,due_date:'2026-10-10'},tasks:{total:10,done:10,overdue:0}});
  expect(html).toContain('All tracked tasks complete'); expect(html).toContain('No completion date is recorded'); expect(html).not.toContain('Within deadline');
 });
});
