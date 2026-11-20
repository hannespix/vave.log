import {test,expect,type Page} from '@playwright/test';
import {pickOption} from './select';
import {goArea} from './nav';
test.use({locale:'en-US'});
// Künstliche Daten – zwei Firmen einer Gruppe, die angemeldete Person leitet beide.
const user='11111111-1111-4111-8111-111111111111';
const ffm='22222222-2222-4222-8222-222222222222',sha='22222222-2222-4222-8222-222222222223';
const expo='33333333-3333-4333-8333-333333333334',copy='33333333-3333-4333-8333-333333333399';
const handoverId='77777777-7777-4777-8777-777777777771';
const config={configured:true,appUrl:'http://localhost:4173',supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'};
interface State{linked:boolean;handovers:Record<string,any>[];calls:{fn:string;body:Record<string,unknown>}[];projects:Record<string,any>[]}
async function setup(page:Page,initial:Partial<State>={}):Promise<State>{
 const state:State={linked:false,handovers:[],calls:[],projects:[{id:expo,workspace_id:ffm,code:'EXP-002',name:'Expo Pavilion',client:'Nordlicht',budget_minutes:6000,status:'active',color:'#1f8a70',created_at:'2026-10-02T10:00:00Z',billable_default:true}],...initial};
 await page.clock.install({time:new Date('2026-10-13T09:00:00Z')});
 await page.route('**/api/config',r=>r.fulfill({json:config}));
 await page.addInitScript(({user})=>{
  const payload=btoa(JSON.stringify({sub:user,aud:'authenticated',role:'authenticated',exp:2100000000,iss:'https://test.supabase.co/auth/v1'}));
  localStorage.setItem('sb-test-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.test`,refresh_token:'test-refresh-token',token_type:'bearer',expires_at:2100000000,expires_in:3600,user:{id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner'},created_at:'2026-10-01T10:00:00Z'}}));
 },{user});
 const workspaces=[{id:ffm,name:'VAVE Frankfurt',timezone:'Europe/Berlin',currency:'EUR',created_by:user,created_at:'2026-10-01T10:00:00Z'},{id:sha,name:'VAVE Shanghai',timezone:'Asia/Shanghai',currency:'CNY',created_by:user,created_at:'2026-10-02T10:00:00Z'}];
 const sister=(id:string)=>workspaces.filter(w=>w.id!==id).map(w=>({workspace_id:w.id,name:w.name,currency:w.currency,timezone:w.timezone,can_accept:true,can_unlink:true}));
 const scope=(url:URL)=>(url.searchParams.get('workspace_id')??'').replace('eq.','');
 const list=(data:unknown[])=>({json:data,headers:{'access-control-expose-headers':'content-range','content-range':`0-${Math.max(0,data.length-1)}/${data.length}`}});
 await page.route('https://test.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;let data:unknown=[];
  const body=()=>req.postDataJSON() as Record<string,any>;
  if(path==='/auth/v1/user')data={id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner',locale:'en'},created_at:'2026-10-01T10:00:00Z'};
  else if(path==='/rest/v1/rpc/accept_invitations')data=0;
  else if(path==='/rest/v1/workspaces')data=workspaces;
  else if(path==='/rest/v1/memberships')data=[{workspace_id:scope(url)||ffm,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:''}];
  else if(path==='/rest/v1/projects')data=state.projects.filter(p=>p.workspace_id===(scope(url)||ffm));
  else if(path==='/rest/v1/running_timers'||path==='/rest/v1/workspace_demos')data=null;
  else if(path==='/rest/v1/rpc/sister_workspaces')data=state.linked?sister(body().p_workspace_id):[];
  else if(path==='/rest/v1/rpc/link_workspaces'){state.calls.push({fn:'link',body:body()});state.linked=true;data=null;}
  else if(path==='/rest/v1/rpc/unlink_workspaces'){state.calls.push({fn:'unlink',body:body()});state.linked=false;data=null;}
  else if(path==='/rest/v1/project_handovers')data=state.handovers;
  else if(path==='/rest/v1/rpc/offer_project_handover'){
   state.calls.push({fn:'offer',body:body()});
   const h={id:handoverId,source_workspace_id:ffm,source_project_id:expo,target_workspace_id:sha,target_project_id:null,status:'offered',note:body().p_note,offered_by:user,offered_at:'2026-10-13T09:00:00Z',decided_by:null,decided_at:null,
    summary:{code:'EXP-002',name:'Expo Pavilion',client:'Nordlicht',due_date:'2026-12-18',budget_minutes:6000,booked_minutes:1500,phases:2,open_tasks:5,plan_rows:3,planned_minutes:7200,source_name:'VAVE Frankfurt',target_name:'VAVE Shanghai',offered_by_name:'Studio Owner'}};
   state.handovers=[h];data=h;}
  else if(path==='/rest/v1/rpc/accept_project_handover'||path==='/rest/v1/rpc/decline_project_handover'||path==='/rest/v1/rpc/withdraw_project_handover'){
   const fn=path.split('/').pop()!.split('_')[0];state.calls.push({fn,body:body()});
   const h=state.handovers[0];h.status=fn==='accept'?'accepted':fn==='decline'?'declined':'withdrawn';h.decided_at='2026-10-13T09:05:00Z';
   if(fn==='accept'){h.target_project_id=copy;state.projects=[{...state.projects[0],status:'archived'},{...state.projects[0],id:copy,workspace_id:sha,budget_minutes:4500}];}
   data=h;}
  await route.fulfill(Array.isArray(data)?list(data):{json:data,headers:{'access-control-expose-headers':'content-range','content-range':'0-0/1'}});
 });
 return state;
}
const offered=(note=''):Record<string,any>=>({id:handoverId,source_workspace_id:ffm,source_project_id:expo,target_workspace_id:sha,target_project_id:null,status:'offered',note,offered_by:user,offered_at:'2026-10-13T09:00:00Z',decided_by:null,decided_at:null,
 summary:{code:'EXP-002',name:'Expo Pavilion',client:'Nordlicht',due_date:'2026-12-18',budget_minutes:6000,booked_minutes:1500,phases:2,open_tasks:5,plan_rows:3,planned_minutes:7200,source_name:'VAVE Frankfurt',target_name:'VAVE Shanghai',offered_by_name:'Studio Owner'}});

test('settings link two companies and remove the link after a second confirmation',async({page})=>{
 const state=await setup(page);
 await page.goto(`/#w=${ffm}`);await goArea(page,'Settings');
 const panel=page.locator('.company-group');
 await expect(panel.getByRole('heading',{name:'Sister companies.'})).toBeVisible();
 await expect(panel.getByRole('button',{name:'Link',exact:true})).toBeDisabled();
 await pickOption(panel.getByLabel('Link a company',{exact:true}),/^VAVE Shanghai/);
 await panel.getByRole('button',{name:'Link',exact:true}).click();
 await expect(panel.getByText('Companies linked.',{exact:true})).toBeVisible();
 expect(state.calls).toEqual([{fn:'link',body:{p_workspace_id:ffm,p_other_workspace_id:sha}}]);
 await expect(panel.locator('.group-list li')).toContainText('VAVE Shanghai');await expect(panel.locator('.group-list li')).toContainText('CNY');
 // Trennen braucht einen zweiten Klick.
 await panel.getByRole('button',{name:'Remove link to VAVE Shanghai',exact:true}).click();
 expect(state.calls).toHaveLength(1);
 await panel.getByRole('button',{name:'Yes, remove link',exact:true}).click();
 await expect(panel.getByText('Link removed.',{exact:true})).toBeVisible();
 expect(state.calls[1]).toEqual({fn:'unlink',body:{p_workspace_id:ffm,p_other_workspace_id:sha}});
 await expect(panel.locator('.group-list')).toHaveCount(0);
});

test('a project is offered to the sister company and can be withdrawn',async({page})=>{
 const state=await setup(page,{linked:true});
 await page.goto(`/#w=${ffm}&view=projects`);
 const card=page.locator('.project-card').filter({hasText:'Expo Pavilion'});
 await card.getByLabel(/Expo Pavilion$/).last().click();
 await card.getByRole('button',{name:'Hand over to sister company …',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Hand project over to a sister company'});
 await expect(dialog).toContainText('EXP-002 · Expo Pavilion');
 await expect(dialog).toContainText('logged time, invoices, offers, expenses and the financial plan.');
 await dialog.getByLabel(/^Note to the receiving company/).fill('Please take over from December.');
 await dialog.getByRole('button',{name:'Send offer'}).click();
 await expect(page.getByText('Offer sent.',{exact:true})).toBeVisible();
 expect(state.calls).toEqual([{fn:'offer',body:{p_project_id:expo,p_target_workspace_id:sha,p_note:'Please take over from December.'}}]);
 const panel=page.locator('.handover-panel');
 await expect(panel).toContainText('EXP-002 · Expo Pavilion');await expect(panel).toContainText('Offered to VAVE Shanghai');
 await panel.getByRole('button',{name:'Withdraw',exact:true}).click();
 await expect(page.getByText('Offer withdrawn.',{exact:true})).toBeVisible();
 expect(state.calls[1]).toEqual({fn:'withdraw',body:{p_handover_id:handoverId}});
 await expect(page.locator('.handover-panel')).toHaveCount(0);
});

test('the receiving company sees the offer with its key figures and takes the project over',async({page})=>{
 const state=await setup(page,{linked:true,handovers:[offered('Please take over from December.')]});
 await page.goto(`/#w=${sha}&view=projects`);
 const item=page.locator('.handover-incoming');
 await expect(item).toContainText('EXP-002 · Expo Pavilion');
 await expect(item).toContainText('VAVE Frankfurt offers this project');
 await expect(item).toContainText('Please take over from December.');
 await expect(item.locator('.handover-facts')).toContainText('75:00'); // Restbudget 100 h − 25 h
 await expect(item.locator('.handover-facts')).toContainText('120:00');
 await item.getByRole('button',{name:'Accept',exact:true}).click();
 await expect(page.getByText('Project taken over.',{exact:true})).toBeVisible();
 expect(state.calls).toEqual([{fn:'accept',body:{p_handover_id:handoverId}}]);
 await expect(page.locator('.handover-panel')).toHaveCount(0);
 await expect(page.locator('.project-card').filter({hasText:'Expo Pavilion'})).toBeVisible();
});

test('without a sister company there is no handover entry and no panel',async({page})=>{
 await setup(page);
 await page.goto(`/#w=${ffm}&view=projects`);
 const card=page.locator('.project-card').filter({hasText:'Expo Pavilion'});
 await card.getByLabel(/Expo Pavilion$/).last().click();
 await expect(card.getByRole('button',{name:'Reports'})).toBeVisible();
 await expect(card.getByRole('button',{name:'Hand over to sister company …'})).toHaveCount(0);
 await expect(page.locator('.handover-panel')).toHaveCount(0);
});

test('the company map shows both firms and hands a project over by dragging it onto the sister company',async({page})=>{
 const state=await setup(page,{linked:true});
 await page.goto(`/#w=${ffm}&view=projects`);
 const map=page.getByRole('group',{name:'Company map'});
 await expect(map.locator('.firm-own')).toContainText('VAVE Frankfurt');await expect(map.locator('.firm-own')).toContainText('1 active project');
 await expect(map.locator('.firm-sister')).toContainText('VAVE Shanghai');await expect(map.locator('.firm-sister')).toContainText('Drag a project here');
 const chip=map.getByRole('button',{name:/EXP-002\s*Expo Pavilion/});
 await chip.dragTo(map.locator('.firm-sister'));
 const dialog=page.getByRole('dialog',{name:'Hand project over to a sister company'});
 await expect(dialog).toContainText('EXP-002 · Expo Pavilion');
 await dialog.getByRole('button',{name:'Send offer'}).click();
 await expect(page.getByText('Offer sent.',{exact:true})).toBeVisible();
 expect(state.calls).toEqual([{fn:'offer',body:{p_project_id:expo,p_target_workspace_id:sha,p_note:''}}]);
 // Die Kante zwischen den Firmen zeigt das offene Angebot.
 await expect(map.locator('.react-flow__edge')).toContainText('1 offered');
 if(process.env.SHOTS)await page.screenshot({path:`${process.env.SHOTS}/${test.info().project.name}-firmenkarte.png`,fullPage:true});
 // Ein Klick auf das Projekt öffnet die Übergabe ebenfalls – für Tastatur und Touch.
 await chip.click();
 await expect(page.getByRole('dialog',{name:'Hand project over to a sister company'})).toContainText('There is already an open offer for this project.');
});
