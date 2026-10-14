import { describe, expect, it } from 'vitest';
import type { ProjectInsight } from '../src/shared/project-insight-types';
import { forecastProject } from '../src/shared/project-forecast';

const insight = (overrides: Partial<ProjectInsight> = {}, project: Partial<ProjectInsight['project']> = {}): ProjectInsight => ({
  project: { id: 'p', workspace_id: 'w', code: 'P', name: 'Project', client: '', color: '#641dff', created_at: '', status: 'active', budget_minutes: 3000, due_date: '2026-11-15', progress_percent: 40, progress_updated_at: '2026-10-12T12:00:00Z', ...project },
  as_of: '2026-10-14', progress_date: '2026-10-12', total_minutes: 1200, first_work_date: '2026-09-01', last_work_date: '2026-10-14',
  recent_daily: [{ work_date: '2026-10-01', minutes: 300 }, { work_date: '2026-10-07', minutes: 300 }, { work_date: '2026-10-14', minutes: 240 }],
  tasks: { total: 4, done: 1, overdue: 1, doing:1, estimated:4, estimated_minutes:3000, done_estimated_minutes:1200 }, ...overrides,
});

describe('project effort scenario', () => {
  it('uses all-time effort and automatic weighted progress, and counts calendar days for recent pace', () => {
    expect(forecastProject(insight())).toMatchObject({ usedMinutes: 1200, projectedTotalMinutes: 3000, remainingMinutes: 1800, budgetRemainingMinutes: 1800, observationDays: 28, loggedDays: 3, paceMinutesPerDay: 30, predictedFinishDate: '2026-12-13', deadlineStatus: 'late', budgetStatus: 'within', blockers: [] });
  });
  it('uses inclusive observation days for a younger project and rounds finish days up across months', () => {
    expect(forecastProject(insight({ first_work_date: '2026-10-08', recent_daily: [{work_date:'2026-10-08',minutes:100},{work_date:'2026-10-10',minutes:100},{work_date:'2026-10-14',minutes:100}] }))).toMatchObject({ observationDays: 7, loggedDays: 3, paceMinutesPerDay: 300 / 7, predictedFinishDate: '2026-11-25' });
  });
  it.each([null, undefined, 0, 100])('ignores legacy manual progress (%s) and uses current task data', progress_percent => {
    expect(forecastProject(insight({progress_date:null}, {progress_percent}))).toMatchObject({progressPercent:40,predictedFinishDate:'2026-12-13',progress:{method:'estimated-effort'}});
  });
  it('all tracked tasks complete does not invent a historical delivery date or deadline success', () => {
    expect(forecastProject(insight({tasks:{total:4,done:4,doing:0,overdue:0,estimated:4,estimated_minutes:3000,done_estimated_minutes:3000}}))).toMatchObject({ progressState: 'complete', projectedTotalMinutes: 1200, remainingMinutes: 0, predictedFinishDate: null, deadlineStatus: 'complete', budgetStatus: 'within' });
  });
  it('recalculates without a manual report timestamp and exposes unweighted data gaps',()=>{
    expect(forecastProject(insight({progress_date:'2020-01-01',tasks:{total:10,done:4,overdue:0}}))).toMatchObject({progressPercent:40,progressState:'current',predictedFinishDate:'2026-12-13',progress:{method:'task-count',missingEstimates:10}});
  });
  it('does not infer completion from spent hours or a manual report when there is no task scope',()=>{
    expect(forecastProject(insight({tasks:{total:0,done:0,overdue:0}}, {progress_percent:75}))).toMatchObject({progressPercent:null,projectedTotalMinutes:null,predictedFinishDate:null,blockers:['missing-progress']});
  });
  it('does not assume in-progress tasks are half done',()=>{
    expect(forecastProject(insight({tasks:{total:4,done:0,doing:4,overdue:0}}))).toMatchObject({progressPercent:0,projectedTotalMinutes:null,predictedFinishDate:null,blockers:['zero-progress']});
  });
  it.each(['paused', 'archived'] as const)('never reassures for a %s project', status => {
    expect(forecastProject(insight({}, {status, due_date:'2027-01-01'}))).toMatchObject({ predictedFinishDate:null, deadlineStatus:'unknown', budgetStatus:'unknown' });
  });
  it('does not forecast an unstarted project even when progress is reported', () => {
    expect(forecastProject(insight({total_minutes:0,first_work_date:null,last_work_date:null,recent_daily:[]}))).toMatchObject({ projectedTotalMinutes:null, predictedFinishDate:null, paceMinutesPerDay:null });
  });
  it('requires both seven observed days and three distinct positive logged dates', () => {
    const daily = [{work_date:'2026-10-09',minutes:300},{work_date:'2026-10-10',minutes:300},{work_date:'2026-10-14',minutes:240}];
    expect(forecastProject(insight({ first_work_date:'2026-10-09',recent_daily:daily })).predictedFinishDate).toBeNull();
    expect(forecastProject(insight({recent_daily:[daily[0]!,daily[0]!,daily[1]!]}))).toMatchObject({loggedDays:2,predictedFinishDate:null});
    expect(forecastProject(insight({recent_daily:[]}))).toMatchObject({paceMinutesPerDay:0,predictedFinishDate:null,budgetStatus:'unknown'});
  });
  it('excludes future, out-of-window, before-first-work, impossible and nonpositive daily values', () => {
    const base = insight();
    const result = forecastProject(insight({recent_daily:[...base.recent_daily,{work_date:'2026-10-15',minutes:50000},{work_date:'2026-09-16',minutes:50000},{work_date:'2026-02-30',minutes:50000},{work_date:'2026-10-02',minutes:-50000},{work_date:'2026-10-03',minutes:0}]}));
    expect(result).toMatchObject({loggedDays:3,paceMinutesPerDay:30,predictedFinishDate:'2026-12-13'});
    expect(forecastProject(insight({ first_work_date:'2026-10-08' }))).toMatchObject({ loggedDays:1,paceMinutesPerDay:240 / 7,predictedFinishDate:null });
  });
  it('keeps missing budget and deadline unknown, while reporting actual overspend and overdue dates', () => {
    expect(forecastProject(insight({}, {budget_minutes:0,due_date:null}))).toMatchObject({budgetMinutes:null,budgetRemainingMinutes:null,budgetStatus:'none',deadlineStatus:'none'});
    expect(forecastProject(insight({}, {budget_minutes:1000,due_date:'2026-10-13',progress_percent:null}))).toMatchObject({budgetRemainingMinutes:-200,budgetStatus:'over',deadlineStatus:'overdue'});
  });
  it('treats today as a deadline still ahead and only gives a within-date scenario with enough valid inputs', () => {
    expect(forecastProject(insight({}, {due_date:'2026-10-14'})).deadlineStatus).toBe('late');
    expect(forecastProject(insight({}, {due_date:'2026-12-13'})).deadlineStatus).toBe('within');
  });
  it.each(['2026-02-30','infinity','1900-01-01','2026-10-15'])('safely rejects invalid or future first work dates (%s)', first_work_date => {
    expect(forecastProject(insight({first_work_date}))).toMatchObject({observationDays:0,predictedFinishDate:null});
  });
  it.each(['2026-02-30','infinity','1900-01-01'])('does not crash or reassure on invalid as-of/deadline dates (%s)', date => {
    expect(forecastProject(insight({as_of:date}))).toMatchObject({predictedFinishDate:null,deadlineStatus:'unknown'});
    expect(forecastProject(insight({}, {due_date:date})).deadlineStatus).toBe('unknown');
  });
  it.each([-1, 5, NaN, Infinity])('rejects inconsistent completed task counts (%s)', done => {
    expect(forecastProject(insight({tasks:{total:4,done,overdue:0}}))).toMatchObject({projectedTotalMinutes:null,predictedFinishDate:null,deadlineStatus:'unknown'});
  });
  it('does not return infinite or out-of-range scenario dates', () => {
    const result = forecastProject(insight({tasks:{total:1000000000,done:1,overdue:0}}));
    expect(result.predictedFinishDate).toBeNull();expect(result.blockers).toContain('out-of-range');
  });
});
