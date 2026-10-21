import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Barrierefreiheit: axe-core prüft jede Hauptansicht, die wichtigsten Dialoge
 * und die Anmeldung gegen WCAG 2.0/2.1/2.2 A und AA – auf Desktop und Mobil.
 * Ein neuer Verstoß lässt den Test fehlschlagen und nennt Regel und Element.
 */
test.use({locale:'en-US'});
const user='11111111-1111-4111-8111-111111111111',ws='22222222-2222-4222-8222-222222222222';
const p1='33333333-3333-4333-8333-333333333333',p2='99999999-9999-4999-8999-999999999999',client='44444444-4444-4444-8444-444444444444';
const config={configured:true,appUrl:'http://localhost:4173',supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'};
const WCAG=['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'];

async function mock(page:Page,{loggedIn=true,workspaces=true}={}){
 await page.clock.install({time:new Date('2026-10-13T09:00:00Z')});
 await page.route('**/api/config',r=>r.fulfill({json:config}));
 if(loggedIn)await page.addInitScript(({user})=>{
  const payload=btoa(JSON.stringify({sub:user,aud:'authenticated',role:'authenticated',exp:2100000000,iss:'https://test.supabase.co/auth/v1'}));
  localStorage.setItem('sb-test-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.test`,refresh_token:'r',token_type:'bearer',expires_at:2100000000,expires_in:3600,user:{id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner'},created_at:'2026-10-01T10:00:00Z'}}));
 },{user});
 const tables:Record<string,unknown>={
  '/auth/v1/user':{id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner',locale:'en'},created_at:''},
  '/rest/v1/rpc/accept_invitations':0,
  '/rest/v1/workspaces':workspaces?[{id:ws,name:'VAVE Studio',timezone:'Europe/Berlin',currency:'EUR',created_by:user,created_at:''}]:[],
  '/rest/v1/memberships':[{workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:''},{workspace_id:ws,user_id:'55555555-5555-4555-8555-555555555555',role:'member',display_name:'Elena Weber',email:'elena@example.test',created_at:''}],
  '/rest/v1/projects':[{id:p1,workspace_id:ws,code:'VAV-001',name:'Brand Experience',client:'VAVE',budget_minutes:6000,status:'active',color:'#641dff',created_at:''},{id:p2,workspace_id:ws,code:'VAV-002',name:'Museum Experience',client:'Museum',budget_minutes:12000,status:'active',color:'#229977',created_at:''}],
  '/rest/v1/tasks':[{id:'10000000-0000-4000-8000-000000000001',workspace_id:ws,project_id:p1,title:'Brand sketch',status:'todo',assignee_id:user,due_date:'2026-10-12',created_by:user,created_at:''},{id:'10000000-0000-4000-8000-000000000002',workspace_id:ws,project_id:p2,title:'Museum prototype',status:'doing',assignee_id:null,due_date:'2026-10-20',created_by:user,created_at:''},{id:'10000000-0000-4000-8000-000000000003',workspace_id:ws,project_id:p1,title:'Kick-off',status:'done',assignee_id:user,due_date:null,created_by:user,created_at:''}],
  '/rest/v1/time_entries':[{id:'20000000-0000-4000-8000-000000000001',workspace_id:ws,project_id:p1,user_id:user,work_date:'2026-10-13',minutes:90,note:'Concept',billable:true,status:'draft',timer_id:null,created_at:''},{id:'20000000-0000-4000-8000-000000000002',workspace_id:ws,project_id:p2,user_id:'55555555-5555-4555-8555-555555555555',work_date:'2026-10-12',minutes:240,note:'Prototype',billable:true,status:'submitted',timer_id:null,created_at:''}],
  '/rest/v1/running_timers':null,'/rest/v1/workspace_demos':null,
  '/rest/v1/finance_clients':[{id:client,workspace_id:ws,name:'Müller & Söhne GmbH',billing_address:'Hauptstr. 1\n10115 Berlin',contact_email:'invoices@mueller.test',tax_id:'DE123',language:'en',country:'DE',customer_number:'K-1001',industry:'Culture',phone:'030 555',website:'mueller.test',notes:'Invoices only as PDF.',contacts:[{name:'Anna Berg',role:'Marketing',email:'anna@mueller.test'}],created_at:''}],
  '/rest/v1/rpc/finance_list_invoices':[{id:'a0000000-0000-4000-8000-000000000001',workspace_id:ws,client_id:client,project_id:p1,language:'en',issue_date:'2026-10-01',due_date:'2026-10-10',service_from:'2026-09-01',service_to:'2026-09-30',payment_instructions:'',notes:'',created_at:'',status:'issued',number:'RE-2026-0001',currency:'EUR',lines:[{description:'Design',quantity:10,unit_price_minor:10000,tax_basis_points:1900,net_minor:100000,tax_minor:19000,total_minor:119000,time_entry_id:null,zero_tax_reason:''}],net_minor:100000,tax_minor:19000,total_minor:119000,issuer_snapshot:null,customer_snapshot:null,issued_at:'',cancellation_of:null,cancellation_reason:'',paid:false,cancellation_id:null,paid_minor:0,payments:[]}],
 };
 await page.route('https://test.supabase.co/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/rest/v1/workspaces'&&url.searchParams.get('select')==='currency')return route.fulfill({json:{currency:'EUR'}});
  const data=url.pathname in tables?tables[url.pathname]:[];
  await route.fulfill({json:data,headers:{'access-control-expose-headers':'content-range','content-range':Array.isArray(data)?`0-${Math.max(0,data.length-1)}/${data.length}`:'0-0/1'}});
 });
}
async function audit(page:Page,name:string){
 // Kurz warten, bis Ladeanimationen und Übergänge vorbei sind.
 await page.waitForTimeout(250);
 const result=await new AxeBuilder({page}).withTags(WCAG).analyze();
 const found=result.violations.map(v=>`${name}: [${v.impact}] ${v.id} – ${v.help} (${v.nodes.length}×: ${v.nodes.slice(0,3).map(n=>n.target.join(' ')).join(' | ')}) ${v.nodes[0]?.html.slice(0,160)??''}`);
 return found;
}
async function area(page:Page,name:string){
 const label=new RegExp(`^${name}`),nav=page.getByRole('navigation',{name:'Main navigation'}),more=page.locator('.nav-more');
 if(await more.isVisible()){
  // Mobil: vier Bereiche in der unteren Leiste, die übrigen im „Mehr“-Blatt.
  const direct=nav.getByRole('button',{name:label}).filter({visible:true});
  if(await direct.count()){await direct.first().click();return;}
  await page.evaluate(()=>window.scrollTo(0,0));
  await more.dispatchEvent('click');
  await page.locator('.nav-more-sheet').getByRole('button',{name:label}).click();
  return;
 }
 // Desktop: Finance und Team erscheinen erst, wenn die Rolle geladen ist – click wartet darauf.
 await nav.getByRole('button',{name:label}).first().click();
}

test('sign-in and onboarding meet WCAG 2.2 AA',async({page})=>{
 await mock(page,{loggedIn:false});await page.goto('/');await expect(page.getByLabel('Email address',{exact:true})).toBeVisible();
 const issues=await audit(page,'sign-in');
 await page.getByRole('button',{name:/Create account|Register/i}).first().click().catch(()=>undefined);
 issues.push(...await audit(page,'register'));
 expect(issues).toEqual([]);
});
test('onboarding without a workspace meets WCAG 2.2 AA',async({page})=>{
 await mock(page,{workspaces:false});await page.goto('/');await expect(page.getByRole('button',{name:'Create workspace',exact:true})).toBeVisible();
 expect(await audit(page,'onboarding')).toEqual([]);
});
test('every main area meets WCAG 2.2 AA',async({page})=>{
 test.setTimeout(90000);
 await mock(page);await page.goto('/');await expect(page.getByRole('heading',{level:1})).toBeVisible();
 const issues=await audit(page,'overview');
 for(const name of ['Projects','Tasks','Time','Absences','Planning','Reports','Team','Settings','Help']){await area(page,name);await expect(page.getByRole('heading',{level:1})).toBeVisible();issues.push(...await audit(page,name));}
 expect(issues).toEqual([]);
});
test('every finance tab meets WCAG 2.2 AA',async({page})=>{
 test.setTimeout(90000);
 await mock(page);await page.goto('/');await expect(page.getByRole('heading',{level:1})).toBeVisible();
 await area(page,'Finance');const issues:string[]=[];
 for(const tab of ['Overview','Clients','Planning & costs','Invoices','Offers','Company']){await page.getByRole('tab',{name:tab,exact:true}).click();issues.push(...await audit(page,`finance/${tab}`));}
 expect(issues).toEqual([]);
});
test('dialogs, palette and the opened invoice meet WCAG 2.2 AA',async({page})=>{
 test.setTimeout(90000);
 await mock(page);await page.goto('/');await expect(page.getByRole('heading',{level:1})).toBeVisible();
 const issues:string[]=[];
 await page.getByRole('button',{name:'Add time',exact:true}).first().click();await expect(page.getByRole('dialog')).toBeVisible();issues.push(...await audit(page,'dialog/time'));await page.keyboard.press('Escape');
 await area(page,'Tasks');await page.getByRole('button',{name:'New task',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();issues.push(...await audit(page,'dialog/task'));await page.keyboard.press('Escape');
 await area(page,'Projects');await page.getByRole('button',{name:'New project',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();issues.push(...await audit(page,'dialog/project'));await page.keyboard.press('Escape');
 await page.keyboard.press('Control+k');await expect(page.getByRole('dialog')).toBeVisible();issues.push(...await audit(page,'palette'));await page.keyboard.press('Escape');
 await area(page,'Finance');await page.getByRole('tab',{name:'Clients',exact:true}).click();await page.getByRole('button',{name:/^Edit: /}).first().click();await expect(page.getByRole('dialog')).toBeVisible();issues.push(...await audit(page,'dialog/client'));await page.keyboard.press('Escape');
 await page.getByRole('tab',{name:'Invoices',exact:true}).click();await page.getByRole('button',{name:'RE-2026-0001',exact:true}).click();issues.push(...await audit(page,'invoice detail'));
 await page.getByRole('button',{name:'Match bank statement',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();issues.push(...await audit(page,'dialog/bank'));await page.keyboard.press('Escape');
 expect(issues).toEqual([]);
});
test('open dropdowns and the mobile More sheet meet WCAG 2.2 AA',async({page,isMobile})=>{
 await mock(page);await page.goto('/');await expect(page.getByRole('heading',{level:1})).toBeVisible();await area(page,'Tasks');await expect(page.getByRole('button',{name:'More filters',exact:true})).toBeVisible();
 const issues:string[]=[];
 await page.getByRole('button',{name:'More filters',exact:true}).click();
 await page.getByRole('combobox',{name:'Status',exact:true}).click();await expect(page.getByRole('listbox')).toBeVisible();issues.push(...await audit(page,'select open'));await page.keyboard.press('Escape');
 if(isMobile){await page.evaluate(()=>window.scrollTo(0,0));await page.locator('.nav-more').dispatchEvent('click');await expect(page.locator('.nav-more-sheet')).toBeVisible();issues.push(...await audit(page,'more sheet'));}
 expect(issues).toEqual([]);
});
test('keyboard users reach the content first, see focus and can operate the board',async({page,isMobile})=>{
 test.skip(isMobile,'Tastaturbedienung auf dem Desktop');
 await mock(page);await page.goto('/');await expect(page.getByRole('heading',{level:1})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang','en-US');
 // Erster Tab-Stopp ist der Sprunglink; Enter springt in den Hauptinhalt.
 await page.keyboard.press('Tab');
 const skip=page.getByRole('link',{name:'Skip to content'});
 await expect(skip).toBeFocused();
 expect(await skip.evaluate(el=>getComputedStyle(el).top)).not.toBe('-100px');
 await page.keyboard.press('Enter');await expect(page.locator('#main')).toBeFocused();
 // Jede per Tab erreichte Schaltfläche zeigt einen sichtbaren Fokusrahmen.
 for(let i=0;i<8;i++){
  await page.keyboard.press('Tab');
  const outline=await page.evaluate(()=>{const el=document.activeElement as HTMLElement|null;if(!el||el===document.body)return 'none';const s=getComputedStyle(el);return s.outlineStyle==='none'||s.outlineWidth==='0px'?(s.boxShadow!=='none'?'shadow':'none'):'outline';});
  expect(outline,`Tab-Stopp ${i+1} ohne sichtbaren Fokus`).not.toBe('none');
 }
 // Aufgaben-Status per Tastatur (Alternative zum Ziehen).
 await area(page,'Tasks');
 const status=page.getByRole('combobox',{name:'Status for Brand sketch',exact:true});
 await status.focus();await page.keyboard.press('Enter');await expect(page.getByRole('listbox')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);await expect(status).toBeFocused();
});
test('reduced motion turns off decorative animation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await mock(page);await page.goto('/');await expect(page.getByRole('heading',{level:1})).toBeVisible();
 const longest=await page.evaluate(()=>Math.max(0,...[...document.querySelectorAll<HTMLElement>('body *')].map(el=>{const s=getComputedStyle(el);return Math.max(...s.animationDuration.split(',').map(parseFloat),...s.transitionDuration.split(',').map(parseFloat));})));
 expect(longest).toBeLessThanOrEqual(0.01);
});
test('content reflows at 320 px (400 % zoom) without horizontal scrolling',async({page,isMobile})=>{
 test.skip(isMobile,'Breite wird hier selbst gesetzt');test.setTimeout(90000);
 await page.setViewportSize({width:320,height:640});
 await mock(page);await page.goto('/');await expect(page.getByRole('heading',{level:1})).toBeVisible();
 const overflow:string[]=[];
 const check=async(name:string)=>{await page.waitForTimeout(200);const w=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);if(w>0)overflow.push(`${name}: ${w}px`);};
 await check('overview');
 for(const name of ['Projects','Tasks','Time','Absences','Planning','Reports','Team','Finance','Settings','Help']){await area(page,name);await expect(page.getByRole('heading',{level:1})).toBeVisible();await check(name);}
 expect(overflow).toEqual([]);
});
