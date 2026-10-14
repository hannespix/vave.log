import {test,expect,type Page} from '@playwright/test';
import {taskProgressStats} from '../../src/shared/project-progress';
import type {Task,Project} from '../../src/shared/types';

test.use({locale:'en-US'});
const user='11111111-1111-4111-8111-111111111111',ws='22222222-2222-4222-8222-222222222222',projectId='33333333-3333-4333-8333-333333333333';
async function setupProgress(page:Page){
 await page.clock.install({time:new Date('2026-10-14T09:00:00Z')});
 await page.route('**/api/config',r=>r.fulfill({json:{configured:true,appUrl:'http://localhost:4173',supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'}}));
 await page.addInitScript(({user})=>{
  const payload=btoa(JSON.stringify({sub:user,aud:'authenticated',role:'authenticated',exp:2100000000,iss:'https://test.supabase.co/auth/v1'}));
  localStorage.setItem('sb-test-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.test`,refresh_token:'test-refresh-token',token_type:'bearer',expires_at:2100000000,expires_in:3600,user:{id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner',locale:'en'},created_at:'2026-10-01T10:00:00Z'}}));
 },{user});
 const project:Project={id:projectId,workspace_id:ws,name:'Automatic Project',code:'AUTO',client:'Studio',status:'active',budget_minutes:6000,color:'#641dff',created_at:'',due_date:'2026-11-30',progress_percent:91};
 const tasks:Task[]=[
  {id:'10000000-0000-4000-8000-000000000001',workspace_id:ws,project_id:projectId,title:'Discovery complete',status:'done',assignee_id:user,due_date:'2026-10-10',created_by:user,created_at:'',estimated_minutes:60,is_milestone:false},
  {id:'10000000-0000-4000-8000-000000000002',workspace_id:ws,project_id:projectId,title:'Design handoff',status:'doing',assignee_id:null,due_date:null,created_by:user,created_at:'',estimated_minutes:null,is_milestone:false},
 ];
 const saved:Record<string,unknown>[]=[];let insightRequests=0;
 await page.route('https://test.supabase.co/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data:unknown=[];
  if(path==='/auth/v1/user')data={id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner',locale:'en'},created_at:''};
  else if(path==='/rest/v1/rpc/accept_invitations')data=0;
  else if(path==='/rest/v1/workspaces')data=[{id:ws,name:'Progress Studio',timezone:'Europe/Berlin',currency:'EUR',created_by:user,created_at:''}];
  else if(path==='/rest/v1/memberships')data=[{workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:''}];
  else if(path==='/rest/v1/projects')data=[project];
  else if(path==='/rest/v1/running_timers'||path==='/rest/v1/workspace_demos')data=null;
  else if(path==='/rest/v1/tasks'){
   if(req.method()==='POST'){const body=req.postDataJSON();saved.push(body);Object.assign(tasks.find(t=>t.id===body.id)!,body);data=tasks.find(t=>t.id===body.id);}else data=tasks;
  }
  else if(path==='/rest/v1/rpc/project_insight'){
   insightRequests++;const milestones=tasks.filter(t=>t.is_milestone);
   data={project,as_of:'2026-10-14',progress_date:null,total_minutes:1200,first_work_date:'2026-10-01',last_work_date:'2026-10-13',recent_daily:[{work_date:'2026-10-01',minutes:400},{work_date:'2026-10-07',minutes:400},{work_date:'2026-10-13',minutes:400}],tasks:taskProgressStats(tasks,'2026-10-14'),milestones:{total:milestones.length,done:milestones.filter(t=>t.status==='done').length,overdue:0,missing_due_dates:milestones.filter(t=>!t.due_date).length,items:milestones.map(({id,title,status,due_date})=>({id,title,status,due_date}))}};
  }
  await route.fulfill({json:data,headers:{'access-control-expose-headers':'content-range','content-range':Array.isArray(data)?`0-${Math.max(0,data.length-1)}/${data.length}`:'0-0/1'}});
 });
 return {tasks,saved,getInsightRequests:()=>insightRequests};
}

test('task estimates and milestones drive automatic card progress and scoped detail actions',async({page},testInfo)=>{
 const state=await setupProgress(page);await page.goto(`/#w=${ws}&view=projects`);
 const card=page.locator('.project-card');await expect(card.locator('.project-card-progress strong')).toHaveText('50%');await expect(card.getByText('Unweighted task count',{exact:true})).toBeVisible();
 await card.getByRole('button',{name:'Tasks: Automatic Project',exact:true}).click();await page.getByRole('button',{name:'Design handoff',exact:true}).click();
 let dialog=page.getByRole('dialog');await dialog.getByLabel('Estimated effort (hours)').fill('3');await dialog.getByLabel('Milestone',{exact:true}).check();await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).not.toBeVisible();
 expect(state.saved[0]).toMatchObject({estimated_minutes:180,is_milestone:true});
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Projects',exact:true}).click();await expect(card.locator('.project-card-progress strong')).toHaveText('25%');
 await card.getByRole('button',{name:'Project outlook: Automatic Project',exact:true}).click();dialog=page.getByRole('dialog');
 await expect(dialog.locator('.project-progress-number')).toHaveText('25%');await expect(dialog.getByText('Weighted by estimated effort',{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:/Design handoff/})).toBeVisible();
 const missing=dialog.locator('.project-insight-missing');await expect(missing).not.toHaveAttribute('open','');await missing.locator('summary').click();await expect(missing.getByRole('button',{name:'Tasks without a due date: 1'})).toBeVisible();
 await dialog.locator('.project-progress-hero').scrollIntoViewIfNeeded();
 const screenshot=testInfo.outputPath('automatic-progress-analysis.png');
 await page.screenshot({path:screenshot,fullPage:true,animations:'disabled'});
 await testInfo.attach('Automatic progress — weighted 25% with milestones',{path:screenshot,contentType:'image/png'});
 await missing.scrollIntoViewIfNeeded();
 const detailScreenshot=testInfo.outputPath('automatic-progress-missing-data.png');
 await page.screenshot({path:detailScreenshot,fullPage:true,animations:'disabled'});
 await testInfo.attach('Milestones and missing data actions',{path:detailScreenshot,contentType:'image/png'});
 await missing.getByRole('button',{name:'Tasks without a due date: 1'}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:'Design handoff',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Discovery complete',exact:true})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Status for Design handoff',exact:true}).selectOption('done');await expect(page.getByRole('combobox',{name:'Status for Design handoff',exact:true})).toBeEnabled();expect(state.saved.at(-1)).toMatchObject({status:'done',estimated_minutes:180,is_milestone:true});
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Projects',exact:true}).click();await expect(card.locator('.project-card-progress strong')).toHaveText('100%');await card.getByRole('button',{name:'Project outlook: Automatic Project',exact:true}).click();
 await expect(dialog.getByText('All tracked tasks complete',{exact:true})).toBeVisible();await expect(dialog.getByText('No completion date is recorded.').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 const requests=state.getInsightRequests();state.tasks[1].status='doing';await dialog.getByRole('button',{name:'Refresh analysis',exact:true}).click();await expect(dialog.locator('.project-progress-number')).toHaveText('25%');expect(state.getInsightRequests()).toBeGreaterThan(requests);
 const focusRequests=state.getInsightRequests();state.tasks[1].status='done';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(dialog.locator('.project-progress-number')).toHaveText('100%');expect(state.getInsightRequests()).toBeGreaterThan(focusRequests);
});
