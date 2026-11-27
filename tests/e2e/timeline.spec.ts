import {test,expect,type Page,type Locator} from '@playwright/test';
import {goArea} from './nav';
test.use({locale:'en-US'});
// Künstliche Daten – keine Kundendaten. Die Uhr steht auf Dienstag, 13.10.2026 (KW 42).
const user='11111111-1111-4111-8111-111111111111',ws='22222222-2222-4222-8222-222222222222';
const brand='33333333-3333-4333-8333-333333333333',expo='33333333-3333-4333-8333-333333333334';
const concept='55555555-5555-4555-8555-555555555551',schematic='55555555-5555-4555-8555-555555555552',loose='55555555-5555-4555-8555-555555555553';
const milestone='77777777-7777-4777-8777-777777777771';
const config={configured:true,appUrl:'http://localhost:4173',supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'};
interface Rec{phases:Record<string,any>[];deleted:string[];tasks:Record<string,any>[]}
async function setup(page:Page,role:'owner'|'member'='owner'):Promise<Rec>{
 const rec:Rec={phases:[],deleted:[],tasks:[]};
 await page.clock.install({time:new Date('2026-10-13T09:00:00Z')});
 await page.route('**/api/config',r=>r.fulfill({json:config}));
 await page.addInitScript(({user})=>{
  const payload=btoa(JSON.stringify({sub:user,aud:'authenticated',role:'authenticated',exp:2100000000,iss:'https://test.supabase.co/auth/v1'}));
  localStorage.setItem('sb-test-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.test`,refresh_token:'test-refresh-token',token_type:'bearer',expires_at:2100000000,expires_in:3600,user:{id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner'},created_at:'2026-10-01T10:00:00Z'}}));
  localStorage.setItem('vave-log.planning-mode','timeline');localStorage.setItem('vave-log.timeline-weeks','13');
 },{user});
 const projects=[{id:brand,workspace_id:ws,code:'VAV-001',name:'Brand Experience',client:'VAVE',budget_minutes:6000,status:'active',color:'#641dff',created_at:'2026-10-01T10:00:00Z',billable_default:true,due_date:'2026-12-04'},
  {id:expo,workspace_id:ws,code:'EXP-002',name:'Expo Pavilion',client:'Expo',budget_minutes:0,status:'active',color:'#1f8a70',created_at:'2026-10-02T10:00:00Z',billable_default:false,due_date:null}];
 const phases:Record<string,any>[]=[{id:concept,workspace_id:ws,project_id:brand,name:'Concept Design',position:1,starts_on:'2026-10-05',ends_on:'2026-10-25',budget_minutes:3000,created_at:''},
  {id:schematic,workspace_id:ws,project_id:brand,name:'Schematic Design',position:2,starts_on:'2026-10-26',ends_on:'2026-11-22',budget_minutes:0,created_at:''},
  {id:loose,workspace_id:ws,project_id:brand,name:'Production',position:3,starts_on:null,ends_on:null,budget_minutes:0,created_at:''}];
 const tasks:Record<string,any>[]=[{id:milestone,workspace_id:ws,project_id:brand,title:'Client sign-off',status:'todo',assignee_id:user,due_date:'2026-10-30',is_milestone:true,created_by:user,created_at:''}];
 const list=(data:unknown[])=>({json:data,headers:{'access-control-expose-headers':'content-range','content-range':`0-${Math.max(0,data.length-1)}/${data.length}`}});
 await page.route('https://test.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();let data:unknown=[];
  if(path==='/auth/v1/user')data={id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner',locale:'en'},created_at:'2026-10-01T10:00:00Z'};
  else if(path==='/rest/v1/rpc/accept_invitations')data=0;
  else if(path==='/rest/v1/workspaces')data=[{id:ws,name:'VAVE Studio',timezone:'Europe/Berlin',currency:'EUR',created_by:user,created_at:'2026-10-01T10:00:00Z'}];
  else if(path==='/rest/v1/rpc/list_workspace_members')data=[{workspace_id:ws,user_id:user,role,display_name:'Studio Owner',email:'owner@example.test',created_at:'',weekly_capacity_minutes:2400,...(role==='member'?{rights_template:'individuell',permissions:{planning:'view'}}:{})}];
  else if(path==='/rest/v1/projects')data=projects;
  else if(path==='/rest/v1/running_timers'||path==='/rest/v1/workspace_demos')data=null;
  else if(path==='/rest/v1/project_phases'){
   if(method==='POST'){const body=req.postDataJSON();rec.phases.push(body);const at=phases.findIndex(p=>p.id===body.id);const row={...body,id:body.id??'55555555-5555-4555-8555-555555555599',created_at:''};if(at>=0)phases[at]=row;else phases.push(row);data=row;}
   else if(method==='DELETE'){const id=url.searchParams.get('id')!.slice(3);rec.deleted.push(id);const at=phases.findIndex(p=>p.id===id);if(at>=0)phases.splice(at,1);data={id};}
   else data=phases;}
  else if(path==='/rest/v1/tasks'||path==='/rest/v1/rpc/list_workspace_tasks'){if(method==='PATCH'){const body=req.postDataJSON();rec.tasks.push(body);Object.assign(tasks[0],body);data=[tasks[0]];}else data=tasks;}
  await route.fulfill(Array.isArray(data)?list(data):{json:data,headers:{'access-control-expose-headers':'content-range','content-range':'0-0/1'}});
 });
 return rec;
}
const bar=(page:Page,name:string)=>page.locator('.tl-bar').filter({hasText:name});
/** Zieht ein Element waagerecht um eine Zahl von Tagen (13 Wochen = 91 Tage Bahnbreite). */
async function dragDays(page:Page,target:Locator,days:number,at:'center'|'start'|'end'='center'){
 // Die gegriffene Stelle in den sichtbaren Bereich holen – am linken Rand läge sie sonst unter der fixierten Projektspalte.
 await target.evaluate((e,inline)=>e.scrollIntoView({inline,block:'center'}),at);
 const lane=await page.locator('.tl-lane').first().boundingBox(),box=await target.boundingBox();
 const day=lane!.width/91,x=at==='start'?box!.x+2:at==='end'?box!.x+box!.width-3:box!.x+box!.width/2,y=box!.y+box!.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+day*days/2,y,{steps:4});await page.mouse.move(x+day*days,y,{steps:4});await page.mouse.up();
}
async function open(page:Page){await page.goto('/');await goArea(page,'Planning');await expect(page.locator('.tl')).toBeVisible();}

test('timeline shows phases as bars, a milestone and what has no dates yet',async({page})=>{
 await setup(page);await open(page);
 await expect(page.getByRole('button',{name:'Timeline',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(bar(page,'Concept Design')).toBeVisible();await expect(bar(page,'Schematic Design')).toBeVisible();
 await expect(page.getByRole('button',{name:'Phase Concept Design, 10/05 to 10/25'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Milestone Client sign-off, 10/30'})).toBeVisible();
 await expect(page.locator('.tl-chip')).toHaveText(/Production/);
 await expect(page.locator('.tl-weeks .tl-now')).toHaveText('Wk 42');
 if(process.env.SHOTS)await page.screenshot({path:`${process.env.SHOTS}/${test.info().project.name}-zeitstrahl.png`,fullPage:true});
});

test('dragging a bar moves the phase, dragging its edge changes the end',async({page})=>{
 const rec=await setup(page);await open(page);
 await dragDays(page,bar(page,'Concept Design'),7);
 await expect.poll(()=>rec.phases.length).toBe(1);
 expect(rec.phases[0]).toMatchObject({id:concept,name:'Concept Design',starts_on:'2026-10-12',ends_on:'2026-11-01',budget_minutes:3000,position:1});
 await expect(page.getByRole('button',{name:'Phase Concept Design, 10/12 to 11/01'})).toBeVisible();
 await expect(page.locator('.tl-bar-draft')).toHaveCount(0); // gespeichert und neu geladen
 // Das rechte Ende von „Schematic Design“ eine Woche nach vorn ziehen.
 await dragDays(page,bar(page,'Schematic Design'),-7,'end');
 await expect.poll(()=>rec.phases.length).toBe(2);
 expect(rec.phases[1]).toMatchObject({id:schematic,starts_on:'2026-10-26',ends_on:'2026-11-15'});
 // Überlappende Phasen liegen untereinander statt aufeinander.
 const a=await bar(page,'Concept Design').boundingBox(),b=await bar(page,'Schematic Design').boundingBox();
 expect(Math.abs(a!.y-b!.y)).toBeGreaterThan(20);
});

test('dragging on empty space draws a new phase and opens it for naming',async({page})=>{
 const rec=await setup(page);await open(page);
 const lane=page.locator('.tl-row').filter({hasText:'Expo Pavilion'}).locator('.tl-lane');
 await lane.evaluate(e=>e.scrollIntoView({inline:'start',block:'center'}));
 const box=(await lane.boundingBox())!,day=box.width/91,y=box.y+box.height/2;
 // Von Montag, 19.10. (Tag 21 im Fenster ab 28.9.) bis Sonntag, 1.11. (Tag 34).
 await page.mouse.move(box.x+day*21.5,y);await page.mouse.down();await page.mouse.move(box.x+day*28,y,{steps:4});
 await expect(page.locator('.tl-band')).toBeVisible();
 await page.mouse.move(box.x+day*34.5,y,{steps:4});await page.mouse.up();
 const dialog=page.getByRole('dialog',{name:'New phase'});
 await expect(dialog.getByLabel('Name')).toHaveValue('New phase');
 await expect(dialog.getByLabel('Start')).toHaveValue('2026-10-19');await expect(dialog.getByLabel('End',{exact:true})).toHaveValue('2026-11-01');
 await dialog.getByLabel('Name').fill('Site survey');await dialog.getByLabel(/^Hours budget/).fill('37,5');
 await dialog.getByRole('button',{name:'Create phase'}).click();
 await expect(page.getByText('Phase created.',{exact:true})).toBeVisible();
 expect(rec.phases).toEqual([{workspace_id:ws,project_id:expo,name:'Site survey',position:1,starts_on:'2026-10-19',ends_on:'2026-11-01',budget_minutes:2250}]);
 await expect(bar(page,'Site survey')).toBeVisible();
});

test('keyboard moves a phase, the editor renames and deletes it, a milestone follows the pointer',async({page})=>{
 const rec=await setup(page);await open(page);
 const concept1=page.getByRole('button',{name:'Phase Concept Design, 10/05 to 10/25'});
 await concept1.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('button',{name:'Phase Concept Design, 10/07 to 10/27'})).toBeVisible();
 await expect.poll(()=>rec.phases.length,{timeout:5000}).toBe(1);
 expect(rec.phases[0]).toMatchObject({id:concept,starts_on:'2026-10-07',ends_on:'2026-10-27'});
 // Eingabe öffnet die Phase.
 await page.getByRole('button',{name:'Phase Schematic Design, 10/26 to 11/22'}).focus();await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog',{name:'Edit phase'});
 await dialog.getByLabel('Name').fill('Concept Design');await dialog.getByRole('button',{name:'Save'}).click();
 await expect(dialog.getByRole('alert')).toContainText('Each phase name may appear only once in the project.');
 await dialog.getByRole('button',{name:'Delete phase'}).click();await dialog.getByRole('button',{name:'Yes, delete'}).click();
 await expect(page.getByText('Phase deleted.',{exact:true})).toBeVisible();
 expect(rec.deleted).toEqual([schematic]);
 await expect(bar(page,'Schematic Design')).toHaveCount(0);
 // Meilenstein drei Tage nach hinten ziehen.
 await dragDays(page,page.getByRole('button',{name:'Milestone Client sign-off, 10/30'}),3);
 await expect.poll(()=>rec.tasks.length).toBe(1);
 expect(rec.tasks[0]).toMatchObject({due_date:'2026-11-02',title:'Client sign-off'});
 // Eine Phase ohne Zeitraum lässt sich aus der Seitenspalte einplanen.
 await page.locator('.tl-chip').click();
 const place=page.getByRole('dialog',{name:'Edit phase'});
 await expect(place.getByLabel('Start')).toHaveValue('2026-10-13');await expect(place.getByLabel('End',{exact:true})).toHaveValue('2026-10-26');
});

test('without planning rights the timeline is read-only',async({page})=>{
 const rec=await setup(page,'member');await open(page);
 await expect(page.locator('.tl-handle')).toHaveCount(0);await expect(page.locator('.tl-add')).toHaveCount(0);
 await dragDays(page,bar(page,'Concept Design'),7);
 const dialog=page.getByRole('dialog',{name:'Edit phase'});
 await expect(dialog.getByLabel('Name')).toBeDisabled();await expect(dialog.getByRole('button',{name:'Save'})).toHaveCount(0);
 expect(rec.phases).toEqual([]);
});
