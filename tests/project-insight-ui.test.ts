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
  expect(html).toContain('All recorded team time'); expect(html).toContain('Add progress'); expect(html).toContain('No deadline');
  for (const label of ['Tasks','Time','Reports','Planning','Invoices','Edit planning','How this is calculated']) expect(html).toContain(label);
  expect(html).toContain('Task counts are unweighted'); expect(html).not.toContain('Within deadline'); expect(html).not.toContain('90%');
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
  const html=render('en',{...insight,project:{...insight.project,progress_percent:100,due_date:'2026-10-10'},progress_date:'2026-10-14'});
  expect(html).toContain('Complete as reported'); expect(html).toContain('No completion date is recorded'); expect(html).not.toContain('Within deadline');
 });
});
