import {test,expect,type Page} from '@playwright/test';
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
   if(req.method()==='POST'){const body=req.postDataJSON();const e={...body,user_id:user,status:'draft',timer_id:null,created_at:'2026-10-13T09:00:00Z'};entries.push(e);data=e}else data=entries;
  }
  await route.fulfill({json:data,headers:{'content-range':Array.isArray(data)?`0-${Math.max(0,data.length-1)}/${data.length}`:'0-0/1'}});
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
 await page.route('http://localhost:4173/',async route=>{
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
 await page.getByLabel('Language',{exact:true}).selectOption('de');
 await expect(page.getByRole('button',{name:'Anmelden',exact:true})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang','de-DE');
 await page.reload();
 await expect(page.getByLabel('Sprache',{exact:true})).toHaveValue('de');
 await page.getByLabel('Sprache',{exact:true}).selectOption('zh');
 await expect(page.getByRole('button',{name:'登录',exact:true})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
 await page.reload();
 await expect(page.getByLabel('语言',{exact:true})).toHaveValue('zh');
 await page.getByLabel('语言',{exact:true}).selectOption('system');
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
 await page.getByLabel('Language',{exact:true}).selectOption('zh');
 await expect(nav.getByRole('button',{name:'项目',exact:true})).toBeVisible();
 await expect(nav.getByRole('button',{name:'团队',exact:true})).toHaveCount(0);
 await nav.getByRole('button',{name:'项目',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Brand Experience',exact:true})).toBeVisible();
 expect(financialRequests).toEqual([]);
});

test('registration stores the selected email locale and preserves the submitted name',async({page})=>{
 await setup(page);let submitted:Record<string,unknown>|undefined;
 await page.route('https://test.supabase.co/auth/v1/signup*',async route=>{submitted=route.request().postDataJSON();await route.fulfill({json:{id:user,email:'new@example.test',user_metadata:{display_name:'Projekt',locale:'de'},identities:[]}});});
 await page.goto('/');await page.getByLabel('Language',{exact:true}).selectOption('de');
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
 await page.route('https://test.supabase.co/rest/v1/workspaces*',r=>r.fulfill({json:seeded?[workspace]:[],headers:{'content-range':seeded?'0-0/1':'0-0/0'}}));
 await page.route('https://test.supabase.co/rest/v1/rpc/demo_create_workspace',r=>{input=r.request().postDataJSON();seeded=true;return r.fulfill({json:workspace})});
 await page.route('https://test.supabase.co/rest/v1/workspace_demos*',r=>r.fulfill({json:seeded?{workspace_id:ws,created_by:user,request_id:input?.p_request_id,locale:'en',experience_version:DEMO_EXPERIENCE_VERSION,manifest_version:DEMO_MANIFEST.version,manifest:DEMO_MANIFEST,created_at:workspace.created_at,archived_at:null}:null}));
 await page.route('https://test.supabase.co/rest/v1/memberships*',r=>r.fulfill({json:[{workspace_id:ws,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:''},{workspace_id:ws,user_id:'55555555-5555-4555-8555-555555555555',role:'manager',display_name:'Tobias Geisler',email:'sample-1@example.invalid',created_at:'',is_demo:true,demo_title:'Co-Founder & CEO',demo_studio:'',demo_origin:'public'}]}));
 await page.goto('/');await expect(page.getByRole('radio',{name:/Start empty/})).toBeChecked();expect(input).toBeUndefined();
 await page.getByRole('radio',{name:/Explore with VAVE examples/}).check();
 await expect(page.getByRole('combobox',{name:'Currency',exact:true})).toBeDisabled();
 await page.getByRole('combobox',{name:/^Time zone /}).fill('Europe/Berlin');
 await page.getByRole('button',{name:'Create workspace',exact:true}).click();
 await expect(page.getByText('DEMO WORKSPACE',{exact:true})).toHaveCount(0);
 await page.getByRole('navigation').getByRole('button',{name:'Settings',exact:true}).click();
 await expect(page.getByText('DEMO WORKSPACE',{exact:true})).toBeVisible();
 await expect(page.getByText('Explore the public sources',{exact:true})).toHaveCount(0);
 await page.getByRole('navigation').getByRole('button',{name:'Team',exact:true}).click();
 await expect(page.getByText('DEMO WORKSPACE',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('row').filter({hasText:'Tobias Geisler'})).toBeVisible();
 await expect(page.getByText('Sample profile · no login',{exact:true})).toBeVisible();
 expect(input).toMatchObject({p_name:'VAVE · Demo',p_timezone:'Europe/Berlin',p_locale:'en'});expect(input?.p_request_id).toMatch(/^[0-9a-f-]{36}$/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('finance loads more than a thousand time entries and keeps million-euro metrics inside the viewport',async({page})=>{
 await setup(page,true);
 const people=Array.from({length:111},(_,i)=>`90000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
 const entries=Array.from({length:1105},(_,i)=>({id:`80000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,workspace_id:ws,project_id:project,user_id:people[i%people.length],work_date:'2026-10-13',minutes:5,note:'Fictional production time',billable:true,status:'approved',timer_id:null,created_at:'2026-10-13T09:00:00Z'}));
 const offsets:number[]=[];
 await page.route('https://test.supabase.co/rest/v1/time_entries*',route=>{
  const url=new URL(route.request().url()),offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000),slice=entries.slice(offset,offset+limit);offsets.push(offset);
  return route.fulfill({json:slice,headers:{'content-range':`${offset}-${offset+slice.length-1}/${entries.length}`}});
 });
 await page.route('https://test.supabase.co/rest/v1/workspaces*',r=>new URL(r.request().url()).searchParams.get('select')==='currency'?r.fulfill({json:{currency:'EUR'}}):r.fallback());
 await page.route('https://test.supabase.co/rest/v1/finance_staff_rates*',r=>r.fulfill({json:people.map((person,i)=>({id:String(i),workspace_id:ws,user_id:person,kind:'employee',effective_from:'2026-01-01',cost_rate_minor:8000,bill_rate_minor:18500})),headers:{'content-range':'0-110/111'}}));
 await page.route('https://test.supabase.co/rest/v1/finance_project_plans*',r=>r.fulfill({json:[{workspace_id:ws,project_id:project,client_id:null,billing_mode:'fixed',default_bill_rate_minor:18500,fixed_fee_minor:2255000000,planned_expenses_minor:563750000,lines:[{label:'Fictional annual production programme',kind:'employee',user_id:null,planned_minutes:7800000,cost_rate_minor:8000,bill_rate_minor:18500}],created_at:''}],headers:{'content-range':'0-0/1'}}));
 await page.route('https://test.supabase.co/rest/v1/rpc/finance_list_invoices',r=>r.fulfill({json:[]}));
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Finance',exact:true}).click();
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
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Finance',exact:true}).click();
 await page.getByRole('tab',{name:'Invoices',exact:true}).click();await page.getByRole('button',{name:'Manual draft',exact:true}).click();
 let dialog=page.getByRole('dialog');await dialog.getByLabel('Description',{exact:true}).fill('Design workshop');await dialog.getByLabel('Quantity',{exact:true}).fill('2');await dialog.getByLabel('Unit price (EUR)',{exact:true}).fill('125');await dialog.getByLabel('Tax %',{exact:true}).fill('19');
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).not.toBeVisible();
 expect(saved).toMatchObject({workspace_id:ws,client_id:clientId,language:'en',lines:[{description:'Design workshop',quantity:2,unit_price_minor:12500,tax_basis_points:1900,time_entry_id:null,zero_tax_reason:''}]});expect(issued).toBe(0);
 await page.getByRole('button',{name:'Issue invoice',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();expect(issued).toBe(0);
 await dialog.getByRole('button',{name:'Issue invoice',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();expect(issued).toBe(1);await expect(dialog).toBeVisible();
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
 await page.getByRole('navigation').getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Complete demo',exact:true}).click();
 await expect(page.getByRole('button',{name:'Complete demo',exact:true})).toHaveCount(0);expect(upgraded).toBe(1);
 const nav=page.getByRole('navigation');await nav.getByRole('button',{name:'Team',exact:true}).click();
 await expect(page.getByRole('row').filter({hasText:'Elena Weber'})).toBeVisible();await expect(page.getByText('Sample profile · no login',{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await nav.getByRole('button',{name:/^Time/}).click();await page.getByRole('button',{name:'Team time',exact:true}).click();
 await page.getByRole('button',{name:/Approve.*Elena Weber/}).click();await expect(page.getByRole('row').filter({hasText:'Sample concept workshop'}).getByText('Approved',{exact:true})).toBeVisible();
 await nav.getByRole('button',{name:'Finance',exact:true}).click();await page.getByRole('tab',{name:'Invoices',exact:true}).click();
 await page.getByRole('button',{name:'Draft',exact:true}).click();await expect(page.getByText('DEMO — Not for payment',{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Issue sample invoice',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Issue sample invoice',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('No payment is due.');expect(issued).toBe(0);
 await dialog.getByRole('button',{name:'Issue sample invoice',exact:true}).click();await expect(dialog).not.toBeVisible();expect(issued).toBe(1);
 await expect(page.getByRole('button',{name:'DEMO-000001',exact:true})).toBeVisible();await expect(page.getByText('DEMO — Not for payment',{exact:true}).first()).toBeVisible();
 await page.reload();await page.getByRole('navigation').getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('button',{name:'Complete demo',exact:true})).toHaveCount(0);expect(upgraded).toBe(1);
});
