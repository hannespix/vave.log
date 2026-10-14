import {test,expect,type Page} from '@playwright/test';
import type {WorkspaceAdminSummary} from '../../src/shared/workspace-admin-types';

test.use({locale:'en-US'});
const user='11111111-1111-4111-8111-111111111111',ws='22222222-2222-4222-8222-222222222222',other='44444444-4444-4444-8444-444444444444',archived='55555555-5555-4555-8555-555555555555';
async function setup(page:Page,{role='owner',archivedOnly=false,running=0,twoActive=false}:{role?:'owner'|'manager'|'member';archivedOnly?:boolean;running?:number;twoActive?:boolean}={}){
 await page.clock.install({time:new Date('2026-10-14T09:00:00Z')});
 await page.route('**/api/config',r=>r.fulfill({json:{configured:true,appUrl:'http://localhost:4173',supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'}}));
 await page.addInitScript(({user})=>{
  const payload=btoa(JSON.stringify({sub:user,aud:'authenticated',role:'authenticated',exp:2100000000,iss:'https://test.supabase.co/auth/v1'}));
  localStorage.setItem('sb-test-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.test`,refresh_token:'test-refresh-token',token_type:'bearer',expires_at:2100000000,expires_in:3600,user:{id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner',locale:'en'},created_at:'2026-10-01T10:00:00Z'}}));
 },{user});
 const summary=(id:string,name:string,is_demo=false,archived_at:string|null=null):WorkspaceAdminSummary=>({id,name,is_demo,archived_at,created_at:'2026-10-01T10:00:00Z',counts:{projects:2,tasks:8,time_entries:12,members:3,invoices:4,expenses:5},running_timers:running});
 const state={owned:role==='owner'?[...(!archivedOnly?[summary(ws,'North & Süd 工作室')]:[]),...(twoActive?[summary(other,'Second Studio')]:[]),summary(archived,'Archived demo',true,'2026-10-13T12:00:00Z')]:[],deleted:[] as Record<string,unknown>[],fail:false,pending:false,release:undefined as undefined|(()=>void),lists:0};
 const visible=()=>role==='owner'?state.owned.filter(w=>!w.archived_at):[summary(ws,'North & Süd 工作室')];
 await page.route('https://test.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());let data:unknown=[];
  if(url.pathname==='/auth/v1/user')data={id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner',locale:'en'},created_at:''};
  else if(url.pathname==='/rest/v1/rpc/accept_invitations')data=0;
  else if(url.pathname==='/rest/v1/workspaces')data=visible().map(w=>({...w,timezone:'Europe/Berlin',currency:'EUR',created_by:user}));
  else if(url.pathname==='/rest/v1/memberships')data=[{workspace_id:url.searchParams.get('workspace_id')?.slice(3)||ws,user_id:user,role,display_name:'Studio Owner',email:'owner@example.test',created_at:''}];
  else if(url.pathname==='/rest/v1/running_timers'||url.pathname==='/rest/v1/workspace_demos')data=null;
  else if(url.pathname==='/rest/v1/rpc/list_owned_workspaces'){state.lists++;data=state.owned;}
  else if(url.pathname==='/rest/v1/rpc/delete_workspace'){
   const body=req.postDataJSON();state.deleted.push(body);
   if(state.pending)await new Promise<void>(resolve=>{state.release=resolve;});
   if(state.fail)return route.fulfill({status:403,json:{code:'42501',message:'WORKSPACE_ADMIN_FORBIDDEN'}});
   state.owned=state.owned.filter(w=>w.id!==body.p_workspace_id);data=null;
  }
  await route.fulfill({json:data,headers:{'access-control-expose-headers':'content-range','content-range':Array.isArray(data)?`0-${Math.max(0,data.length-1)}/${data.length}`:'0-0/1'}});
 });
 return state;
}
const manager=(page:Page)=>page.getByRole('button',{name:'Manage studios & demos',exact:true});
const dialog=(page:Page)=>page.getByRole('dialog');
const remove=(page:Page)=>dialog(page).getByRole('button',{name:'Permanently delete',exact:true});
async function confirm(page:Page,name:string){await dialog(page).getByLabel('Type the exact workspace name').fill(name);await dialog(page).getByRole('checkbox').check();}

test('owners delete archived demos and the last active studio only after explicit exact-name confirmation',async({page},testInfo)=>{
 const state=await setup(page);await page.goto(`/#w=${ws}&view=settings`);await manager(page).click();
 await expect(dialog(page)).toHaveCount(1);await expect(dialog(page).getByText('Archived demo',{exact:true})).toBeVisible();await expect(dialog(page).getByText('Demo · Archived',{exact:true})).toBeVisible();
 await dialog(page).getByRole('button',{name:'Delete: Archived demo',exact:true}).click();await expect(remove(page)).toBeDisabled();
 await confirm(page,'archived demo');await expect(remove(page)).toBeDisabled();await confirm(page,'Archived demo ');await expect(remove(page)).toBeDisabled();
 await confirm(page,'Archived demo');await expect(remove(page)).toBeEnabled();await expect(dialog(page).getByText(/User accounts and other studios remain/)).toBeVisible();
 await dialog(page).evaluate(element=>{element.scrollTop=0;});const screenshot=testInfo.outputPath('owner-workspace-deletion-confirmation.png');await page.screenshot({path:screenshot,animations:'disabled'});await testInfo.attach('Owner deletion with consequences and exact-name confirmation',{path:screenshot,contentType:'image/png'});
 await remove(page).click();await expect(dialog(page).getByText('Workspace deleted permanently.',{exact:true})).toBeVisible();expect(state.deleted[0]).toEqual({p_workspace_id:archived,p_confirmation_name:'Archived demo',p_confirmed:true});
 await expect(page).toHaveURL(new RegExp(`w=${ws}`));await expect(dialog(page).getByRole('button',{name:'Delete: Archived demo',exact:true})).toHaveCount(0);
 await dialog(page).getByRole('button',{name:'Delete: North & Süd 工作室',exact:true}).click();await expect(dialog(page).getByLabel('Type the exact workspace name')).toHaveValue('');await expect(dialog(page).getByRole('checkbox')).not.toBeChecked();
 await confirm(page,'North & Süd 工作室');await remove(page).click();await expect(dialog(page).getByText('No studios or demos owned by you.',{exact:true})).toBeVisible();
 await dialog(page).getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.getByRole('button',{name:'Create workspace',exact:true})).toBeVisible();await expect(page).not.toHaveURL(/#w=/);await expect(manager(page)).toBeVisible();expect(state.deleted).toHaveLength(2);
});

test('current studio deletion clears its route and moves to the next accessible studio',async({page})=>{
 await setup(page,{twoActive:true});await page.goto(`/#w=${ws}&view=settings`);await manager(page).click();await dialog(page).getByRole('button',{name:'Delete: North & Süd 工作室',exact:true}).click();await confirm(page,'North & Süd 工作室');await remove(page).click();await dialog(page).getByRole('button',{name:'Close dialog',exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`w=${other}&view=overview`));await expect(page.getByLabel('Switch workspace')).toHaveAttribute('data-value',other);
 await page.evaluate(({ws})=>{history.pushState(null,'',`/#w=${ws}&view=finance`);window.dispatchEvent(new PopStateEvent('popstate'));},{ws});
 await expect(page.getByText('Workspace unavailable',{exact:true})).toBeVisible();await expect(page.getByLabel('Switch workspace')).toHaveCount(0);
});

test('archived-only owners can open management from onboarding and reopen with fresh data',async({page})=>{
 const state=await setup(page,{archivedOnly:true});await page.goto('/');await manager(page).click();await dialog(page).getByRole('button',{name:'Delete: Archived demo',exact:true}).click();await confirm(page,'Archived demo');await dialog(page).getByRole('button',{name:'Close dialog',exact:true}).click();
 const before=state.lists;await manager(page).click();await expect(dialog(page).getByText('Archived demo',{exact:true})).toBeVisible();expect(state.lists).toBeGreaterThan(before);
 await dialog(page).getByRole('button',{name:'Delete: Archived demo',exact:true}).click();await expect(dialog(page).getByRole('checkbox')).not.toBeChecked();await expect(dialog(page).getByLabel('Type the exact workspace name')).toHaveValue('');await confirm(page,'Archived demo');await remove(page).click();await expect(dialog(page).getByText('No studios or demos owned by you.',{exact:true})).toBeVisible();
});

test('failed deletion retains the studio and requires a new confirmation',async({page})=>{
 const state=await setup(page);state.fail=true;await page.goto(`/#w=${ws}&view=settings`);await manager(page).click();await dialog(page).getByRole('button',{name:'Delete: North & Süd 工作室',exact:true}).click();await confirm(page,'North & Süd 工作室');await remove(page).click();
 await expect(dialog(page).getByRole('alert')).toContainText('Only an owner');await expect(dialog(page).getByRole('checkbox')).not.toBeChecked();await expect(remove(page)).toBeDisabled();await dialog(page).getByRole('checkbox').check();await expect(remove(page)).toBeDisabled();expect(state.owned.some(w=>w.id===ws)).toBe(true);await expect(page).toHaveURL(new RegExp(`w=${ws}`));
 await dialog(page).getByRole('button',{name:'Back',exact:true}).first().click();await expect(dialog(page).getByRole('button',{name:'Delete: North & Süd 工作室',exact:true})).toBeVisible();
});

test('running timers and offline state block deletion without sending requests',async({page})=>{
 const state=await setup(page,{running:1});await page.goto(`/#w=${ws}&view=settings`);await manager(page).click();await dialog(page).getByRole('button',{name:'Delete: North & Süd 工作室',exact:true}).click();await confirm(page,'North & Süd 工作室');await expect(remove(page)).toBeDisabled();await expect(dialog(page).getByRole('alert')).toContainText('running timers');expect(state.deleted).toHaveLength(0);
 state.owned.forEach(w=>{w.running_timers=0;});await dialog(page).getByRole('button',{name:'Back',exact:true}).first().click();await dialog(page).getByRole('button',{name:'Delete: North & Süd 工作室',exact:true}).click();await confirm(page,'North & Süd 工作室');await expect(remove(page)).toBeEnabled();
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});await expect(remove(page)).toBeDisabled();await expect(dialog(page).getByRole('alert')).toContainText('offline');expect(state.deleted).toHaveLength(0);
});

test('deletion waits for server acknowledgement and blocks duplicate submission',async({page})=>{
 const state=await setup(page);state.pending=true;await page.goto(`/#w=${ws}&view=settings`);await manager(page).click();await dialog(page).getByRole('button',{name:'Delete: Archived demo',exact:true}).click();await confirm(page,'Archived demo');await remove(page).click();
 await expect(dialog(page).getByRole('button',{name:'Deleting…',exact:true})).toBeDisabled();await expect(dialog(page).getByRole('button',{name:'Close dialog',exact:true})).toBeDisabled();await expect(dialog(page).getByRole('heading',{name:'Archived demo',exact:true})).toBeVisible();expect(state.owned.some(w=>w.id===archived)).toBe(true);
 await expect.poll(()=>Boolean(state.release)).toBe(true);state.release!();await expect(dialog(page).getByText('Workspace deleted permanently.',{exact:true})).toBeVisible();expect(state.deleted).toHaveLength(1);
});

for(const role of ['manager','member'] as const)test(`${role} has no owner deletion actions`,async({page})=>{
 const state=await setup(page,{role});await page.goto(`/#w=${ws}&view=settings`);await expect(page.getByRole('heading',{name:'Everything in its place.',exact:true})).toBeVisible();await expect(manager(page)).toHaveCount(0);await expect(page.getByRole('button',{name:/Delete:/})).toHaveCount(0);expect(state.deleted).toHaveLength(0);
});
