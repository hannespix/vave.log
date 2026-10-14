import {describe,expect,it} from 'vitest';
import {calculateProjectProgress,taskProgressStats} from '../src/shared/project-progress';
const stats={total:4,done:1,overdue:0,doing:1,estimated:4,estimated_minutes:1000,done_estimated_minutes:400,missing_estimates:0,missing_due_dates:2,unassigned:1};
describe('automatic project progress',()=>{
 it('weights completed deliverables by estimated effort when the scope is fully estimated',()=>{
  expect(calculateProjectProgress(stats)).toMatchObject({percent:40,method:'estimated-effort',total:4,done:1,doing:1,missingEstimates:0,missingDueDates:2,unassigned:1});
 });
 it('recalculates immediately when tasks complete, reopen or change scope',()=>{
  expect(calculateProjectProgress({...stats,done:2,done_estimated_minutes:700}).percent).toBe(70);
  expect(calculateProjectProgress({...stats,done:0,done_estimated_minutes:0}).percent).toBe(0);
  expect(calculateProjectProgress({...stats,total:5,estimated:5,estimated_minutes:2000}).percent).toBe(20);
 });
 it('uses explicitly unweighted completion when any estimate is missing; in-progress earns no guessed percent',()=>{
  expect(calculateProjectProgress({...stats,estimated:3,missing_estimates:1})).toMatchObject({percent:25,method:'task-count',missingEstimates:1});
  expect(calculateProjectProgress({total:4,done:1,overdue:0})).toMatchObject({percent:25,method:'task-count',missingEstimates:4});
 });
 it('keeps unknown scope unknown, and complete means only all tracked tasks',()=>{
  expect(calculateProjectProgress({total:0,done:0,overdue:0})).toMatchObject({percent:null,method:'none'});
  expect(calculateProjectProgress({...stats,done:4,doing:0,done_estimated_minutes:1000}).percent).toBe(100);
 });
 it.each([{total:-1},{done:5},{done:NaN},{total:Infinity},{doing:4}])('fails closed on inconsistent task counts %o',patch=>{
  expect(calculateProjectProgress({...stats,...patch})).toMatchObject({percent:null,method:'none'});
 });
 it('falls back to counts instead of trusting invalid estimate aggregates',()=>{
  for(const patch of [{estimated_minutes:0},{estimated_minutes:Infinity},{done_estimated_minutes:1001},{done_estimated_minutes:-1}])expect(calculateProjectProgress({...stats,...patch})).toMatchObject({percent:25,method:'task-count'});
 });
 it('builds the same full-scope summary used by project cards and the RPC',()=>{
  const tasks=[{status:'done' as const,estimated_minutes:120,due_date:null,assignee_id:'a',is_milestone:true},{status:'doing' as const,estimated_minutes:180,due_date:'2026-10-13',assignee_id:null},{status:'todo' as const,estimated_minutes:null,due_date:'2026-10-20',assignee_id:'b'}];
  expect(taskProgressStats(tasks,'2026-10-14')).toEqual({total:3,done:1,doing:1,overdue:1,estimated:2,estimated_minutes:300,done_estimated_minutes:120,missing_estimates:1,missing_due_dates:1,unassigned:1});
  expect(calculateProjectProgress(taskProgressStats(tasks)).percent).toBeCloseTo(100/3);
 });
});
