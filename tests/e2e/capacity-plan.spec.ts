import {test,expect,type Page} from '@playwright/test';
import {pickOption} from './select';
import {goArea} from './nav';
test.use({locale:'en-US'});
// Künstliche Daten – keine Kundendaten. Die Uhr steht auf Dienstag, 13.10.2026 (KW 42).
const user='11111111-1111-4111-8111-111111111111',ana='11111111-1111-4111-8111-1111111111a1',ben='11111111-1111-4111-8111-1111111111b1';
const ws='22222222-2222-4222-8222-222222222222';
const brand='33333333-3333-4333-8333-333333333333',expo='33333333-3333-4333-8333-333333333334';
const pm='44444444-4444-4444-8444-444444444441',threeD='44444444-4444-4444-8444-444444444442';
const concept='55555555-5555-4555-8555-555555555551',schematic='55555555-5555-4555-8555-555555555552';
const r1='66666666-6666-4666-8666-666666666661',r2='66666666-6666-4666-8666-666666666662',r3='66666666-6666-4666-8666-666666666663',r4='66666666-6666-4666-8666-666666666664';
const config={configured:true,appUrl:'http://localhost:4173',supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'};
const FULL=[480,480,480,480,480,0,0];
interface Recorded{cells:Record<string,unknown>[];deleted:string[];rows:Record<string,unknown>[];imports:Record<string,unknown>[];entries:Record<string,unknown>[];phases:Record<string,unknown>[]}
async function setup(page:Page,role:'owner'|'member'='owner'):Promise<Recorded>{
 const rec:Recorded={cells:[],deleted:[],rows:[],imports:[],entries:[],phases:[]};
 await page.clock.install({time:new Date('2026-10-13T09:00:00Z')});
 await page.route('**/api/config',r=>r.fulfill({json:config}));
 await page.addInitScript(({user})=>{
  const payload=btoa(JSON.stringify({sub:user,aud:'authenticated',role:'authenticated',exp:2100000000,iss:'https://test.supabase.co/auth/v1'}));
  localStorage.setItem('sb-test-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.test`,refresh_token:'test-refresh-token',token_type:'bearer',expires_at:2100000000,expires_in:3600,user:{id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner'},created_at:'2026-10-01T10:00:00Z'}}));
 },{user});
 const members=[{workspace_id:ws,user_id:user,role,display_name:'Studio Owner',email:'owner@example.test',created_at:'',work_schedule:FULL,weekly_capacity_minutes:2400},
  {workspace_id:ws,user_id:ana,role:'member',display_name:'Ana Lopez',email:'ana@example.test',created_at:'',work_schedule:FULL,weekly_capacity_minutes:2400},
  {workspace_id:ws,user_id:ben,role:'member',display_name:'Ben Okafor',email:'ben@example.test',created_at:'',work_schedule:FULL,weekly_capacity_minutes:2400}];
 const projects=[{id:brand,workspace_id:ws,code:'VAV-001',name:'Brand Experience',client:'VAVE',budget_minutes:6000,status:'active',color:'#641dff',created_at:'2026-10-01T10:00:00Z',billable_default:true},
  {id:expo,workspace_id:ws,code:'EXP-002',name:'Expo Pavilion',client:'Expo',budget_minutes:0,status:'active',color:'#1f8a70',created_at:'2026-10-02T10:00:00Z',billable_default:false}];
 const types=[{id:pm,workspace_id:ws,name:'PM',position:1,active:true,created_at:''},{id:threeD,workspace_id:ws,name:'3D',position:2,active:true,created_at:''}];
 const phases=[{id:concept,workspace_id:ws,project_id:brand,name:'Concept Design',position:1,starts_on:'2026-10-05',ends_on:'2026-10-25',budget_minutes:3000,created_at:''},{id:schematic,workspace_id:ws,project_id:brand,name:'Schematic Design',position:2,starts_on:'2026-10-26',ends_on:'2026-11-22',budget_minutes:0,created_at:''}];
 const rows=[{id:r1,workspace_id:ws,project_id:brand,user_id:user,service_type_id:pm,offered_minutes:2400,note:'',position:1,created_at:''},{id:r2,workspace_id:ws,project_id:brand,user_id:ana,service_type_id:threeD,offered_minutes:null,note:'',position:2,created_at:''},
  {id:r3,workspace_id:ws,project_id:brand,user_id:null,service_type_id:threeD,offered_minutes:null,note:'XYZ',position:3,created_at:''},{id:r4,workspace_id:ws,project_id:expo,user_id:ana,service_type_id:threeD,offered_minutes:null,note:'',position:1,created_at:''}];
 const cells=[{workspace_id:ws,row_id:r1,week_start:'2026-10-12',minutes:960},{workspace_id:ws,row_id:r1,week_start:'2026-10-19',minutes:480},{workspace_id:ws,row_id:r2,week_start:'2026-10-12',minutes:1800},{workspace_id:ws,row_id:r3,week_start:'2026-10-19',minutes:480},{workspace_id:ws,row_id:r4,week_start:'2026-10-12',minutes:1200}];
 const list=(data:unknown[])=>({json:data,headers:{'access-control-expose-headers':'content-range','content-range':`0-${Math.max(0,data.length-1)}/${data.length}`}});
 await page.route('https://test.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();let data:unknown=[];
  if(path==='/auth/v1/user')data={id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner',locale:'en'},created_at:'2026-10-01T10:00:00Z'};
  else if(path==='/rest/v1/rpc/accept_invitations')data=0;
  else if(path==='/rest/v1/workspaces')data=[{id:ws,name:'VAVE Studio',timezone:'Europe/Berlin',currency:'EUR',created_by:user,created_at:'2026-10-01T10:00:00Z'}];
  else if(path==='/rest/v1/rpc/list_workspace_members')data=members;
  else if(path==='/rest/v1/projects')data=projects;
  else if(path==='/rest/v1/running_timers'||path==='/rest/v1/workspace_demos')data=null;
  else if(path==='/rest/v1/service_types')data=types;
  else if(path==='/rest/v1/project_phases'){if(method==='POST'){const body=req.postDataJSON();rec.phases.push(body);const at=phases.findIndex(p=>p.id===body.id);if(at>=0)Object.assign(phases[at],body);else phases.push({...body,created_at:''});data=body;}else data=phases;}
  else if(path==='/rest/v1/capacity_rows'){if(method==='POST'){const body=req.postDataJSON();rec.rows.push(body);rows.push({...body,created_at:''});data=body;}else data=rows;}
  else if(path==='/rest/v1/capacity_cells'){
   if(method==='POST'){for(const c of req.postDataJSON() as typeof cells){rec.cells.push(c);const at=cells.findIndex(x=>x.row_id===c.row_id&&x.week_start===c.week_start);if(at>=0)cells[at]=c;else cells.push(c);}data=null;}
   else if(method==='DELETE'){const row=url.searchParams.get('row_id')!.slice(3),week=url.searchParams.get('week_start')!.slice(3);rec.deleted.push(`${row}|${week}`);const at=cells.findIndex(x=>x.row_id===row&&x.week_start===week);if(at>=0)cells.splice(at,1);data=null;}
   else{const from=url.searchParams.getAll('week_start').find(v=>v.startsWith('gte.'))!.slice(4),to=url.searchParams.getAll('week_start').find(v=>v.startsWith('lte.'))!.slice(4);data=cells.filter(c=>c.week_start>=from&&c.week_start<=to);}
  }
  else if(path==='/rest/v1/capacity_row_totals')data=rows.map(r=>({row_id:r.id,minutes:cells.filter(c=>c.row_id===r.id).reduce((a,c)=>a+c.minutes,0)+(r.id===r1?600:0),first_week:'2026-10-12',last_week:'2026-10-19'})).filter(t=>t.minutes>0);
  else if(path==='/rest/v1/capacity_actuals')data=[{project_id:brand,user_id:user,week_start:'2026-10-12',minutes:300}];
  else if(path==='/rest/v1/phase_plan')data=[{project_id:brand,phase_id:concept,minutes:3240},{project_id:brand,phase_id:schematic,minutes:0}];
  else if(path==='/rest/v1/phase_effort')data=[{project_id:brand,phase_id:concept,service_type_id:pm,minutes:300,billable_minutes:300,entries:2}];
  else if(path==='/rest/v1/rpc/import_capacity_plan'){rec.imports.push(req.postDataJSON());data={projects:1,created_projects:1,rows:2,cells:4,phases:1,service_types:1};}
  else if(path==='/rest/v1/time_entries'){if(method==='POST'){const body=req.postDataJSON();rec.entries.push(body);data={...body,user_id:user,status:'draft',timer_id:null,created_at:'2026-10-13T09:00:00Z'};}}
  await route.fulfill(Array.isArray(data)?list(data):{json:data,headers:{'access-control-expose-headers':'content-range','content-range':'0-0/1'}});
 });
 return rec;
}
const cell=(page:Page,name:string,projectName:string,week:number)=>page.getByLabel(`${name}, ${projectName}, week ${week}: hours`,{exact:true});

test('capacity plan shows free hours per person, phases over the weeks and saves a cell',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const rec=await setup(page);await page.goto('/');await goArea(page,'Planning');
 const grid=page.getByRole('region',{name:'Capacity plan by project, person and calendar week'});
 await expect(grid).toBeVisible();
 // Team: Owner 40 h − 16 h = 24 frei; Ana 30 + 20 = 50 h → 10 h überbucht; Ben ist nicht verplant und bleibt eingeklappt.
 const owner=grid.locator('tr.plan-person',{hasText:'Studio Owner'}),anaRow=grid.locator('tr.plan-person',{hasText:'Ana Lopez'});
 await expect(owner.locator('td.week-current')).toHaveText('24');await expect(owner).toContainText('PM');
 await expect(anaRow.locator('td.week-current')).toHaveText('−10');await expect(anaRow.locator('td.week-current')).toHaveClass(/plan-over/);
 await expect(grid.locator('tr.plan-person')).toHaveCount(2);
 await expect(page.locator('.plan-stats')).toContainText('1 overbooked person-weeks');await expect(page.locator('.plan-stats')).toContainText('8 h not assigned to anyone yet');
 await grid.getByRole('button',{name:'Show 1 more person without planning',exact:true}).click();
 await expect(grid.locator('tr.plan-person',{hasText:'Ben Okafor'}).locator('td.week-current')).toHaveText('40');
 // Projektblock: Phasen als Balken, Summe über alle Wochen (auch außerhalb des Ausschnitts), gebuchte Zeit daneben.
 const block=grid.locator('tbody.plan-project',{hasText:'Brand Experience'});
 await expect(block.locator('.plan-phase',{hasText:'Concept Design'})).toBeVisible();await expect(block.locator('.plan-phase',{hasText:'Schematic Design'})).toBeVisible();
 await expect(block.locator('.plan-phase-over')).toHaveCount(1);
 await expect(block.locator('.plan-meta')).toContainText('72 of 100 h planned');await expect(block.locator('.plan-meta')).toContainText('5 h booked');
 await expect(block.locator('tr.plan-row',{hasText:'Open (XYZ)'})).toBeVisible();
 await expect(cell(page,'Studio Owner','Brand Experience',42)).toHaveValue('16');
 await expect(block.locator('tr.plan-row',{hasText:'Studio Owner'}).locator('td.plan-sum')).toContainText('34');
 // Zelle ändern: 20 h in KW 42 → gespeichert, freie Stunden sinken auf 20; Enter springt in die nächste Zeile.
 await cell(page,'Studio Owner','Brand Experience',42).fill('20');await page.keyboard.press('Enter');
 await expect(page.locator('.plan-save')).toHaveText('Saved.');
 expect(rec.cells).toEqual([{workspace_id:ws,row_id:r1,week_start:'2026-10-12',minutes:1200}]);
 await expect(owner.locator('td.week-current')).toHaveText('20');
 await expect(cell(page,'Ana Lopez','Brand Experience',42)).toBeFocused();
 // Leeren löscht die Zelle; Unsinn wird nicht gespeichert.
 await cell(page,'Ana Lopez','Brand Experience',42).fill('');await page.keyboard.press('Tab');
 await expect.poll(()=>rec.deleted).toEqual([`${r2}|2026-10-12`]);
 await expect(anaRow.locator('td.week-current')).toHaveText('20');
 await cell(page,'Ana Lopez','Expo Pavilion',42).fill('viel');await page.keyboard.press('Tab');
 await expect(cell(page,'Ana Lopez','Expo Pavilion',42)).toHaveAttribute('aria-invalid','true');
 expect(rec.cells).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 expect(errors).toEqual([]);
});

test('a plan row is added with a filled period, and phases are edited per project',async({page})=>{
 const rec=await setup(page);await page.goto('/');await goArea(page,'Planning');
 await page.getByRole('button',{name:'Add row to Expo Pavilion',exact:true}).click();
 let dialog=page.getByRole('dialog');
 await pickOption(dialog.getByLabel('Person',{exact:true}),/Ben Okafor/);await pickOption(dialog.getByLabel('Service type',{exact:true}),'PM');
 await dialog.getByLabel(/^Offered hours/).fill('40');
 await dialog.getByLabel('Hours per week',{exact:true}).fill('8');await dialog.getByLabel('From',{exact:true}).fill('2026-10-12');await dialog.getByLabel('To',{exact:true}).fill('2026-10-30');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).not.toBeVisible();
 expect(rec.rows).toEqual([expect.objectContaining({workspace_id:ws,project_id:expo,user_id:ben,service_type_id:pm,offered_minutes:2400,position:2})]);
 expect(rec.cells.map(c=>`${c.week_start}:${c.minutes}`)).toEqual(['2026-10-12:480','2026-10-19:480','2026-10-26:480']);
 await expect(cell(page,'Ben Okafor','Expo Pavilion',43)).toHaveValue('8');
 // Phasen: Budget und Plan je Phase, eine neue Phase schließt an die letzte an.
 await page.getByRole('button',{name:'Edit phases of Brand Experience',exact:true}).click();
 dialog=page.getByRole('dialog');
 await expect(dialog.locator('.phase-row').first()).toContainText('54 h planned');await expect(dialog.locator('.phase-row').first()).toContainText('5 h booked');
 await dialog.getByRole('button',{name:'Add phase',exact:true}).click();
 const added=dialog.locator('.phase-row').nth(2);
 await expect(added.getByLabel('From',{exact:true})).toHaveValue('2026-11-23');
 await added.getByLabel('Phase',{exact:true}).fill('Supervision');await added.getByLabel('Budget (h)',{exact:true}).fill('12,5');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).not.toBeVisible();
 expect(rec.phases).toHaveLength(3);
 expect(rec.phases[2]).toMatchObject({project_id:brand,name:'Supervision',position:3,starts_on:'2026-11-23',ends_on:'2026-12-20',budget_minutes:750});
});

test('an Excel-style table is pasted, matched to people and projects and imported in one step',async({page})=>{
 const rec=await setup(page);await page.goto('/');await goArea(page,'Planning');
 await page.getByRole('button',{name:'Import from Excel',exact:true}).click();
 const dialog=page.getByRole('dialog');
 const table=['\tPosition\tPerson\tOffered\tPlanned\tCW 43\tCW 44\tCW 45','Night Garden\t\t\t80\t\tDISCOVERY\t\tCONCEPT','Night Garden\tPM\tANA\t\t\t8\t8\t4,5','Night Garden\tMotion\tZED\t\t\t\t16\t16','Brand Experience\t\t\t\t\t\t\t','Brand Experience\t3D\tBen Okafor\t\t\t20\t\t'].join('\n');
 await dialog.getByLabel('Or copy cells from Excel and paste them here',{exact:true}).fill(table);
 await dialog.getByRole('button',{name:'Read pasted table',exact:true}).click();
 const summary=dialog.locator('.plan-import-summary');
 await expect(summary).toContainText('Wk 43 – Wk 45');await expect(summary).toContainText('72.5');
 // ANA und Ben werden erkannt, ZED bleibt offen; „Brand Experience“ gibt es schon, „Night Garden“ wird angelegt.
 await expect(dialog.getByLabel('Person for ANA',{exact:true})).toContainText('Ana Lopez');
 await expect(dialog.getByLabel('Person for Ben Okafor',{exact:true})).toContainText('Ben Okafor');
 await expect(dialog.getByLabel('Person for ZED',{exact:true})).toContainText('Leave open');
 await expect(dialog.getByLabel('Target for Brand Experience',{exact:true})).toContainText('Brand Experience');
 await expect(dialog.getByLabel('Target for Night Garden',{exact:true})).toContainText('Create new');
 await pickOption(dialog.getByLabel('Target for Brand Experience',{exact:true}),'Do not import');
 await dialog.getByRole('button',{name:'Import 1 project',exact:true}).click();
 await expect(page.getByText('Plan imported: 2 rows in 1 project.',{exact:true})).toBeVisible();
 expect(rec.imports).toHaveLength(1);
 expect(rec.imports[0]).toEqual({p_workspace_id:ws,p_plan:{replace:true,service_types:['PM','Motion'],projects:[{project_id:null,create:{code:'NG-01',name:'Night Garden',budget_minutes:4800},
  phases:[{name:'DISCOVERY',starts_on:'2026-10-19',ends_on:'2026-11-01'},{name:'CONCEPT',starts_on:'2026-11-02',ends_on:'2026-11-08'}],
  rows:[{user_id:ana,service_type:'PM',offered_minutes:null,note:'',cells:{'2026-10-19':480,'2026-10-26':480,'2026-11-02':270}},{user_id:null,service_type:'Motion',offered_minutes:null,note:'ZED',cells:{'2026-10-26':960,'2026-11-02':960}}]}]}});
 // Eine Tabelle ohne Kalenderwochen wird verständlich abgelehnt.
 await page.getByRole('button',{name:'Import from Excel',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Or copy cells from Excel and paste them here',{exact:true}).fill('Name\tHours\nAna\t8');
 await page.getByRole('dialog').getByRole('button',{name:'Read pasted table',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('alert')).toContainText('No calendar weeks found');
});

test('time is booked on phase and service type, and “billable” follows the project for members',async({page})=>{
 const rec=await setup(page,'member');await page.goto('/');
 await page.getByRole('button',{name:'Add time',exact:true}).first().click();
 const dialog=page.getByRole('dialog');
 // Vorschlag: Der 13.10. liegt in „Concept Design“, im Plan des Projekts steht die Person als PM.
 await expect(dialog.getByLabel('Phase',{exact:true})).toContainText('Concept Design');
 await expect(dialog.getByLabel('Service type',{exact:true})).toContainText('PM');
 await expect(dialog.getByLabel('Billable',{exact:true})).toHaveCount(0);await expect(dialog.getByText('Billable – set by the project.',{exact:true})).toBeVisible();
 await dialog.getByLabel('Date',{exact:true}).fill('2026-10-28');
 await expect(dialog.getByLabel('Phase',{exact:true})).toContainText('Schematic Design');
 await dialog.getByLabel('Hours',{exact:true}).fill('2');await dialog.getByLabel('Minutes',{exact:true}).fill('0');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).not.toBeVisible();
 expect(rec.entries).toEqual([expect.objectContaining({project_id:brand,work_date:'2026-10-28',minutes:120,billable:true,phase_id:schematic,service_type_id:pm})]);
 // Anderes Projekt: keine Phasen, nicht abrechenbar.
 await page.getByRole('button',{name:'Add time',exact:true}).first().click();
 await pickOption(page.getByRole('dialog').getByLabel('Project',{exact:true}),/Expo Pavilion/);
 await expect(page.getByRole('dialog').getByLabel('Phase',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('dialog').getByText('Not billable – set by the project.',{exact:true})).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();
 await expect.poll(()=>rec.entries.length).toBe(2);
 expect(rec.entries[1]).toMatchObject({project_id:expo,billable:false,phase_id:null,service_type_id:null});
});

test('the plan stays readable on a phone: first column sticks, weeks scroll sideways',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='mobile','Nur auf dem Telefon geprüft.');
 await setup(page);await page.goto('/');await goArea(page,'Planning');
 const grid=page.getByRole('region',{name:'Capacity plan by project, person and calendar week'});await expect(grid).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 const box=await grid.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));expect(box.scroll).toBeGreaterThan(box.client);
 await grid.evaluate(el=>{el.scrollLeft=300;});
 const label=await grid.locator('tr.plan-person .plan-label').first().boundingBox(),region=await grid.boundingBox();
 expect(Math.round(label!.x)).toBe(Math.round(region!.x));
});

test('a value is dragged across further weeks with the fill handle, and copied with Alt and arrow',async({page})=>{
 const rec=await setup(page);await page.goto('/');await goArea(page,'Planning');
 const source=cell(page,'Studio Owner','Brand Experience',42),target=cell(page,'Studio Owner','Brand Experience',45);
 await expect(source).toHaveValue('16');
 await source.evaluate(e=>e.scrollIntoView({inline:'center',block:'center'}));
 const handle=source.locator('xpath=..').locator('.plan-fill-handle');
 await source.hover();
 const h=(await handle.boundingBox())!,goal=(await target.boundingBox())!;
 await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();
 await page.mouse.move((h.x+goal.x)/2,goal.y+goal.height/2,{steps:4});await page.mouse.move(goal.x+goal.width/2,goal.y+goal.height/2,{steps:4});
 await expect(page.locator('td.plan-cell-fill')).toHaveCount(4);
 await page.mouse.up();
 await expect(page.locator('td.plan-cell-fill')).toHaveCount(0);
 await expect(target).toHaveValue('16');await expect(cell(page,'Studio Owner','Brand Experience',43)).toHaveValue('16');
 await expect.poll(()=>rec.cells.length).toBe(3);
 expect(rec.cells.map(c=>[c.week_start,c.minutes])).toEqual([['2026-10-19',960],['2026-10-26',960],['2026-11-02',960]]);
 // Tastatur: Alt + Pfeil rechts übernimmt den Wert in die nächste Woche und springt dorthin.
 await target.focus();await page.keyboard.press('Alt+ArrowRight');
 await expect(cell(page,'Studio Owner','Brand Experience',46)).toBeFocused();await expect(cell(page,'Studio Owner','Brand Experience',46)).toHaveValue('16');
 await expect.poll(()=>rec.cells.length).toBe(4);
 expect(rec.cells[3]).toMatchObject({week_start:'2026-11-09',minutes:960});
});
