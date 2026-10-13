import {test,expect,type Page} from '@playwright/test';
const user='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const project='33333333-3333-4333-8333-333333333333';
const config={configured:true,appUrl:'http://localhost:4173',supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'};
async function setup(page:Page,loggedIn=false){
 await page.clock.install({time:new Date('2026-10-13T09:00:00Z')});
 await page.route('**/api/config',r=>r.fulfill({json:config}));
 const entries:Record<string,unknown>[]=[];
 if(loggedIn)await page.addInitScript(({user})=>{
  const payload=btoa(JSON.stringify({sub:user,aud:'authenticated',role:'authenticated',exp:2100000000,iss:'https://test.supabase.co/auth/v1'}));
  localStorage.setItem('sb-test-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.test`,refresh_token:'test-refresh-token',token_type:'bearer',expires_at:2100000000,expires_in:3600,user:{id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner'},created_at:'2026-10-01T10:00:00Z'}}));
 },{user});
 await page.route('https://test.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());let data:unknown=[];
  if(url.pathname==='/rest/v1/rpc/accept_invitations')data=0;
  else if(url.pathname==='/rest/v1/workspaces')data=[{id:ws,name:'VAVE Studio',timezone:'Europe/Berlin',currency:'EUR',created_by:user,created_at:'2026-10-01T10:00:00Z'}];
  else if(url.pathname==='/rest/v1/memberships')data=[{workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:'2026-10-01T10:00:00Z'}];
  else if(url.pathname==='/rest/v1/projects')data=[{id:project,workspace_id:ws,code:'VAV-001',name:'Brand Experience',client:'VAVE',budget_minutes:600,status:'active',color:'#641dff',created_at:'2026-10-01T10:00:00Z'}];
  else if(url.pathname==='/rest/v1/running_timers')data=null;
  else if(url.pathname==='/rest/v1/time_entries'){
   if(req.method()==='POST'){const body=req.postDataJSON();const e={...body,user_id:user,status:'draft',timer_id:null,created_at:'2026-10-13T09:00:00Z'};entries.push(e);data=e}else data=entries;
  }
  await route.fulfill({json:data,headers:{'content-range':Array.isArray(data)?`0-${Math.max(0,data.length-1)}/${data.length}`:'0-0/1'}});
 });
 return entries;
}
test('missing backend is an honest setup state',async({page})=>{
 await page.route('**/api/config',r=>r.fulfill({json:{...config,configured:false}}));await page.goto('/');await expect(page.getByText(/einricht/i).first()).toBeVisible();await expect(page.getByRole('button',{name:'Zeit erfassen',exact:true})).toHaveCount(0);
});
test('sign-in is accessible and no workspace data is public',async({page})=>{await setup(page);await page.goto('/');await expect(page.getByLabel('E-Mail-Adresse',{exact:true})).toBeVisible();await expect(page.getByLabel('Passwort',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Anmelden',exact:true})).toBeVisible();await expect(page.getByText('Brand Experience',{exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)});
test('authenticated workspace books time and reloads persisted result',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const entries=await setup(page,true);await page.goto('/');await expect(page.getByRole('button',{name:'Zeit erfassen',exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'Zeit erfassen',exact:true}).first().click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await dialog.getByLabel('Stunden',{exact:true}).fill('1');await dialog.getByLabel('Minuten',{exact:true}).fill('15');await dialog.getByLabel('Beschreibung',{exact:true}).fill('Konzeptarbeit');await dialog.getByRole('button',{name:'Speichern',exact:true}).click();await expect(dialog).not.toBeVisible();expect(entries).toHaveLength(1);expect(entries[0]).toMatchObject({minutes:75,note:'Konzeptarbeit',workspace_id:ws,project_id:project});await page.reload();await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect(page.getByText('Konzeptarbeit',{exact:true}).first()).toBeVisible();expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('database refusal never appears as a successful save',async({page})=>{
 await setup(page,true);await page.goto('/');await page.getByRole('button',{name:'Zeit erfassen',exact:true}).first().click();await page.route('https://test.supabase.co/rest/v1/time_entries*',r=>r.request().method()==='POST'?r.fulfill({status:403,json:{code:'42501',message:'denied'}}):r.fallback());const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Speichern',exact:true}).click();await expect(dialog).toBeVisible();await expect(page.getByText(/Berechtigung/).first()).toBeVisible();await expect(page.getByText('Gespeichert.',{exact:true})).toHaveCount(0);
});
