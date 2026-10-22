import {test,expect,type Page} from '@playwright/test';
import {pickOption} from './select';
import {goArea} from './nav';
import {DEMO_MANIFEST,DEMO_EXPERIENCE_VERSION} from '../../src/shared/demo-data';
test.use({locale:'en-US'});
const user='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const project='33333333-3333-4333-8333-333333333333';
const config={configured:true,appUrl:'http://localhost:4173',supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'};
async function setup(page:Page,loggedIn=false,role:'owner'|'manager'|'member'='owner'){
 await page.clock.install({time:new Date('2026-10-13T09:00:00Z')});
 await page.route('**/api/config',r=>r.fulfill({json:config}));
 const entries:Record<string,unknown>[]=[];
 if(loggedIn)await page.addInitScript(({user})=>{
  const payload=btoa(JSON.stringify({sub:user,aud:'authenticated',role:'authenticated',exp:2100000000,iss:'https://test.supabase.co/auth/v1'}));
  localStorage.setItem('sb-test-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.test`,refresh_token:'test-refresh-token',token_type:'bearer',expires_at:2100000000,expires_in:3600,user:{id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner'},created_at:'2026-10-01T10:00:00Z'}}));
 },{user});
 await page.route('https://test.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());let data:unknown=[];
  if(url.pathname==='/auth/v1/user')data={id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner',locale:req.method()==='PUT'?req.postDataJSON().data?.locale:'en'},created_at:'2026-10-01T10:00:00Z'};
  else if(url.pathname==='/rest/v1/rpc/accept_invitations')data=0;
  else if(url.pathname==='/rest/v1/workspaces')data=[{id:ws,name:'VAVE Studio',timezone:'Europe/Berlin',currency:'EUR',created_by:user,created_at:'2026-10-01T10:00:00Z'}];
  else if(url.pathname==='/rest/v1/memberships')data=[{workspace_id:ws,user_id:user,role,display_name:'Studio Owner',email:'owner@example.test',created_at:'2026-10-01T10:00:00Z'}];
  else if(url.pathname==='/rest/v1/projects')data=[{id:project,workspace_id:ws,code:'VAV-001',name:'Brand Experience',client:'VAVE',budget_minutes:600,status:'active',color:'#641dff',created_at:'2026-10-01T10:00:00Z'}];
  else if(url.pathname==='/rest/v1/running_timers'||url.pathname==='/rest/v1/workspace_demos')data=null;
  else if(url.pathname==='/rest/v1/time_entries'){
   if(req.method()==='POST'){const body=req.postDataJSON();const e={...body,user_id:user,status:'draft',timer_id:null,created_at:'2026-10-13T09:00:00Z'};entries.push(e);data=e}else{const st=url.searchParams.get('status');data=st?entries.filter(e=>`eq.${(e as {status:string}).status}`===st):entries;}
  }
  await route.fulfill({json:data,headers:{'access-control-expose-headers':'content-range','content-range':Array.isArray(data)?`0-${Math.max(0,data.length-1)}/${data.length}`:'0-0/1'}});
 });
 return entries;
}
test('missing backend is an honest setup state',async({page})=>{
 await page.route('**/api/config',r=>r.fulfill({json:{...config,configured:false}}));await page.goto('/');await expect(page.getByText(/setup/i).first()).toBeVisible();await expect(page.getByRole('button',{name:'Add time',exact:true})).toHaveCount(0);
});
test('sign-in is accessible and no workspace data is public',async({page})=>{await setup(page);await page.goto('/');await expect(page.getByLabel('Email address',{exact:true})).toBeVisible();await expect(page.getByLabel('Password',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();await expect(page.getByText('Brand Experience',{exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true)});
test('authenticated workspace books time and reloads persisted result',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const entries=await setup(page,true);await page.goto('/');await expect(page.getByRole('button',{name:'Add time',exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'Add time',exact:true}).first().click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await dialog.getByLabel('Hours',{exact:true}).fill('1');await dialog.getByLabel('Minutes',{exact:true}).fill('15');await dialog.getByLabel('Description',{exact:true}).fill('Konzeptarbeit');await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).not.toBeVisible();expect(entries).toHaveLength(1);expect(entries[0]).toMatchObject({minutes:75,note:'Konzeptarbeit',workspace_id:ws,project_id:project});await page.reload();await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect(page.getByText('Konzeptarbeit',{exact:true}).first()).toBeVisible();expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
test('database refusal never appears as a successful save',async({page})=>{
 await setup(page,true);await page.goto('/');await page.getByRole('button',{name:'Add time',exact:true}).first().click();await page.route('https://test.supabase.co/rest/v1/time_entries*',r=>r.request().method()==='POST'?r.fulfill({status:403,json:{code:'42501',message:'denied'}}):r.fallback());const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).toBeVisible();await expect(page.getByText(/permission/i).first()).toBeVisible();await expect(page.getByText('Saved.',{exact:true})).toHaveCount(0);
});

test('setup retry refreshes document CSP before connecting a newly configured backend',async({page})=>{
 await setup(page);
 let backendReady=false;let documents=0;let authRequests=0;
 await page.route('**/api/config',r=>r.fulfill({json:{...config,configured:backendReady}}));
 await page.context().route('http://localhost:4173/',async route=>{
  const response=await route.fetch();documents++;
  const headers=response.headers();
  if(documents===1)headers['content-security-policy']=headers['content-security-policy'].replace("connect-src 'self' https://test.supabase.co","connect-src 'self'");
  await route.fulfill({response,headers});
 });
 await page.route('https://test.supabase.co/auth/v1/token?*',r=>{
  authRequests++;
  return r.fulfill({status:400,json:{code:'invalid_credentials',msg:'Invalid login credentials'}});
 });
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Check connection again'})).toBeVisible();
 backendReady=true;
 await page.getByRole('button',{name:'Check connection again'}).click();
 await expect(page.getByLabel('Email address',{exact:true})).toBeVisible();
 expect(documents).toBe(2);
 await page.getByLabel('Email address',{exact:true}).fill('owner@example.test');
 await page.getByLabel('Password',{exact:true}).fill('a-test-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByText('The email or password is incorrect.',{exact:true})).toBeVisible();
 expect(authRequests).toBe(1);
});


test('primary system language falls back to English, explicit choices persist, and System restores detection',async({page})=>{
 await setup(page);
 await page.addInitScript(()=>{Object.defineProperty(navigator,'languages',{get:()=>['fr-FR','de-DE']});Object.defineProperty(navigator,'language',{get:()=> 'fr-FR'});});
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
 await pickOption(page.getByLabel('Language',{exact:true}),'Deutsch');
 await expect(page.getByRole('button',{name:'Anmelden',exact:true})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang','de-DE');
 await page.reload();
 await expect(page.getByLabel('Sprache',{exact:true})).toHaveAttribute('data-value','de');
 await pickOption(page.getByLabel('Sprache',{exact:true}),'简体中文');
 await expect(page.getByRole('button',{name:'登录',exact:true})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
 await page.reload();
 await expect(page.getByLabel('语言',{exact:true})).toHaveAttribute('data-value','zh');
 await pickOption(page.getByLabel('语言',{exact:true}),'系统语言');
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('vave-log.locale'))).toBeNull();
});

test('Chinese system variants choose Simplified Chinese',async({page})=>{
 await setup(page);
 await page.addInitScript(()=>Object.defineProperty(navigator,'languages',{get:()=>['zh-Hant-TW','en-US']}));
 await page.goto('/');
 await expect(page.getByLabel('邮箱地址',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'登录',exact:true})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
});

test('member navigation is translated and never requests financial records',async({page})=>{
 const financialRequests:string[]=[];
 page.on('request',request=>{if(/finance_|project_commercial|staff_rates/.test(request.url()))financialRequests.push(request.url());});
 await setup(page,true,'member');await page.goto('/');
 const nav=page.getByRole('navigation');
 await expect(nav.getByRole('button',{name:'Projects',exact:true})).toBeVisible();
 await expect(nav.getByRole('button',{name:'Team',exact:true})).toHaveCount(0);
 await pickOption(page.getByLabel('Language',{exact:true}),'简体中文');
 await expect(nav.getByRole('button',{name:'项目',exact:true})).toBeVisible();
 await expect(nav.getByRole('button',{name:'团队',exact:true})).toHaveCount(0);
 await nav.getByRole('button',{name:'项目',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Brand Experience',exact:true})).toBeVisible();
 expect(financialRequests).toEqual([]);
});

test('registration stores the selected email locale and preserves the submitted name',async({page})=>{
 await setup(page);let submitted:Record<string,unknown>|undefined;
 await page.route('https://test.supabase.co/auth/v1/signup*',async route=>{submitted=route.request().postDataJSON();await route.fulfill({json:{id:user,email:'new@example.test',user_metadata:{display_name:'Projekt',locale:'de'},identities:[]}});});
 await page.goto('/');await pickOption(page.getByLabel('Language',{exact:true}),'Deutsch');
 await page.getByRole('button',{name:'Jetzt registrieren',exact:true}).click();
 await page.getByLabel('Dein Name',{exact:true}).fill('Projekt');
 await page.getByLabel('E-Mail-Adresse',{exact:true}).fill('new@example.test');
 await page.getByLabel('Passwort').fill('a-strong-test-password');
 await page.getByRole('button',{name:'Account erstellen',exact:true}).click();
 await expect(page.getByText('Prüfe dein E-Mail-Postfach und bestätige deine Adresse über den Link. Anschließend kannst du dich anmelden.',{exact:true})).toBeVisible();
 expect(submitted?.data).toMatchObject({locale:'de',display_name:'Projekt'});
});

test('first start defaults to empty and opt-in demo populates actual team profiles',async({page})=>{
 await setup(page,true);let seeded=false;let input:Record<string,unknown>|undefined;
 const workspace={id:ws,name:'VAVE · Demo',timezone:'Europe/Berlin',currency:'EUR',created_by:user,created_at:'2026-10-13T09:00:00Z'};
 await page.route('https://test.supabase.co/rest/v1/workspaces*',r=>r.fulfill({json:seeded?[workspace]:[],headers:{'access-control-expose-headers':'content-range','content-range':seeded?'0-0/1':'0-0/0'}}));
 await page.route('https://test.supabase.co/rest/v1/rpc/demo_create_workspace',r=>{input=r.request().postDataJSON();seeded=true;return r.fulfill({json:workspace})});
 await page.route('https://test.supabase.co/rest/v1/workspace_demos*',r=>r.fulfill({json:seeded?{workspace_id:ws,created_by:user,request_id:input?.p_request_id,locale:'en',experience_version:DEMO_EXPERIENCE_VERSION,manifest_version:DEMO_MANIFEST.version,manifest:DEMO_MANIFEST,created_at:workspace.created_at,archived_at:null}:null}));
 await page.route('https://test.supabase.co/rest/v1/memberships*',r=>r.fulfill({json:[{workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:''},{workspace_id:ws,user_id:'55555555-5555-4555-8555-555555555555',role:'manager',display_name:'Tobias Geisler',email:'sample-1@example.invalid',created_at:'',is_demo:true,demo_title:'Co-Founder & CEO',demo_studio:'',demo_origin:'public'}]}));
 await page.goto('/');await expect(page.getByRole('radio',{name:/Start empty/})).toBeChecked();expect(input).toBeUndefined();
 await page.getByRole('radio',{name:/Explore with VAVE examples/}).check();
 await expect(page.getByRole('combobox',{name:'Currency',exact:true})).toBeDisabled();
 await pickOption(page.getByRole('combobox',{name:'Time zone',exact:true}),'Europe/Berlin','Europe/Berlin');
 await page.getByRole('button',{name:'Create workspace',exact:true}).click();
 await expect(page.getByText('DEMO WORKSPACE',{exact:true})).toHaveCount(0);
 await goArea(page,'Settings');
 await expect(page.getByText('DEMO WORKSPACE',{exact:true})).toBeVisible();
 await expect(page.getByText('Explore the public sources',{exact:true})).toHaveCount(0);
 await goArea(page,'Team');
 await expect(page.getByText('DEMO WORKSPACE',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('row').filter({hasText:'Tobias Geisler'})).toBeVisible();
 await expect(page.getByText('Sample profile · no login',{exact:true})).toBeVisible();
 const teamSearch=page.getByRole('searchbox',{name:'Search team',exact:true});
 await teamSearch.fill('tobias geisler');
 await expect(page.getByRole('row').filter({hasText:'Tobias Geisler'})).toBeVisible();
 await teamSearch.fill('niemand-heisst-so');
 await expect(page.getByText('No one found.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();
 await expect(teamSearch).toHaveValue('');
 await expect(page.getByRole('row').filter({hasText:'Tobias Geisler'})).toBeVisible();
 expect(input).toMatchObject({p_name:'VAVE · Demo',p_timezone:'Europe/Berlin',p_locale:'en'});expect(input?.p_request_id).toMatch(/^[0-9a-f-]{36}$/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('finance loads more than a thousand time entries and keeps million-euro metrics inside the viewport',async({page})=>{
 await setup(page,true);
 const people=Array.from({length:111},(_,i)=>`90000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
 const entries=Array.from({length:1105},(_,i)=>({id:`80000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,workspace_id:ws,project_id:project,user_id:people[i%people.length],work_date:'2026-10-13',minutes:5,note:'Fictional production time',billable:true,status:'approved',timer_id:null,created_at:'2026-10-13T09:00:00Z'}));
 const offsets:number[]=[];
 await page.route('https://test.supabase.co/rest/v1/time_entries*',route=>{
  const url=new URL(route.request().url()),st=url.searchParams.get('status'),pool=st?entries.filter(e=>`eq.${e.status}`===st):entries,offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000),slice=pool.slice(offset,offset+limit);offsets.push(offset);
  return route.fulfill({json:slice,headers:{'access-control-expose-headers':'content-range','content-range':`${offset}-${offset+slice.length-1}/${pool.length}`}});
 });
 await page.route('https://test.supabase.co/rest/v1/workspaces*',r=>new URL(r.request().url()).searchParams.get('select')==='currency'?r.fulfill({json:{currency:'EUR'}}):r.fallback());
 await page.route('https://test.supabase.co/rest/v1/finance_staff_rates*',r=>r.fulfill({json:people.map((person,i)=>({id:String(i),workspace_id:ws,user_id:person,kind:'employee',effective_from:'2026-01-01',cost_rate_minor:8000,bill_rate_minor:18500})),headers:{'access-control-expose-headers':'content-range','content-range':'0-110/111'}}));
 await page.route('https://test.supabase.co/rest/v1/finance_project_plans*',r=>r.fulfill({json:[{workspace_id:ws,project_id:project,client_id:null,billing_mode:'fixed',default_bill_rate_minor:18500,fixed_fee_minor:2255000000,planned_expenses_minor:563750000,lines:[{label:'Fictional annual production programme',kind:'employee',user_id:null,planned_minutes:7800000,cost_rate_minor:8000,bill_rate_minor:18500}],created_at:''}],headers:{'access-control-expose-headers':'content-range','content-range':'0-0/1'}}));
 await page.route('https://test.supabase.co/rest/v1/rpc/finance_list_invoices',r=>r.fulfill({json:[]}));
 await page.goto('/');await goArea(page,'Finance');
 await expect(page.locator('.finance-metric').filter({hasText:'22,550,000.00'})).toBeVisible();
 await expect(page.locator('.finance-metric').filter({hasText:'7,370.35'})).toBeVisible();
 expect(offsets.filter(x=>x===1000).length).toBeGreaterThanOrEqual(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('manager saves a real draft shape and must review before issuing',async({page})=>{
 await setup(page,true,'manager');const clientId='44444444-4444-4444-8444-444444444444';const invoices:Record<string,unknown>[]=[];let issued=0;let saved:Record<string,unknown>|undefined;
 await page.route('https://test.supabase.co/rest/v1/workspaces*',r=>new URL(r.request().url()).searchParams.get('select')==='currency'?r.fulfill({json:{currency:'EUR'}}):r.fallback());
 await page.route('https://test.supabase.co/rest/v1/finance_clients*',r=>r.fulfill({json:[{id:clientId,workspace_id:ws,name:'Test Client',billing_address:'Test street 1',contact_email:'',tax_id:'',language:'en',created_at:''}]}));
 await page.route('https://test.supabase.co/rest/v1/finance_billing_profiles*',r=>r.fulfill({json:{workspace_id:ws,legal_name:'Test Studio',billing_address:'Test street 2',tax_id:'TEST-ONLY',payment_details:'',invoice_prefix:'TEST',footer:''}}));
 await page.route('https://test.supabase.co/rest/v1/rpc/finance_list_invoices',r=>r.fulfill({json:invoices}));
 await page.route('https://test.supabase.co/rest/v1/rpc/finance_save_draft',r=>{saved=r.request().postDataJSON().p_input;const invoice={...saved,created_at:'2026-10-13T09:00:00Z',status:'draft',number:null,currency:'EUR',lines:[{...(saved!.lines as Record<string,unknown>[])[0],net_minor:25000,tax_minor:4750,total_minor:29750}],net_minor:25000,tax_minor:4750,total_minor:29750,issuer_snapshot:null,customer_snapshot:null,issued_at:null,cancellation_of:null,cancellation_id:null,cancellation_reason:'',paid:false};invoices.push(invoice);return r.fulfill({json:invoice})});
 await page.route('https://test.supabase.co/rest/v1/rpc/finance_issue_invoice',r=>{issued++;return r.fulfill({status:400,json:{code:'P0001',message:'FINANCE_CONFIGURATION'}})});
 await page.goto('/');await goArea(page,'Finance');
 await page.getByRole('tab',{name:'Invoices',exact:true}).click();await page.getByRole('button',{name:'Manual draft',exact:true}).click();
 let dialog=page.getByRole('dialog');await dialog.getByLabel('Description',{exact:true}).fill('Design workshop');await dialog.getByLabel('Quantity',{exact:true}).fill('2');await dialog.getByLabel('Unit price (EUR)',{exact:true}).fill('125');await dialog.getByLabel('Tax %',{exact:true}).fill('19');
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).not.toBeVisible();
 expect(saved).toMatchObject({workspace_id:ws,client_id:clientId,language:'en',lines:[{description:'Design workshop',quantity:2,unit_price_minor:12500,tax_basis_points:1900,time_entry_id:null,zero_tax_reason:''}]});expect(issued).toBe(0);
 await page.getByRole('button',{name:'Issue invoice',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();expect(issued).toBe(0);
 await dialog.getByRole('button',{name:'Issue invoice',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();expect(issued).toBe(1);await expect(dialog).toBeVisible();
});

test('a bank statement proposes matches, books only confirmed payments and recognises them on reload',async({page},testInfo)=>{
 await setup(page,true,'manager');const payments:Record<string,unknown>[]=[];
 const inv=(id:string,number:string,total:number,name:string)=>({id,workspace_id:ws,client_id:null,project_id:null,language:'en',issue_date:'2026-10-01',due_date:'2026-10-15',service_from:'2026-09-01',service_to:'2026-09-30',payment_instructions:'',notes:'',created_at:'2026-10-01T09:00:00Z',status:'issued',number,currency:'EUR',lines:[],net_minor:total,tax_minor:0,total_minor:total,issuer_snapshot:null,customer_snapshot:{id:'c',workspace_id:ws,name,billing_address:'',contact_email:'',tax_id:'',language:'en',created_at:''},issued_at:'2026-10-01T09:00:00Z',cancellation_of:null,cancellation_reason:'',paid:false,cancellation_id:null,paid_minor:0,payments:[] as Record<string,unknown>[]});
 const invoices=[inv('a0000000-0000-4000-8000-000000000001','RE-2026-0007',119000,'Müller & Söhne GmbH'),inv('a0000000-0000-4000-8000-000000000002','RE-2026-0008',50000,'Atelier Nord')];
 await page.route('https://test.supabase.co/rest/v1/workspaces*',r=>new URL(r.request().url()).searchParams.get('select')==='currency'?r.fulfill({json:{currency:'EUR'}}):r.fallback());
 await page.route('https://test.supabase.co/rest/v1/rpc/finance_list_invoices',r=>r.fulfill({json:invoices}));
 await page.route('https://test.supabase.co/rest/v1/rpc/finance_record_payment',r=>{const b=r.request().postDataJSON();payments.push(b);const i=invoices.find(x=>x.id===b.p_id)!;i.payments.push({id:'p'+payments.length,workspace_id:ws,invoice_id:i.id,paid_on:b.p_paid_on,amount_minor:b.p_amount_minor,note:b.p_note,created_at:''});i.paid_minor+=b.p_amount_minor;i.paid=i.paid_minor>=i.total_minor;return r.fulfill({json:i})});
 const csv='"Buchungstag";"Beguenstigter/Zahlungspflichtiger";"Verwendungszweck";"Betrag";"Waehrung"\n"14.10.26";"Müller & Söhne GmbH";"Rechnung RE-2026-0007";"1.190,00";"EUR"\n"14.10.26";"Unbekannt";"Spende";"500,00";"EUR"\n"13.10.26";"Stadtwerke";"Strom";"-82,10";"EUR"\n';
 await page.goto('/');await goArea(page,'Finance');await page.getByRole('tab',{name:'Invoices',exact:true}).click();
 await page.getByRole('button',{name:'Match bank statement',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Match bank statement'});
 await dialog.locator('input[type=file]').setInputFiles({name:'umsaetze.csv',mimeType:'text/csv',buffer:Buffer.from(csv,'utf8')});
 await expect(dialog.locator('.bank-summary')).toContainText('2 incoming payments · 1 matched · 1 debits ignored');
 const rows=dialog.locator('.bank-row');
 await expect(rows.nth(0)).toContainText('Müller & Söhne GmbH');await expect(rows.nth(0)).toContainText('Certain');await expect(rows.nth(0)).toContainText('invoice number · amount · client name');
 await expect(rows.nth(0).getByRole('checkbox')).toBeChecked();await expect(rows.nth(1).getByRole('checkbox')).toBeDisabled();
 await expect(rows.nth(0).getByLabel('Amount to book',{exact:true})).toHaveValue('1190.00');
 if(!testInfo.project.name.includes('mobile'))await page.screenshot({path:testInfo.outputPath('bank.png')});
 await dialog.getByRole('button',{name:'Book payments (1)',exact:true}).click();
 await expect(dialog.getByText('Payments booked: 1. The invoices are updated.',{exact:true})).toBeVisible();
 // Erst wenn die Rechnungsliste neu geladen ist (Dialog nicht mehr beschäftigt), erkennt der zweite Import die Buchung.
 await expect(dialog.getByRole('button',{name:'Close',exact:true})).toBeEnabled();
 expect(payments).toHaveLength(1);expect(payments[0]).toMatchObject({p_workspace_id:ws,p_id:invoices[0].id,p_paid_on:'2026-10-14',p_amount_minor:119000});expect(String(payments[0].p_note)).toMatch(/^Bank statement · Müller & Söhne GmbH · Rechnung RE-2026-0007 · ref:[0-9a-z]{12}$/);
 await dialog.locator('input[type=file]').setInputFiles({name:'umsaetze.csv',mimeType:'text/csv',buffer:Buffer.from(csv,'utf8')});
 await expect(dialog.locator('.bank-summary')).toContainText('2 incoming payments · 0 matched · 1 already booked');
 await expect(rows.nth(0)).toContainText('Already booked');
 await expect(dialog.getByRole('button',{name:'Book payments (0)',exact:true})).toBeDisabled();
 await dialog.locator('input[type=file]').setInputFiles({name:'bild.csv',mimeType:'text/csv',buffer:Buffer.from('a;b\n1;2','utf8')});
 await expect(dialog.getByText(/neither a CAMT statement nor a bank CSV/)).toBeVisible();
 expect(payments).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
test('client cards show contacts, remarks and key figures, and the editor manages several contact persons',async({page})=>{
 await setup(page,true,'manager');const clients:Record<string,unknown>[]=[];let saved:Record<string,unknown>|undefined;
 await page.route('https://test.supabase.co/rest/v1/workspaces*',r=>new URL(r.request().url()).searchParams.get('select')==='currency'?r.fulfill({json:{currency:'EUR'}}):r.fallback());
 await page.route('https://test.supabase.co/rest/v1/finance_clients*',r=>{if(r.request().method()==='POST'){saved=r.request().postDataJSON();const row:Record<string,unknown>={...saved,created_at:''};const i=clients.findIndex(c=>c.id===row.id);if(i>=0)clients[i]=row;else clients.push(row);return r.fulfill({json:row});}return r.fulfill({json:clients,headers:{'content-range':`0-${Math.max(0,clients.length-1)}/${clients.length}`,'access-control-expose-headers':'content-range'}});});
 await page.route('https://test.supabase.co/rest/v1/rpc/finance_list_invoices',r=>r.fulfill({json:clients.length?[{id:'a0000000-0000-4000-8000-000000000009',workspace_id:ws,client_id:clients[0].id,project_id:null,language:'de',issue_date:'2026-10-01',due_date:'2026-10-15',service_from:'2026-09-01',service_to:'2026-09-30',payment_instructions:'',notes:'',created_at:'',status:'issued',number:'RE-2026-0001',currency:'EUR',lines:[],net_minor:100000,tax_minor:19000,total_minor:119000,issuer_snapshot:null,customer_snapshot:null,issued_at:'',cancellation_of:null,cancellation_reason:'',paid:false,cancellation_id:null,paid_minor:19000,payments:[]}]:[]}));
 await page.goto('/');await goArea(page,'Finance');await page.getByRole('tab',{name:'Clients',exact:true}).click();
 await page.getByRole('button',{name:'New client',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Name',{exact:true}).first().fill('Müller & Söhne GmbH');
 await dialog.getByLabel('Customer number',{exact:true}).fill('K-1001');await dialog.getByLabel('Industry',{exact:true}).fill('Culture');
 await dialog.getByLabel('Email (invoices)',{exact:true}).fill('invoices@mueller.test');await dialog.getByLabel('Website',{exact:true}).fill('mueller.test');
 await dialog.getByRole('button',{name:'Add contact person',exact:true}).click();
 let rows=dialog.locator('.finance-contact-row');
 await rows.nth(0).getByLabel('Name',{exact:true}).fill('Anna Berg');await rows.nth(0).getByLabel('Role',{exact:true}).fill('Marketing');await rows.nth(0).getByLabel('Email',{exact:true}).fill('anna@mueller.test');
 await dialog.getByRole('button',{name:'Add contact person',exact:true}).click();
 await rows.nth(1).getByLabel('Name',{exact:true}).fill('Ben Kaya');await rows.nth(1).getByLabel('Phone',{exact:true}).fill('+49 30 1234');
 await rows.nth(1).getByRole('button',{name:'Make main contact',exact:true}).click();
 await expect(rows.nth(0).getByLabel('Name',{exact:true})).toHaveValue('Ben Kaya');
 await dialog.getByRole('button',{name:'Add contact person',exact:true}).click();
 await dialog.getByLabel('Remarks',{exact:true}).fill('Invoices only as PDF.\nCall before the 10th.');
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).not.toBeVisible();
 expect(saved).toMatchObject({name:'Müller & Söhne GmbH',customer_number:'K-1001',industry:'Culture',website:'mueller.test',contact_email:'invoices@mueller.test',notes:'Invoices only as PDF.\nCall before the 10th.',contacts:[{name:'Ben Kaya',phone:'+49 30 1234'},{name:'Anna Berg',role:'Marketing',email:'anna@mueller.test'}]});
 const card=page.locator('article.finance-client').filter({hasText:'Müller & Söhne GmbH'});
 await expect(card).toContainText('Customer number K-1001 · Culture');await expect(card).toContainText('Ben Kaya');await expect(card).toContainText('+1 more: Anna Berg');
 await expect(card).toContainText('Invoices only as PDF.');await expect(card.locator('.finance-client-facts')).toContainText('€1,190.00');await expect(card.locator('.finance-client-open')).toContainText('€1,000.00');
 await expect(card.getByRole('link',{name:'mueller.test',exact:true})).toHaveAttribute('href','https://mueller.test/');
 await card.getByRole('button',{name:'Edit: Müller & Söhne GmbH',exact:true}).click();
 rows=page.getByRole('dialog').locator('.finance-contact-row');await expect(rows).toHaveCount(2);
 await page.getByRole('dialog').getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
test('older demo expands once into team, approvals and usable marked invoices',async({page})=>{
 const entries=await setup(page,true);let upgraded=0;let issued=0;
 const person='55555555-5555-4555-8555-555555555555',customer='66666666-6666-4666-8666-666666666666',draftId='77777777-7777-4777-8777-777777777777';
 const profile={workspace_id:ws,legal_name:'VAVE Demo Studio — fictional',billing_address:'Example street 1',tax_id:'DEMO-NOT-VALID',payment_details:'Do not pay',invoice_prefix:'DEMO',footer:'DEMO — Not for payment'};
 const client={id:customer,workspace_id:ws,name:'Blue Current Foundation (fictional)',billing_address:'Example street 2',contact_email:'client@example.invalid',tax_id:'DEMO-NOT-VALID',language:'en',created_at:''};
 const line={description:'Sample spatial design',quantity:2,unit_price_minor:12500,tax_basis_points:1900,zero_tax_reason:'',time_entry_id:null,net_minor:25000,tax_minor:4750,total_minor:29750};
 const invoice:Record<string,unknown>={id:draftId,workspace_id:ws,client_id:customer,project_id:project,language:'en',currency:'EUR',issue_date:'2026-10-13',due_date:'2026-11-13',service_from:'2026-10-01',service_to:'2026-10-13',notes:'Fictional demo',payment_instructions:'Do not pay',lines:[line],net_minor:25000,tax_minor:4750,total_minor:29750,status:'draft',number:null,is_demo:true,created_at:'2026-10-13T09:00:00Z',issued_at:null,issuer_snapshot:null,customer_snapshot:null,cancellation_of:null,cancellation_id:null,cancellation_reason:'',paid:false};
 await page.route('https://test.supabase.co/rest/v1/workspace_demos*',r=>r.fulfill({json:{workspace_id:ws,created_by:user,request_id:ws,locale:'en',experience_version:upgraded?DEMO_EXPERIENCE_VERSION:2,manifest_version:DEMO_MANIFEST.version,manifest:DEMO_MANIFEST,created_at:'',archived_at:null}}));
 await page.route('https://test.supabase.co/rest/v1/memberships*',r=>r.fulfill({json:[{workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:''},...(upgraded?[{workspace_id:ws,user_id:person,role:'member',display_name:'Elena Weber',email:'elena@example.invalid',created_at:'',is_demo:true,demo_title:'Finance & Operations Lead',demo_studio:'Frankfurt',demo_origin:'fictional'}]:[])]}));
 await page.route('https://test.supabase.co/rest/v1/rpc/demo_upgrade_workspace',r=>{
  expect(r.request().postDataJSON()).toEqual({p_workspace_id:ws});upgraded++;
  entries.push({id:'88888888-8888-4888-8888-888888888888',workspace_id:ws,project_id:project,user_id:person,work_date:'2026-10-13',minutes:120,note:'Sample concept workshop',billable:true,status:'submitted',timer_id:null,created_at:''});return r.fulfill({json:null});
 });
 await page.route('https://test.supabase.co/rest/v1/rpc/review_entry',r=>{expect(r.request().postDataJSON().p_approve).toBe(true);entries[0].status='approved';return r.fulfill({json:entries[0]})});
 await page.route('https://test.supabase.co/rest/v1/workspaces*',r=>new URL(r.request().url()).searchParams.get('select')==='currency'?r.fulfill({json:{currency:'EUR'}}):r.fallback());
 await page.route('https://test.supabase.co/rest/v1/finance_clients*',r=>r.fulfill({json:[client]}));
 await page.route('https://test.supabase.co/rest/v1/finance_billing_profiles*',r=>r.fulfill({json:profile}));
 await page.route('https://test.supabase.co/rest/v1/rpc/finance_list_invoices',r=>r.fulfill({json:upgraded?[invoice]:[]}));
 await page.route('https://test.supabase.co/rest/v1/rpc/finance_issue_invoice',r=>{issued++;expect(r.request().postDataJSON()).toEqual({p_workspace_id:ws,p_id:draftId});Object.assign(invoice,{status:'issued',number:'DEMO-000001',issued_at:'2026-10-13T09:00:00Z',issuer_snapshot:profile,customer_snapshot:client});return r.fulfill({json:invoice})});
 await page.goto('/');await expect(page.getByRole('button',{name:'Complete demo',exact:true})).toHaveCount(0);
 await goArea(page,'Settings');
 await page.getByRole('button',{name:'Complete demo',exact:true}).click();
 await expect(page.getByRole('button',{name:'Complete demo',exact:true})).toHaveCount(0);expect(upgraded).toBe(1);
 const nav=page.getByRole('navigation');await goArea(page,'Team');
 await expect(page.getByRole('row').filter({hasText:'Elena Weber'})).toBeVisible();await expect(page.getByText('Sample profile · no login',{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await nav.getByRole('button',{name:/^Time/}).click();await page.getByRole('button',{name:'Team time',exact:true}).click();
 await page.getByRole('button',{name:/Approve.*Elena Weber/}).click();await expect(page.getByRole('row').filter({hasText:'Sample concept workshop'}).getByText('Approved',{exact:true})).toBeVisible();
 await goArea(page,'Finance');await page.getByRole('tab',{name:'Invoices',exact:true}).click();
 await page.getByRole('table').getByRole('button',{name:'Draft',exact:true}).click();await expect(page.getByText('DEMO — Not for payment',{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Issue sample invoice',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Issue sample invoice',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('No payment is due.');expect(issued).toBe(0);
 await dialog.getByRole('button',{name:'Issue sample invoice',exact:true}).click();await expect(dialog).not.toBeVisible();expect(issued).toBe(1);
 await expect(page.getByRole('button',{name:'DEMO-000001',exact:true})).toBeVisible();await expect(page.getByText('DEMO — Not for payment',{exact:true}).first()).toBeVisible();
 await page.reload();await goArea(page,'Settings');await expect(page.getByRole('button',{name:'Complete demo',exact:true})).toHaveCount(0);expect(upgraded).toBe(1);
});

const secondProject='99999999-9999-4999-8999-999999999999';
async function connectedSetup(page:Page,role:'owner'|'member'='owner'){
 await setup(page,true,role);
 let currentRole=role;const createdTasks:Record<string,unknown>[]=[];const savedProjects:Record<string,unknown>[]=[];
 const projects=[{id:project,workspace_id:ws,code:'VAV-001',name:'Brand Experience',client:'VAVE',budget_minutes:6000,status:'active',color:'#641dff',created_at:'2026-10-01T10:00:00Z',due_date:'2026-12-01',progress_percent:40,progress_updated_at:'2026-10-13T08:00:00Z'},{id:secondProject,workspace_id:ws,code:'VAV-002',name:'Museum Experience',client:'Museum',budget_minutes:12000,status:'active',color:'#229977',created_at:'2026-10-01T10:00:00Z'}];
 const tasks=[{id:'10000000-0000-4000-8000-000000000001',workspace_id:ws,project_id:project,title:'Brand sketch',status:'todo',assignee_id:user,due_date:'2026-10-12',created_by:user,created_at:''},{id:'10000000-0000-4000-8000-000000000002',workspace_id:ws,project_id:secondProject,title:'Museum prototype',status:'doing',assignee_id:null,due_date:'2026-10-13',created_by:user,created_at:''}];
 await page.route('https://test.supabase.co/rest/v1/projects*',r=>{
  if(r.request().method()==='POST'){const body=r.request().postDataJSON();savedProjects.push(body);Object.assign(projects.find(p=>p.id===body.id)!,body);return r.fulfill({json:{...projects.find(p=>p.id===body.id)}});}
  return r.fulfill({json:projects,headers:{'content-range':'0-1/2','access-control-expose-headers':'content-range'}});
 });
 await page.route('https://test.supabase.co/rest/v1/tasks*',r=>{
  if(r.request().method()==='POST'){const body=r.request().postDataJSON();createdTasks.push(body);tasks.push({...body,created_at:'',created_by:user});return r.fulfill({json:body});}
  return r.fulfill({json:tasks,headers:{'content-range':`0-${tasks.length-1}/${tasks.length}`,'access-control-expose-headers':'content-range'}});
 });
 await page.route('https://test.supabase.co/rest/v1/memberships*',r=>r.fulfill({json:[{workspace_id:ws,user_id:user,role:currentRole,display_name:'Studio Owner',email:'owner@example.test',created_at:''}],headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'}}));
 await page.route('https://test.supabase.co/rest/v1/workspaces*',r=>new URL(r.request().url()).searchParams.get('select')==='currency'?r.fulfill({json:{currency:'EUR'}}):r.fallback());
 await page.route('https://test.supabase.co/rest/v1/rpc/finance_list_invoices',r=>r.fulfill({json:[]}));
 const insight={project:projects[0],as_of:'2026-10-13',progress_date:'2026-10-13',total_minutes:2400,first_work_date:'2026-09-16',last_work_date:'2026-10-12',recent_daily:[{work_date:'2026-09-16',minutes:800},{work_date:'2026-10-05',minutes:800},{work_date:'2026-10-12',minutes:800}],tasks:{total:4,done:1,doing:1,overdue:1,estimated:4,estimated_minutes:6000,done_estimated_minutes:2400,missing_estimates:0,missing_due_dates:0,unassigned:0}};
 return {projects,tasks,createdTasks,savedProjects,insight,setRole:(role:'owner'|'member')=>{currentRole=role;}};
}

test('project links preserve task filters, editor defaults and browser history',async({page})=>{
 const state=await connectedSetup(page);await page.goto('/');const nav=page.getByRole('navigation',{name:'Main navigation'});
 await nav.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('button',{name:'Tasks: Brand Experience',exact:true}).click();
 await expect(page.getByLabel('Project',{exact:true})).toHaveAttribute('data-value',project);await expect(page.getByRole('button',{name:'Brand sketch',exact:true})).toBeVisible();await expect(page.getByText('Museum prototype',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'New task',exact:true}).click();let dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Project',{exact:true})).toHaveAttribute('data-value',project);await dialog.getByLabel('Task',{exact:true}).fill('Linked task');await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).not.toBeVisible();expect(state.createdTasks[0].project_id).toBe(project);
 await page.getByLabel('Search tasks',{exact:true}).fill('Linked');await expect(page.getByRole('button',{name:'Brand sketch',exact:true})).toHaveCount(0);await page.reload();await expect(page.getByLabel('Search tasks',{exact:true})).toHaveValue('Linked');await expect(page.getByRole('button',{name:'Linked task',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open project Brand Experience',exact:true}).click();await expect(page.getByRole('heading',{name:'Brand Experience',exact:true})).toBeVisible();await page.goBack();await expect(page.getByLabel('Search tasks',{exact:true})).toHaveValue('Linked');
 await page.getByRole('button',{name:'Open project Brand Experience',exact:true}).click();await page.getByRole('button',{name:'Add time',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Project',{exact:true})).toHaveAttribute('data-value',project);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('keyboard skip link preserves the active project and task filters',async({page})=>{
 await connectedSetup(page);await page.goto(`/#w=${ws}&view=tasks&project=${project}&q=sketch`);
 await expect(page.getByLabel('Search tasks',{exact:true})).toHaveValue('sketch');
 const url=page.url();await page.locator('.skip-link').focus();await page.keyboard.press('Enter');
 await expect(page.locator('#main')).toBeFocused();expect(page.url()).toBe(url);
 await expect(page.getByLabel('Project',{exact:true})).toHaveAttribute('data-value',project);await expect(page.getByLabel('Search tasks',{exact:true})).toHaveValue('sketch');
});

test('authorized workspace deep links survive reload and cross-workspace history',async({page})=>{
 const state=await connectedSetup(page);const other='77777777-7777-4777-8777-777777777777';
 await page.route('https://test.supabase.co/rest/v1/workspaces*',r=>r.fulfill({json:[{id:ws,name:'VAVE Studio',timezone:'Europe/Berlin',currency:'EUR',created_by:user,created_at:''},{id:other,name:'VAVE Shanghai',timezone:'Asia/Shanghai',currency:'EUR',created_by:user,created_at:''}]}));
 await page.route('https://test.supabase.co/rest/v1/projects*',r=>{const id=new URL(r.request().url()).searchParams.get('workspace_id')?.slice(3)??ws;return r.fulfill({json:state.projects.map(p=>({...p,workspace_id:id})),headers:{'content-range':'0-1/2','access-control-expose-headers':'content-range'}})});
 await page.route('https://test.supabase.co/rest/v1/memberships*',r=>{const id=new URL(r.request().url()).searchParams.get('workspace_id')?.slice(3)??ws;return r.fulfill({json:[{workspace_id:id,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:''}],headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'}})});
 await page.goto(`/#w=${other}&view=tasks&project=${project}&q=sketch`);
 await expect(page.locator('#workspace-select')).toHaveAttribute('data-value',other);await expect(page.getByLabel('Search tasks',{exact:true})).toHaveValue('sketch');
 await page.reload();await expect(page.locator('#workspace-select')).toHaveAttribute('data-value',other);await expect(page.getByLabel('Project',{exact:true})).toHaveAttribute('data-value',project);
 await pickOption(page.locator('#workspace-select'),'VAVE Studio');await expect(page.locator('#workspace-select')).toHaveAttribute('data-value',ws);await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Overview',exact:true})).toHaveAttribute('aria-current','page');
 await page.goBack();await expect(page.locator('#workspace-select')).toHaveAttribute('data-value',other);await expect(page.getByLabel('Project',{exact:true})).toHaveAttribute('data-value',project);await expect(page.getByLabel('Search tasks',{exact:true})).toHaveValue('sketch');
 await page.goto('/#w=missing&view=tasks');await expect(page.getByRole('heading',{name:'Workspace unavailable',exact:true})).toBeVisible();await expect(page.locator('#workspace-select')).toHaveCount(0);await page.getByRole('button',{name:'Open my workspace',exact:true}).click();await expect(page.locator('#workspace-select')).toHaveAttribute('data-value',ws);
});

test('inviting a member explains the next steps and can send a styled sign-in link email',async({page})=>{
 await setup(page,true);
 let invited:Record<string,unknown>|undefined;let otp:Record<string,unknown>|undefined;
 let invites=[{id:'55555555-5555-4555-8555-555555555555',workspace_id:ws,email:'offen@example.test',role:'manager',invited_by:user,created_at:'2026-10-01T10:00:00Z',expires_at:'2026-10-20T10:00:00Z'}];
 await page.route('https://test.supabase.co/rest/v1/rpc/invite_member',r=>{invited=r.request().postDataJSON();return r.fulfill({json:null})});
 await page.route('https://test.supabase.co/rest/v1/rpc/list_invitations',r=>r.fulfill({json:invites}));
 await page.route('https://test.supabase.co/rest/v1/rpc/revoke_invitation',r=>{invites=[];return r.fulfill({json:null})});
 await page.route('https://test.supabase.co/auth/v1/otp*',r=>{otp=r.request().postDataJSON();return r.fulfill({json:{}})});
 await page.goto('/');
 await goArea(page,'Team');
 await page.getByRole('button',{name:'Invite person',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByText('How the invited person continues:',{exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Copy invitation text',exact:true})).toBeVisible();
 const otpToggle=dialog.getByLabel('Send a sign-in link by email right away',{exact:true});
 await expect(otpToggle).not.toBeChecked();
 await otpToggle.check();
 await dialog.getByLabel('Email address',{exact:true}).fill('neu@example.test');
 await dialog.getByRole('button',{name:'Save invitation',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 await expect(page.getByText('Invitation stored and sign-in link sent by email.',{exact:true})).toBeVisible();
 expect(invited).toMatchObject({p_workspace_id:ws,p_email:'neu@example.test',p_role:'member'});
 expect(otp).toMatchObject({email:'neu@example.test',create_user:true});
 await expect(page.getByText('OPEN INVITATIONS',{exact:true})).toBeVisible();
 const row=page.locator('.invite-row').filter({hasText:'offen@example.test'});
 await expect(row.getByText(/valid until/)).toBeVisible();
 await row.getByRole('button',{name:'Revoke the invitation for offen@example.test',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Revoke invitation',exact:true}).click();
 await expect(page.getByText('OPEN INVITATIONS',{exact:true})).toHaveCount(0);
});

test('a running timer stays visible everywhere, minimizes and ticks in the tab title',async({page,isMobile})=>{
 await connectedSetup(page);
 await page.route('https://test.supabase.co/rest/v1/running_timers*',r=>r.fulfill({json:{id:'44444444-4444-4444-8444-444444444444',workspace_id:ws,project_id:project,user_id:user,started_at:'2026-10-13T08:30:00Z',note:'Focus block',billable:true}}));
 await page.goto('/');
 await expect(page.getByText('Your timer is running.',{exact:true})).toBeVisible();
 await expect(page.locator('.floating-timer')).toHaveCount(0);
 await expect(page).toHaveTitle(/^\u25B6 00:30:\d\d \u00B7 VAVE\.LOG$/);
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await nav.getByRole('button',{name:'Time',exact:true}).click();
 await expect(page.getByText('Your timer is running.',{exact:true})).toBeVisible();
 await expect(page.locator('.floating-timer')).toHaveCount(0);
 await expect(page.locator('.floating-timer-mini')).toHaveCount(0);
 await nav.getByRole('button',{name:'Tasks',exact:true}).click();
 const widget=page.locator('.floating-timer');
 await expect(widget).toBeVisible();
 const aboveBar=async(locator:ReturnType<Page['locator']>)=>{if(!isMobile)return;const bar=await page.locator('.sidebar nav').boundingBox();const box=await locator.boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(bar!.y+1);};
 await aboveBar(widget);
 await expect(widget.locator('.floating-clock')).toHaveText(/^00:30:\d\d$/);
 await expect(widget.getByRole('button',{name:'Brand Experience'})).toBeVisible();
 await widget.getByRole('button',{name:'Minimize timer',exact:true}).click();
 await expect(page.locator('.floating-timer')).toHaveCount(0);
 const mini=page.locator('.floating-timer-mini');
 await expect(mini).toBeVisible();
 await aboveBar(mini);
 await nav.getByRole('button',{name:'Projects',exact:true}).click();
 await expect(page.locator('.floating-timer-mini')).toBeVisible();
 await mini.click();
 await expect(page.locator('.floating-timer')).toBeVisible();
 await page.locator('.floating-timer').getByRole('button',{name:'Brand Experience'}).click();
 await expect(page.getByText('Your timer is running.',{exact:true})).toBeVisible();
 await expect(page.locator('.floating-timer')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('an expired email link explains itself and offers a fresh confirmation link',async({page})=>{
 await setup(page,false);
 let resend:Record<string,unknown>|null=null;
 await page.route('https://test.supabase.co/auth/v1/resend*',r=>{resend=r.request().postDataJSON();return r.fulfill({json:{}})});
 await page.goto('/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
 await expect(page.getByText(/The link has expired or was already used/)).toBeVisible();
 expect(page.url()).not.toContain('error_code');
 await page.getByRole('button',{name:'Request a new confirmation link',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Confirm once more.'})).toBeVisible();
 await expect(page.getByLabel('Password',{exact:true})).toHaveCount(0);
 await page.getByLabel('Email address',{exact:true}).fill('neu@example.test');
 await page.getByRole('button',{name:'Send new link',exact:true}).click();
 await expect(page.getByText(/a new confirmation link is on its way/)).toBeVisible();
 expect(resend).toMatchObject({type:'signup',email:'neu@example.test'});
});

test('a token-hash link from the confirmation email signs the person in on any device',async({page})=>{
 await setup(page,false);
 let verify:Record<string,unknown>|null=null;
 await page.route('https://test.supabase.co/auth/v1/verify',r=>{
  verify=r.request().postDataJSON();
  const payload=btoa(JSON.stringify({sub:user,aud:'authenticated',role:'authenticated',exp:2100000000,iss:'https://test.supabase.co/auth/v1'}));
  return r.fulfill({json:{access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.test`,token_type:'bearer',expires_in:3600,expires_at:2100000000,refresh_token:'test-refresh-token',user:{id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner',locale:'en'},created_at:'2026-10-01T10:00:00Z'}}});
 });
 await page.goto('/?token_hash=pkce_abc123&type=signup');
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
 expect(verify).toMatchObject({token_hash:'pkce_abc123',type:'signup'});
 expect(page.url()).not.toContain('token_hash');
});

test('help explains the tool: landing, search, article, context help and the global search all reach it',async({page})=>{
 await setup(page,true);await page.goto('/');
 await goArea(page,'Help');
 await expect(page.getByRole('heading',{name:'Everything you need to know.'})).toBeVisible();
 await expect(page.getByRole('button',{name:/Your first hours in five minutes/}).first()).toBeVisible();
 const search=page.getByRole('searchbox',{name:'Search help',exact:true});
 await search.fill('cancel invoice');
 await page.getByRole('button',{name:/Cancel an invoice \(GoBD\)/}).first().click();
 await expect(page.getByRole('heading',{name:'Cancel an invoice (GoBD)'})).toBeVisible();
 await expect(page.getByText('Needs the right “Finance”',{exact:true})).toBeVisible();
 await expect(page.getByText(/cancellation invoice with its own number/)).toBeVisible();
 await page.locator('.help-crumbs').getByRole('button',{name:'Help',exact:true}).click();
 await expect(search).toBeVisible();
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/^Time/}).click();
 await page.getByRole('button',{name:'Help for this area',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Add time by hand'})).toBeVisible();
 await page.getByRole('button',{name:'Go to area',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your time counts.'})).toBeVisible();
 await page.keyboard.press('Control+k');
 const palette=page.getByRole('combobox',{name:'Global search'});
 await palette.fill('glossary');
 await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Glossary'})).toBeVisible();
 await expect(page.getByText('GoBD',{exact:true}).first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('the phone bottom bar keeps four areas tappable and groups the rest behind More',async({page,isMobile})=>{
 await connectedSetup(page);await page.goto('/');
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 if(!isMobile){
  await expect(nav.getByRole('button',{name:'Settings',exact:true})).toBeVisible();
  await expect(page.locator('.nav-more')).toBeHidden();
  return;
 }
 for(const name of ['Overview','Projects','Tasks','Time','More'])await expect(nav.getByRole('button',{name,exact:true})).toBeVisible();
 for(const name of ['Reports','Team','Finance','Settings','Help'])await expect(nav.getByRole('button',{name,exact:true})).toHaveCount(0);
 await nav.getByRole('button',{name:'More',exact:true}).click();
 const sheet=page.locator('.nav-more-sheet');
 for(const name of ['Reports','Team','Finance','Settings','Help'])await expect(sheet.getByRole('button',{name,exact:true})).toBeVisible();
 await sheet.getByRole('button',{name:'Settings',exact:true}).click();
 await expect(sheet).toHaveCount(0);
 await expect(page.getByText('VAVE.LOG / SETTINGS',{exact:true})).toBeVisible();
 await expect(nav.getByRole('button',{name:'More',exact:true})).toHaveClass(/active/);
 await nav.getByRole('button',{name:'More',exact:true}).click();
 await page.keyboard.press('Escape');
 await expect(page.locator('.nav-more-sheet')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('the review queue surfaces old submissions and approvals can be revoked',async({page})=>{
 await connectedSetup(page);
 const team='70000000-0000-4000-8000-000000000001';
 const old={id:'80000000-0000-4000-8000-000000000042',workspace_id:ws,project_id:project,user_id:team,work_date:'2026-09-20',minutes:120,note:'September concept',billable:true,status:'submitted',timer_id:null,created_at:'2026-09-20T09:00:00Z'};
 await page.route('https://test.supabase.co/rest/v1/time_entries*',route=>{
  const url=new URL(route.request().url()),st=url.searchParams.get('status');
  const pool=st?[old].filter(e=>`eq.${e.status}`===st):(url.searchParams.get('work_date')&&`${url.searchParams.get('work_date')}`.includes('2026-09')?[old]:[old].filter(e=>e.work_date>='2026-10-01'));
  return route.fulfill({json:pool,headers:{'access-control-expose-headers':'content-range','content-range':`0-${Math.max(0,pool.length-1)}/${pool.length}`}});
 });
 await page.route('https://test.supabase.co/rest/v1/rpc/review_entry',r=>{old.status='approved';return r.fulfill({json:{...old}})});
 let revoked=0;
 await page.route('https://test.supabase.co/rest/v1/rpc/revoke_approval',r=>{revoked++;old.status='draft';return r.fulfill({json:{...old}})});
 await page.goto('/');
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await nav.getByRole('button',{name:/^Time\b/}).click();
 await expect(page.getByText(/1 submitted entr/).first()).toBeVisible();
 await page.getByRole('button',{name:'Show all pending reviews',exact:true}).click();
 await expect(page.getByText('September concept',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Approve/}).click();
 await pickOption(page.getByRole('combobox',{name:'Filter time status',exact:true}),'All statuses');
 await expect(page.getByRole('button',{name:/Revoke approval for/})).toBeVisible();
 await page.getByRole('button',{name:/Revoke approval for/}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByText(/becomes a draft again/)).toBeVisible();
 await dialog.getByRole('button',{name:'Revoke approval',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 expect(revoked).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('task cards drag between columns like a kanban board, with escape and a plain click still opening the editor',async({page,isMobile})=>{
 const state=await connectedSetup(page);const saved:Record<string,unknown>[]=[];
 await page.route('https://test.supabase.co/rest/v1/tasks*',async r=>{if(r.request().method()!=='POST')return r.fallback();const body=r.request().postDataJSON();saved.push(body);Object.assign(state.tasks.find(x=>x.id===body.id)!,body);await new Promise(done=>setTimeout(done,150));return r.fulfill({json:{...body,created_at:'',created_by:user}});});
 await page.goto('/');await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Tasks',exact:true}).click();
 const card=page.locator('[data-task-card="10000000-0000-4000-8000-000000000001"]');const doing=page.locator('section[data-drop-status="doing"]');
 await expect(card).toBeVisible();
 const drag=async(target:import('@playwright/test').Locator,finish:'drop'|'escape')=>{
  await card.evaluate(el=>el.scrollIntoView({block:'center'}));
  const from=(await card.boundingBox())!,to=(await target.boundingBox())!;
  await page.mouse.move(from.x+8,from.y+8);await page.mouse.down();
  // Touch: erst nach kurzem Halten wird gezogen, damit Wischen weiter scrollt.
  if(isMobile)await page.waitForTimeout(320);
  await page.mouse.move(from.x+28,from.y+20,{steps:4});
  await expect(page.locator('.task-card-ghost')).toBeVisible();await expect(card).toHaveClass(/task-card-placeholder/);
  await page.mouse.move(to.x+to.width/2,to.y+40,{steps:12});
  await expect(target).toHaveClass(/drop-target/);await expect(target.locator('.task-drop-slot')).toBeVisible();
  if(finish==='escape'){await page.keyboard.press('Escape');await page.mouse.up();}else await page.mouse.up();
 };
 await drag(doing,'escape');
 await expect(page.locator('.task-card-ghost')).toHaveCount(0);await expect(page.locator('section[data-drop-status="todo"]').getByText('Brand sketch',{exact:true})).toBeVisible();expect(saved).toHaveLength(0);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await drag(doing,'drop');
 await expect(doing.getByText('Brand sketch',{exact:true})).toBeVisible();
 await expect(page.locator('.task-card-ghost')).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect.poll(()=>saved.length).toBe(1);expect(saved[0]).toMatchObject({id:'10000000-0000-4000-8000-000000000001',status:'doing',title:'Brand sketch'});
 await expect(page.getByText('Task status updated.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Brand sketch',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
});
test('task quick and advanced filters explain empty results and reset cleanly',async({page})=>{
 await connectedSetup(page);await page.goto('/');await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Tasks',exact:true}).click();
 await page.getByRole('button',{name:'Overdue',exact:true}).click();await expect(page.getByRole('button',{name:'Brand sketch',exact:true})).toBeVisible();await expect(page.getByText('Museum prototype',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'More filters',exact:true}).click();await pickOption(page.getByLabel('Assignee',{exact:true}),'Unassigned');await expect(page.getByText('No tasks match these filters.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Remove filter: Overdue',exact:true}).click();await expect(page.getByRole('button',{name:'Museum prototype',exact:true})).toBeVisible();await page.getByRole('button',{name:'Reset filters',exact:true}).click();await expect(page.getByRole('button',{name:'Brand sketch',exact:true})).toBeVisible();
 await pickOption(page.getByLabel('Language',{exact:true}),'简体中文');await expect(page.getByLabel('搜索任务',{exact:true})).toBeVisible();await pickOption(page.getByLabel('语言',{exact:true}),'Deutsch');await expect(page.getByLabel('Aufgaben durchsuchen',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('project analysis loads all-time facts, retries and opens scoped finance with back navigation',async({page})=>{
 const state=await connectedSetup(page);let attempts=0;
 await page.route('https://test.supabase.co/rest/v1/rpc/project_insight',r=>{expect(r.request().postDataJSON()).toEqual({p_workspace_id:ws,p_project_id:project});attempts++;return attempts===1?r.fulfill({status:503,json:{message:'unavailable'}}):r.fulfill({json:state.insight});});
 await page.goto('/');await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('button',{name:'Project outlook: Brand Experience',exact:true}).click();let dialog=page.getByRole('dialog');await expect(dialog.getByRole('alert')).toBeVisible();await dialog.getByRole('button',{name:'Try again',exact:true}).click();await expect(dialog.getByText('Scenario within deadline',{exact:true})).toBeVisible();await expect(dialog.getByText('40 hr',{exact:true})).toBeVisible();await dialog.getByText('How this is calculated',{exact:true}).click();await expect(dialog.getByText(/Task counts are unweighted/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await dialog.getByRole('button',{name:'Planning',exact:true}).click();await expect(page.getByRole('tab',{name:'Planning & costs',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.locator('.finance-project-filter [role="combobox"]')).toHaveAttribute('data-value',project);
 await page.getByRole('tab',{name:'Invoices',exact:true}).click();await expect(page.locator('.finance-project-filter [role="combobox"]')).toHaveAttribute('data-value',project);await page.goBack();await expect(page.getByRole('tab',{name:'Planning & costs',exact:true})).toHaveAttribute('aria-selected','true');await page.reload();await expect(page.locator('.finance-project-filter [role="combobox"]')).toHaveAttribute('data-value',project);
 await page.getByRole('tab',{name:'Clients',exact:true}).click();await page.reload();await expect(page.getByRole('tab',{name:'Clients',exact:true})).toHaveAttribute('aria-selected','true');
 expect(attempts).toBe(2);
});

test('planning saves the deadline and preserves the legacy assessment without asking for manual progress',async({page})=>{
 const state=await connectedSetup(page);await page.goto('/');await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('button',{name:'Edit Brand Experience',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Project deadline',{exact:true}).fill('2026-11-30');await expect(dialog.getByLabel('Reported progress (%)',{exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).not.toBeVisible();expect(state.savedProjects[0]).toMatchObject({id:project,due_date:'2026-11-30'});expect(state.savedProjects[0]).not.toHaveProperty('progress_percent');expect(state.savedProjects[0]).not.toHaveProperty('progress_updated_at');
});

test('unknown project links stay empty and member views never request project aggregates',async({page})=>{
 await connectedSetup(page,'member');let insights=0;page.on('request',r=>{if(r.url().includes('project_insight'))insights++;});await page.goto(`/#w=${ws}&view=tasks&project=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);await expect(page.getByRole('heading',{name:'Project unavailable',exact:true})).toBeVisible();await expect(page.getByText('Brand sketch',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Show all projects',exact:true}).click();await expect(page.getByRole('button',{name:'Brand sketch',exact:true})).toBeVisible();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Projects',exact:true}).click();await expect(page.getByRole('button',{name:/Project outlook:/})).toHaveCount(0);expect(insights).toBe(0);
});

test('role downgrade closes analysis and ignores an in-flight aggregate response',async({page})=>{
 const state=await connectedSetup(page);let release:(()=>void)|undefined;let started=false;
 await page.route('https://test.supabase.co/rest/v1/rpc/project_insight',async r=>{started=true;await new Promise<void>(resolve=>{release=resolve});await r.fulfill({json:state.insight});});
 await page.goto('/');await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('button',{name:'Project outlook: Brand Experience',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect.poll(()=>started).toBe(true);state.setRole('member');await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.getByRole('dialog')).toHaveCount(0);release?.();await expect(page.getByText('40 hr',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:/Project outlook:/})).toHaveCount(0);
});

test('timers start straight from project cards, task cards and the time dialog, switching only after confirmation',async({page})=>{
 await connectedSetup(page);let timer:Record<string,unknown>|null=null;const calls:{fn:string;body:Record<string,unknown>}[]=[];
 await page.route('https://test.supabase.co/rest/v1/running_timers*',r=>r.fulfill({json:timer}));
 await page.route('https://test.supabase.co/rest/v1/rpc/start_timer',r=>{const body=r.request().postDataJSON();calls.push({fn:'start',body});timer={id:'45454545-4545-4545-8545-454545454545',workspace_id:ws,project_id:body.p_project_id,user_id:user,started_at:calls.length===1?'2026-10-13T09:00:00Z':'2026-10-13T08:55:00Z',note:body.p_note,billable:body.p_billable,task_id:body.p_task_id};return r.fulfill({json:timer});});
 await page.route('https://test.supabase.co/rest/v1/rpc/stop_timer',r=>{calls.push({fn:'stop',body:r.request().postDataJSON()});timer=null;return r.fulfill({json:[]});});
 await page.route('https://test.supabase.co/rest/v1/rpc/discard_timer',r=>{calls.push({fn:'discard',body:r.request().postDataJSON()});timer=null;return r.fulfill({json:null});});
 await page.goto('/');const nav=page.getByRole('navigation',{name:'Main navigation'});
 await nav.getByRole('button',{name:'Projects',exact:true}).click();
 await page.getByRole('button',{name:'Start timer for Brand Experience',exact:true}).click();
 await expect(page.getByText('Timer running for VAV-001 · Brand Experience.',{exact:true})).toBeVisible();
 expect(calls).toEqual([{fn:'start',body:{p_workspace_id:ws,p_project_id:project,p_note:'',p_billable:true,p_task_id:null}}]);
 await expect(page.locator('.project-card',{hasText:'Brand Experience'}).getByText('Timer running',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Start timer for Brand Experience',exact:true})).toHaveCount(0);

 // Aufgabe: läuft schon ein Timer, wird erst nach Rückfrage gewechselt.
 await nav.getByRole('button',{name:'Tasks',exact:true}).click();
 await page.getByRole('button',{name:'Start timer for Museum prototype',exact:true}).click();
 let dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Switch timer?'})).toBeVisible();
 await expect(dialog).toContainText('The running timer for VAV-001 · Brand Experience is shorter than one minute and will be discarded.');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect(calls).toHaveLength(1);
 await page.getByRole('button',{name:'Start timer for Museum prototype',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Switch and start',exact:true}).click();
 await expect(page.getByText('Timer running for VAV-002 · Museum Experience · Museum prototype.',{exact:true})).toBeVisible();
 expect(calls.slice(1)).toEqual([{fn:'discard',body:{p_timer_id:'45454545-4545-4545-8545-454545454545'}},{fn:'start',body:{p_workspace_id:ws,p_project_id:secondProject,p_note:'',p_billable:true,p_task_id:'10000000-0000-4000-8000-000000000002'}}]);
 await expect(page.getByRole('button',{name:'Start timer for Museum prototype',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Museum prototype',exact:true}).click();dialog=page.getByRole('dialog');
 await expect(dialog.getByText('Timer running',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();

 // Zeit-Dialog: dieselben Angaben, aber live mitstoppen.
 await nav.getByRole('button',{name:'Projects',exact:true}).click();
 await page.locator('.project-card',{hasText:'Brand Experience'}).getByRole('button',{name:'Add time',exact:true}).click();
 dialog=page.getByRole('dialog');await dialog.getByLabel('Description',{exact:true}).fill('Pitch deck');await dialog.getByLabel('Billable',{exact:true}).uncheck();
 await dialog.getByRole('button',{name:'Start a timer instead',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Switch and start',exact:true}).click();
 await expect(page.getByText('Timer running for VAV-001 · Brand Experience.',{exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(calls.slice(3)).toEqual([{fn:'stop',body:{p_timer_id:'45454545-4545-4545-8545-454545454545'}},{fn:'start',body:{p_workspace_id:ws,p_project_id:project,p_note:'Pitch deck',p_billable:false,p_task_id:null}}]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('holiday locations are set per person and as workspace default, and the utilization report counts public holidays',async({page})=>{
 await connectedSetup(page);const calls:{fn:string;body:Record<string,unknown>}[]=[];let location:string|null=null,defaultLocation:string|null=null;
 await page.route('https://test.supabase.co/rest/v1/memberships*',r=>r.fulfill({json:[{workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:'',weekly_capacity_minutes:2400,location}],headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'}}));
 await page.route('https://test.supabase.co/rest/v1/rpc/set_member_location',r=>{const body=r.request().postDataJSON();calls.push({fn:'member',body});location=body.p_location;return r.fulfill({json:{workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:'',location}});});
 await page.route('https://test.supabase.co/rest/v1/rpc/set_workspace_location',r=>{const body=r.request().postDataJSON();calls.push({fn:'workspace',body});defaultLocation=body.p_location;return r.fulfill({json:{id:ws,name:'VAVE Studio',timezone:'Europe/Berlin',currency:'EUR',created_by:user,created_at:'2026-10-01T10:00:00Z',default_location:defaultLocation}});});
 await page.route('https://test.supabase.co/rest/v1/absences*',r=>r.fulfill({json:[],headers:{'content-range':'*/0','access-control-expose-headers':'content-range'}}));
 await page.goto('/');await goArea(page,'Team');
 const cell=page.getByLabel('Location of Studio Owner',{exact:true});await expect(cell).toContainText('Default: no location');
 await pickOption(cell,/^Baden-Württemberg/,'Baden');
 await expect(page.getByText('Location saved.',{exact:true})).toBeVisible();
 expect(calls).toEqual([{fn:'member',body:{p_workspace_id:ws,p_user_id:user,p_location:'DE-BW'}}]);
 await expect(page.getByLabel('Location of Studio Owner',{exact:true})).toContainText('Baden-Württemberg');
 await goArea(page,'Settings');
 await pickOption(page.getByLabel('Default location (public holidays)',{exact:true}),/^Bayern/,'Bay');
 await expect(page.getByText('Location saved.',{exact:true}).first()).toBeVisible();
 expect(calls[1]).toEqual({fn:'workspace',body:{p_workspace_id:ws,p_location:'DE-BY'}});
 // Mai 2026: Tag der Arbeit (Fr 1.5.), Christi Himmelfahrt (Do 14.5.), Pfingstmontag (25.5.), Fronleichnam (Do 4.6.) liegt außerhalb.
 await page.goto(`/#w=${ws}&view=reports`);await page.getByRole('button',{name:/10\/12 – 10\/18/}).click();await page.getByLabel('From',{exact:true}).fill('2026-05-01');await page.getByLabel('To',{exact:true}).fill('2026-05-31');await page.getByRole('button',{name:'Apply',exact:true}).click();
 await expect(page.getByRole('columnheader',{name:'Public holidays'})).toBeVisible();
 const row=page.locator('table').filter({hasText:'Public holidays'}).locator('tbody tr').first();
 await expect(row).toContainText('Studio Owner');
 await expect(row.locator('td').nth(3)).toHaveText('3');
});

test('absences: calendar, request with preview, approval and the yearly account',async({page})=>{
 await connectedSetup(page);const other='20000000-0000-4000-8000-000000000002';
 let absences:Record<string,unknown>[]=[{id:'30000000-0000-4000-8000-000000000001',workspace_id:ws,user_id:other,starts_on:'2026-10-19',ends_on:'2026-10-23',kind:'vacation',note:'Herbst',status:'requested',half_day:'',created_at:''}];
 const posted:Record<string,unknown>[]=[],patched:Record<string,unknown>[]=[];
 await page.route('https://test.supabase.co/rest/v1/memberships*',r=>r.fulfill({json:[{workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:'',vacation_days_per_year:30,location:'DE-BW'},{workspace_id:ws,user_id:other,role:'member',display_name:'Mara Lenz',email:'mara@example.test',created_at:'',vacation_days_per_year:28}],headers:{'content-range':'0-1/2','access-control-expose-headers':'content-range'}}));
 await page.route('https://test.supabase.co/rest/v1/absences*',r=>{const m=r.request().method();if(m==='POST'){const body=r.request().postDataJSON();posted.push(body);const row={...body,id:'30000000-0000-4000-8000-00000000000'+(posted.length+1),status:'approved',created_at:''};absences.push(row);return r.fulfill({json:row});}if(m==='PATCH'){const body=r.request().postDataJSON();patched.push(body);const id=new URL(r.request().url()).searchParams.get('id')!.replace('eq.','');absences=absences.map(a=>a.id===id?{...a,...body}:a);return r.fulfill({json:absences.find(a=>a.id===id)});}return r.fulfill({json:absences,headers:{'content-range':`0-${absences.length-1}/${absences.length}`,'access-control-expose-headers':'content-range'}});});
 await page.route('https://test.supabase.co/rest/v1/vacation_balances*',r=>r.fulfill({json:[{workspace_id:ws,user_id:user,year:2026,carried_over:3,adjustment:0,note:''}],headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'}}));
 await page.goto('/');await goArea(page,'Absences');
 await expect(page.getByRole('heading',{level:1,name:'Who is in when.'})).toBeVisible();
 await expect(page.getByText('October 2026',{exact:true})).toBeVisible();
 // Offener Antrag von Mara mit Tagen und Rest, dann Genehmigung.
 const request=page.locator('.absence-request');await expect(request).toContainText('Mara Lenz');await expect(request).toContainText('5 workdays');await expect(request).toContainText('Remaining afterwards: 23 days');
 await request.getByRole('button',{name:'Approve',exact:true}).click();await expect(page.getByText('Request approved.',{exact:true})).toBeVisible();
 expect(patched).toEqual([{status:'approved'}]);
 await expect(page.locator('.absence-request')).toHaveCount(0);
 await expect(page.locator('.absence-grid tbody tr').nth(1).locator('td.cal-vacation.cal-approved')).toHaveCount(5);
 // Eigener Eintrag als Leitung: Vorschau zählt Feiertage des Standorts (Allerheiligen So 1.11. zählt nicht; 2.–6.11. = 5 Tage).
 await page.getByRole('button',{name:'Add absence',exact:true}).click();
 await page.getByLabel('From',{exact:true}).fill('2026-10-30');await page.getByLabel('To',{exact:true}).fill('2026-11-06');
 await expect(page.locator('.absence-preview')).toContainText('Counts 6 workdays');await expect(page.locator('.absence-preview')).toContainText('Remaining afterwards: 27 days');
 await page.getByLabel('Note',{exact:true}).fill('Herbstferien');
 await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('Absence recorded.',{exact:true})).toBeVisible();
 expect(posted[0]).toMatchObject({workspace_id:ws,user_id:user,starts_on:'2026-10-30',ends_on:'2026-11-06',kind:'vacation',note:'Herbstferien',half_day:''});
 // Urlaubskonto: 30 + 3 Übertrag − 6 genommen = 27.
 const account=page.locator('table').filter({hasText:'Carry-over'});const own=account.locator('tbody tr').filter({hasText:'Studio Owner'});
 await expect(own.locator('td').last()).toHaveText('27');
 await expect(page.locator('.absence-grid tbody tr').first().locator('td.cal-vacation')).toHaveCount(2); // 30. und 31.10. im Oktoberraster (Sa 31. ist Wochenende, bleibt markiert)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('work schedule dialog saves the model and the time account shows target, actual and flextime balance',async({page})=>{
 await connectedSetup(page);const calls:Record<string,unknown>[]=[];
 let membership:Record<string,unknown>={workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:'',weekly_capacity_minutes:2400,location:'DE-BW'};
 await page.route('https://test.supabase.co/rest/v1/memberships*',r=>r.fulfill({json:[membership],headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'}}));
 await page.route('https://test.supabase.co/rest/v1/rpc/set_work_schedule',r=>{const body=r.request().postDataJSON();calls.push(body);membership={...membership,work_schedule:body.p_schedule,weekly_capacity_minutes:(body.p_schedule as number[]).reduce((a,b)=>a+b,0),balance_start_on:body.p_balance_start_on,balance_start_minutes:body.p_balance_start_minutes};return r.fulfill({json:membership});});
 await page.route('https://test.supabase.co/rest/v1/absences*',r=>r.fulfill({json:[],headers:{'content-range':'*/0','access-control-expose-headers':'content-range'}}));
 await page.route('https://test.supabase.co/rest/v1/time_entries*',r=>{const from=new URL(r.request().url()).searchParams.get('work_date')??'';const rows=[{id:'20000000-0000-4000-8000-000000000011',workspace_id:ws,project_id:project,user_id:user,work_date:'2026-10-12',minutes:540,note:'Mo',billable:true,status:'draft',timer_id:null,created_at:''},{id:'20000000-0000-4000-8000-000000000012',workspace_id:ws,project_id:project,user_id:user,work_date:'2026-10-06',minutes:300,note:'Vorwoche',billable:true,status:'approved',timer_id:null,created_at:''}].filter(e=>!from.startsWith('gte.')||e.work_date>=from.slice(4));return r.fulfill({json:rows,headers:{'content-range':`0-${rows.length-1}/${rows.length}`,'access-control-expose-headers':'content-range'}});});
 await page.goto('/');await goArea(page,'Team');
 await page.getByRole('button',{name:'Work schedule of Studio Owner',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Work schedule: Studio Owner'})).toBeVisible();
 await expect(dialog).toContainText('40:00 h per week');
 await dialog.getByLabel('Fri',{exact:true}).fill('0');await expect(dialog).toContainText('32:00 h per week');
 await dialog.getByLabel('Time account from (start date)',{exact:true}).fill('2026-10-05');await dialog.getByLabel('Opening balance on the start date (hours)',{exact:true}).fill('2');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('Work schedule saved.',{exact:true})).toBeVisible();
 expect(calls).toEqual([{p_workspace_id:ws,p_user_id:user,p_schedule:[480,480,480,480,0,0,0],p_balance_start_on:'2026-10-05',p_balance_start_minutes:120}]);
 await expect(page.getByRole('button',{name:'Work schedule of Studio Owner',exact:true})).toHaveText('Schedule');
 // Zeiten: Woche 12.–18.10. Soll 4×8 h = 32 h, Ist 9 h; Saldo seit 5.10. bis heute (13.10.): 2 h + (14 h Ist − 48 h Soll) = −32 h.
 await page.goto(`/#w=${ws}&view=time`);
 await expect(page.getByText('YOUR TIME ACCOUNT',{exact:true})).toBeVisible();
 const account=page.locator('.time-account');
 await expect(account).toContainText('Target in period');await expect(account.locator('.metric').nth(0)).toContainText('32:00 h');
 await expect(account.locator('.metric').nth(1)).toContainText('9:00 h');await expect(account.locator('.metric').nth(1)).toContainText('Difference: −23:00 h');
 await expect(account.locator('.metric').nth(2)).toContainText('−32:00 h');await expect(account.locator('.metric').nth(2)).toContainText('since Mon, Oct 5');
 await expect(account.locator('.account-day')).toHaveCount(7);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('planning cockpit shows load per person and week and reassigns a task from the cell',async({page})=>{
 await connectedSetup(page);const saved:Record<string,unknown>[]=[];
 const tasks=[{id:'10000000-0000-4000-8000-000000000001',workspace_id:ws,project_id:project,title:'Brand sketch',status:'todo',assignee_id:user,due_date:'2026-10-16',estimated_minutes:600,created_by:user,created_at:''},{id:'10000000-0000-4000-8000-000000000002',workspace_id:ws,project_id:secondProject,title:'Museum prototype',status:'doing',assignee_id:null,due_date:'2026-10-13',estimated_minutes:480,created_by:user,created_at:''},{id:'10000000-0000-4000-8000-000000000003',workspace_id:ws,project_id:project,title:'Open end',status:'todo',assignee_id:user,due_date:null,estimated_minutes:null,created_by:user,created_at:''}];
 await page.route('https://test.supabase.co/rest/v1/tasks*',r=>{if(r.request().method()==='POST'){const body=r.request().postDataJSON();saved.push(body);Object.assign(tasks.find(x=>x.id===body.id)!,body);return r.fulfill({json:body});}return r.fulfill({json:tasks,headers:{'content-range':`0-${tasks.length-1}/${tasks.length}`,'access-control-expose-headers':'content-range'}});});
 await page.route('https://test.supabase.co/rest/v1/memberships*',r=>r.fulfill({json:[{workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:'',weekly_capacity_minutes:2400,location:'DE-BW'}],headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'}}));
 await page.route('https://test.supabase.co/rest/v1/task_effort*',r=>r.fulfill({json:[{task_id:'10000000-0000-4000-8000-000000000001',minutes:120,entries:1,last_work_date:'2026-10-12'}],headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'}}));
 await page.route('https://test.supabase.co/rest/v1/absences*',r=>r.fulfill({json:[],headers:{'content-range':'*/0','access-control-expose-headers':'content-range'}}));
 await page.goto('/');await goArea(page,'Planning');
 await expect(page.getByRole('heading',{level:1,name:'Who has room, where it gets tight.'})).toBeVisible();
 // Woche 12.–18.10.: Brand sketch Rest 480 (600 − 120) bis Fr 16.10. → 8 h von 40 h; „Open end“ ohne Schätzung zählt als +1?.
 const own=page.getByRole('button',{name:/^Studio Owner, 10\/12 – 10\/18/});
 await expect(own).toContainText('8 / 40 h');await expect(own).toContainText('20 %');await expect(own).toContainText('+1?');
 const unassigned=page.getByRole('button',{name:/^Unassigned, 10\/12 – 10\/18/});
 await expect(unassigned).toContainText('8:00 h');
 await unassigned.click();
 const detail=page.locator('.planning-detail');await expect(detail).toContainText('Museum prototype');await expect(detail).toContainText('8:00 h this week');
 await pickOption(detail.getByLabel('Assignee for Museum prototype',{exact:true}),'Studio Owner');
 await detail.getByRole('button',{name:'Save change',exact:true}).click();
 await expect(page.getByText('Task rescheduled.',{exact:true})).toBeVisible();
 expect(saved).toEqual([expect.objectContaining({id:'10000000-0000-4000-8000-000000000002',assignee_id:user,due_date:'2026-10-13',estimated_minutes:480,status:'doing'})]);
 await expect(page.getByRole('button',{name:/^Studio Owner, 10\/12 – 10\/18/})).toContainText('16 / 40 h');
 await expect(page.getByRole('button',{name:/^Unassigned, 10\/12 – 10\/18/})).toContainText('–');
 // Übersicht: Meine Woche.
 await page.goto(`/#w=${ws}&view=overview`);await expect(page.getByText('MY WEEK',{exact:true})).toBeVisible();
 const week=page.locator('.my-week-grid');await expect(week).toContainText('40:00 h');await expect(week).toContainText('16:00 h');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('long-term outlook stacks project demand against team supply and applies a scenario without saving',async({page})=>{
 await connectedSetup(page);
 await page.route('https://test.supabase.co/rest/v1/memberships*',r=>r.fulfill({json:[{workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:'',weekly_capacity_minutes:2400,location:'DE-BW'}],headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'}}));
 await page.route('https://test.supabase.co/rest/v1/finance_project_plans*',r=>r.fulfill({json:[{workspace_id:ws,project_id:project,client_id:null,billing_mode:'hourly',default_bill_rate_minor:null,fixed_fee_minor:0,planned_expenses_minor:0,lines:[{label:'Design',kind:'employee',user_id:user,planned_minutes:3000,cost_rate_minor:null,bill_rate_minor:null}],created_at:''}],headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'}}));
 await page.route('https://test.supabase.co/rest/v1/project_effort*',r=>r.fulfill({json:[{project_id:project,minutes:600,entries:3,first_work_date:'2026-10-01',last_work_date:'2026-10-12'}],headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'}}));
 await page.route('https://test.supabase.co/rest/v1/absences*',r=>r.fulfill({json:[],headers:{'content-range':'*/0','access-control-expose-headers':'content-range'}}));
 await page.goto('/');await goArea(page,'Planning');
 await page.getByRole('button',{name:'Long term',exact:true}).click();
 await expect(page.getByText('DEMAND VS. SUPPLY',{exact:true})).toBeVisible();
 // Brand Experience: Plan 3000 − 600 gebucht = 2400 Rest bis 1.12.2026 (Termin) → Oktober + November; Museum Experience: Budget 12000 ohne Termin über drei Monate.
 const table=page.locator('table.outlook-table').first();
 const brand=table.locator('tbody tr').filter({hasText:'Brand Experience'});await expect(brand.locator('td').last()).toHaveText('40 h');
 const museum=table.locator('tbody tr').filter({hasText:'Museum Experience'});await expect(museum.locator('td').last()).toHaveText('200 h');
 // Angebot Oktober: 22 Werktage × 8 h = 176 h (kein Feiertag an Werktagen in DE-BW).
 await expect(table.locator('tr.outlook-total').nth(1).locator('td').nth(1)).toHaveText('176 h');
 // Szenario: Person pausieren → Angebot 0, Lücke.
 await page.getByLabel('Studio Owner',{exact:true}).check();
 await expect(page.getByText('Scenario active',{exact:true})).toBeVisible();
 await expect(table.locator('tr.outlook-total').nth(1).locator('td').nth(1)).toHaveText('0 h');
 await page.getByLabel('Studio Owner',{exact:true}).uncheck();
 await page.getByLabel('Name',{exact:true}).fill('Pitch');await page.getByLabel('Effort (hours)',{exact:true}).fill('100');
 await page.getByRole('button',{name:'Add',exact:true}).click();
 const pitch=table.locator('tbody tr').filter({hasText:'Pitch'});await expect(pitch).toContainText('Scenario');await expect(pitch.locator('td').last()).toHaveText('100 h');
 await page.getByRole('button',{name:'Reset scenario',exact:true}).click();await expect(table.locator('tbody tr').filter({hasText:'Pitch'})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('situation board flags burning projects with reasons and links into tasks and planning',async({page})=>{
 const state=await connectedSetup(page);
 state.projects[0].due_date='2026-10-01'; // Brand Experience überfällig
 state.tasks[0].due_date='2026-10-05'; // Brand sketch überfällig
 state.tasks.push({id:'10000000-0000-4000-8000-000000000009',workspace_id:ws,project_id:project,title:'Launch',status:'todo',assignee_id:user,due_date:'2026-10-02',created_by:user,created_at:'',is_milestone:true} as typeof state.tasks[number]);
 await page.route('https://test.supabase.co/rest/v1/project_effort*',r=>r.fulfill({json:[{project_id:project,minutes:7000,entries:3,first_work_date:'2026-09-01',last_work_date:'2026-09-20'}],headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'}}));
 await page.route('https://test.supabase.co/rest/v1/task_effort*',r=>r.fulfill({json:[],headers:{'content-range':'*/0','access-control-expose-headers':'content-range'}}));
 await page.goto('/');
 const board=page.locator('.health-board');await expect(board.getByRole('heading',{name:'Where it burns.'})).toBeVisible();
 await expect(board).toContainText('1 burning');await expect(board).toContainText('1 running');
 const card=board.locator('.health-card').filter({hasText:'Brand Experience'});await expect(card).toHaveClass(/health-red/);
 await expect(card).toContainText('Project deadline Thu, Oct 1 missed');
 await expect(card).toContainText('1 milestones overdue, e.g. “Launch”');
 await expect(card).toContainText('1 tasks overdue, e.g. “Brand sketch”');
 await expect(card).toContainText('Time budget 117 % used');
 await expect(card).toContainText('No booked time since Sun, Sep 20');
 await expect(board.locator('.health-card').filter({hasText:'Museum Experience'})).toHaveCount(0);
 await board.getByRole('button',{name:'All 2 projects',exact:true}).click();
 await expect(board.locator('.health-card').filter({hasText:'Museum Experience'})).toHaveClass(/health-green/);
 await card.getByRole('button',{name:'Overdue tasks',exact:true}).click();
 await expect(page.getByRole('button',{name:'Brand sketch',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Overdue',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('tags, ratings and strength profiles: recommendation in the task dialog, profile dialog in the team',async({page})=>{
 const state=await connectedSetup(page);const saved:Record<string,unknown>[]=[];
 const other='20000000-0000-4000-8000-000000000002';
 await page.route('https://test.supabase.co/rest/v1/memberships*',r=>r.fulfill({json:[{workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:'',weekly_capacity_minutes:2400},{workspace_id:ws,user_id:other,role:'member',display_name:'Mara Lenz',email:'mara@example.test',created_at:'',weekly_capacity_minutes:2400}],headers:{'content-range':'0-1/2','access-control-expose-headers':'content-range'}}));
 // Mara hat drei erledigte Motion-Aufgaben, pünktlich, bewertet.
 for(let i=0;i<3;i++)state.tasks.push({id:`10000000-0000-4000-8000-00000000002${i}`,workspace_id:ws,project_id:project,title:`Motion ${i}`,status:'done',assignee_id:other,due_date:'2026-10-10',estimated_minutes:600,tags:['motion'],rating:5,started_at:'2026-10-01T08:00:00Z',done_at:'2026-10-08T10:00:00Z',reopened_count:0,created_by:user,created_at:''} as typeof state.tasks[number]);
 await page.route('https://test.supabase.co/rest/v1/task_effort*',r=>r.fulfill({json:[0,1,2].map(i=>({task_id:`10000000-0000-4000-8000-00000000002${i}`,minutes:540,entries:2,last_work_date:'2026-10-08'})),headers:{'content-range':'0-2/3','access-control-expose-headers':'content-range'}}));
 await page.route('https://test.supabase.co/rest/v1/tasks*',r=>{if(r.request().method()==='POST'){const body=r.request().postDataJSON();saved.push(body);state.tasks.push({...body,created_by:user,created_at:''});return r.fulfill({json:body});}return r.fallback();});
 await page.goto(`/#w=${ws}&view=tasks`);
 await page.getByRole('button',{name:'New task',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Task',{exact:true}).fill('Motion reel');
 await dialog.getByLabel('Tags',{exact:true}).fill('Motion, 3D');
 const rec=dialog.locator('.recommend');await expect(rec).toContainText('Mara Lenz');await expect(rec).toContainText('3× motion');await expect(rec).toContainText('Speed 0.90×');await expect(rec).toContainText('100 % on time');await expect(rec).toContainText('Rating 5.0');
 await rec.getByRole('button',{name:'Assign',exact:true}).first().click();
 await expect(dialog.getByLabel('Assigned to',{exact:true})).toHaveAttribute('data-value',other);
 await dialog.getByRole('radio',{name:'4',exact:true}).check();
 await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).not.toBeVisible();
 expect(saved[0]).toMatchObject({title:'Motion reel',assignee_id:other,tags:['motion','3d'],rating:4});
 await expect(page.locator('.task-card').filter({hasText:'Motion reel'}).locator('.task-tag')).toHaveText(['motion','3d']);
 await goArea(page,'Team');
 await page.getByRole('button',{name:'Strengths of Mara Lenz',exact:true}).click();
 const profile=page.getByRole('dialog');await expect(profile.getByRole('heading',{name:'Strengths: Mara Lenz'})).toBeVisible();
 const row=profile.locator('tbody tr').filter({hasText:'motion'});await expect(row).toContainText('0.9×');await expect(row).toContainText('100 %');await expect(row).toContainText('5 / 5');
 await expect(row.locator('td').last()).not.toContainText('from 3 done');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('AI suggestions inbox: adjust, accept as draft, dismiss, accept the whole day',async({page})=>{
 await connectedSetup(page);const accepted:Record<string,unknown>[]=[];let suggestions:Record<string,unknown>[]=[
  {id:'50000000-0000-4000-8000-000000000001',workspace_id:ws,user_id:user,source:'chatgpt',external_id:'cal-1',project_id:project,task_id:null,work_date:'2026-10-13',minutes:90,note:'Jour fixe Brand',billable:true,confidence:0.82,evidence:[{title:'Kalender: Jour fixe',url:'https://calendar.example.test/1'}],status:'pending',entry_id:null,created_at:'',decided_at:null},
  {id:'50000000-0000-4000-8000-000000000002',workspace_id:ws,user_id:user,source:'fireflies',external_id:'ff-2',project_id:null,task_id:null,work_date:'2026-10-13',minutes:45,note:'Meeting ohne klares Projekt',billable:true,confidence:0.4,evidence:[],status:'pending',entry_id:null,created_at:'',decided_at:null},
  {id:'50000000-0000-4000-8000-000000000003',workspace_id:ws,user_id:user,source:'box',external_id:'box-3',project_id:secondProject,task_id:null,work_date:'2026-10-12',minutes:120,note:'Renderings hochgeladen',billable:false,confidence:null,evidence:[],status:'pending',entry_id:null,created_at:'',decided_at:null}];
 await page.route('https://test.supabase.co/rest/v1/time_suggestions*',r=>{if(r.request().method()==='PATCH'){const id=new URL(r.request().url()).searchParams.get('id')!.replace('eq.','');suggestions=suggestions.filter(s=>s.id!==id);return r.fulfill({json:{id,status:'dismissed'}});}const open=suggestions.filter(s=>s.status==='pending');return r.fulfill({json:open,headers:{'content-range':`0-${open.length-1}/${open.length}`,'access-control-expose-headers':'content-range'}});});
 await page.route('https://test.supabase.co/rest/v1/rpc/accept_time_suggestion',r=>{const body=r.request().postDataJSON();accepted.push(body);suggestions=suggestions.filter(s=>s.id!==body.p_id);return r.fulfill({json:{id:'60000000-0000-4000-8000-00000000000'+accepted.length,workspace_id:ws,project_id:body.p_project_id,user_id:user,work_date:body.p_work_date,minutes:body.p_minutes,note:body.p_note,billable:body.p_billable,status:'draft',timer_id:null,created_at:''}});});
 await page.goto('/');
 const inbox=page.locator('.suggestions-inbox');await expect(inbox.getByRole('heading',{name:'3 suggestions for your time tracking.'})).toBeVisible();
 await expect(inbox.locator('.suggestion-day')).toHaveCount(1); // Übersicht: nur der neueste Tag
 await inbox.getByRole('button',{name:'All under Time',exact:true}).click();
 const full=page.locator('.suggestions-inbox');await expect(full.locator('.suggestion-day')).toHaveCount(2);
 const first=full.locator('.suggestion').first(); // neuester Tag zuerst, darin der ChatGPT-Vorschlag
 await expect(first).toContainText('ChatGPT');await expect(first).toContainText('Confidence 82 %');await expect(first.getByRole('link',{name:/Kalender: Jour fixe/})).toHaveAttribute('href','https://calendar.example.test/1');
 await first.getByLabel('Minutes',{exact:true}).fill('75');await first.getByLabel('Description',{exact:true}).fill('Jour fixe Brand – Abstimmung');
 await first.getByRole('button',{name:'Accept',exact:true}).click();await expect(page.getByText('Suggestion accepted as draft.',{exact:true})).toBeVisible();
 expect(accepted[0]).toEqual({p_id:'50000000-0000-4000-8000-000000000001',p_project_id:project,p_task_id:null,p_work_date:'2026-10-13',p_minutes:75,p_note:'Jour fixe Brand – Abstimmung',p_billable:true});
 const unclear=full.locator('.suggestion').filter({hasText:'Project unclear'});await expect(unclear).toContainText('Project unclear');await expect(unclear.getByRole('button',{name:'Accept',exact:true})).toBeDisabled();
 await unclear.getByRole('button',{name:'Dismiss suggestion',exact:true}).click();await expect(page.getByText('Suggestion dismissed.',{exact:true})).toBeVisible();
 await expect(full.locator('.suggestion')).toHaveCount(1);
 await expect(full.locator('.suggestion').first().getByLabel('Billable',{exact:true})).not.toBeChecked();
 await full.locator('.suggestion').first().getByRole('button',{name:'Accept',exact:true}).click();
 await expect(page.getByText('Suggestion accepted as draft.',{exact:true})).toBeVisible();expect(accepted[1]).toMatchObject({p_project_id:secondProject,p_minutes:120,p_billable:false});
 await expect(page.locator('.suggestions-inbox')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
