import { describe,it,expect } from 'vitest';
import { projectSchema,entrySchema,dateRangeSchema,workspaceSchema,taskSchema } from '../src/shared/validation.js';
const id='11111111-1111-4111-8111-111111111111';
const entry={workspace_id:id,project_id:id,work_date:'2026-10-13',minutes:60,note:'Konzept',billable:true};
describe('untrusted input validation',()=>{
 it('rejects identity and status injection',()=>{expect(entrySchema.safeParse({...entry,user_id:id,status:'approved'}).success).toBe(false)});
 it('accepts valid minutes but rejects fractional, zero and overlong work',()=>{expect(entrySchema.parse(entry).minutes).toBe(60);for(const minutes of [0,-1,1.2,1441,NaN])expect(entrySchema.safeParse({...entry,minutes}).success).toBe(false)});
 it('rejects impossible dates and reversed or unbounded reports',()=>{for(const work_date of ['2026-02-30','2026-13-01','13.10.2026'])expect(entrySchema.safeParse({...entry,work_date}).success).toBe(false);for(const x of [{from:'2026-10-13',to:'2026-10-12'},{from:'2020-01-01',to:'2026-10-13'}])expect(dateRangeSchema.safeParse(x).success).toBe(false)});
 it('rejects task titles beyond database limit',()=>{expect(taskSchema.safeParse({workspace_id:id,project_id:id,title:'x'.repeat(241),status:'todo',assignee_id:null,due_date:null}).success).toBe(false)});
 it('accepts leap day and a 366-day range',()=>{expect(entrySchema.safeParse({...entry,work_date:'2024-02-29'}).success).toBe(true);expect(dateRangeSchema.safeParse({from:'2024-01-01',to:'2024-12-31'}).success).toBe(true)});
 it('restricts text, color, timezone and task status',()=>{expect(workspaceSchema.safeParse({name:'VAVE',timezone:'Mars/Olympus',currency:'EUR'}).success).toBe(false);expect(projectSchema.safeParse({workspace_id:id,code:'A',name:'Name',client:'Client',budget_minutes:0,status:'active',color:'url(evil)'}).success).toBe(false);expect(taskSchema.safeParse({workspace_id:id,project_id:id,title:'x',status:'approved',assignee_id:null,due_date:null}).success).toBe(false)});
});

const project={workspace_id:id,code:'A',name:'Name',client:'',budget_minutes:0,status:'active',color:'#641dff'};
describe('project planning input',()=>{
 it('allows omitted, nullable and bounded planning values',()=>{
  expect(projectSchema.parse(project)).not.toHaveProperty('progress_percent');
  for(const progress_percent of [null,0,35.5,100])expect(projectSchema.safeParse({...project,due_date:'2024-02-29',progress_percent}).success).toBe(true);
  expect(projectSchema.safeParse({...project,due_date:null}).success).toBe(true);
 });
 it('rejects invalid planning dates, percentages and server timestamp injection',()=>{
  for(const progress_percent of [-1,100.1,NaN,Infinity])expect(projectSchema.safeParse({...project,progress_percent}).success).toBe(false);
  for(const due_date of ['2026-02-30','1999-12-31','2101-01-01'])expect(projectSchema.safeParse({...project,due_date}).success).toBe(false);
  expect(projectSchema.safeParse({...project,progress_updated_at:'2026-10-14T00:00:00Z'}).success).toBe(false);
 });
});
