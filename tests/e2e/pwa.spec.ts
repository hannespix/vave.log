import {test,expect,type Page} from '@playwright/test';

test.use({locale:'en-US'});

const user='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const project='33333333-3333-4333-8333-333333333333';
const config={configured:true,appUrl:'http://localhost:4173',supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'};
const offlineAssets=['/favicon.svg','/offline.css','/offline.html','/offline.js'];

async function signInOnNextNavigation(page:Page){
 await page.addInitScript(({user})=>{
  const payload=btoa(JSON.stringify({sub:user,aud:'authenticated',role:'authenticated',exp:2100000000,iss:'https://test.supabase.co/auth/v1'}));
  localStorage.setItem('sb-test-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.test`,refresh_token:'test-refresh-token',token_type:'bearer',expires_at:2100000000,expires_in:3600,user:{id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner'},created_at:'2026-10-01T10:00:00Z'}}));
 },{user});
}

async function setup(page:Page,loggedIn=false){
 const requested=new Set<string>();
 await page.route('**/api/config',route=>route.fulfill({json:config}));
 if(loggedIn)await signInOnNextNavigation(page);
 await page.route('https://test.supabase.co/**',async route=>{
  const request=route.request(),url=new URL(request.url());requested.add(url.pathname);
  let data:unknown=[];
  if(url.pathname==='/auth/v1/user')data={id:user,aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{},user_metadata:{display_name:'Studio Owner',locale:request.method()==='PUT'?request.postDataJSON().data?.locale:'en'},created_at:'2026-10-01T10:00:00Z'};
  else if(url.pathname==='/rest/v1/rpc/accept_invitations')data=0;
  else if(url.pathname==='/rest/v1/workspaces')data=[{id:workspace,name:'VAVE Studio',timezone:'Europe/Berlin',currency:'EUR',created_by:user,created_at:'2026-10-01T10:00:00Z'}];
  else if(url.pathname==='/rest/v1/memberships')data=[{workspace_id:workspace,user_id:user,role:'owner',display_name:'Studio Owner',email:'owner@example.test',created_at:'2026-10-01T10:00:00Z'}];
  else if(url.pathname==='/rest/v1/projects')data=[{id:project,workspace_id:workspace,code:'VAV-001',name:'Private PWA project',client:'VAVE',budget_minutes:600,status:'active',color:'#641dff',created_at:'2026-10-01T10:00:00Z'}];
  else if(url.pathname==='/rest/v1/time_entries')data=[{id:'44444444-4444-4444-8444-444444444444',workspace_id:workspace,project_id:project,user_id:user,work_date:'2026-10-14',minutes:30,note:'Private PWA time entry',billable:true,status:'draft',timer_id:null,created_at:'2026-10-14T09:00:00Z'}];
  else if(url.pathname==='/rest/v1/running_timers'||url.pathname==='/rest/v1/workspace_demos')data=null;
  await route.fulfill({json:data,headers:{'access-control-expose-headers':'content-range','content-range':Array.isArray(data)?`0-${Math.max(0,data.length-1)}/${data.length}`:'0-0/1'}});
 });
 return requested;
}

async function readyWorker(page:Page){
 await expect.poll(()=>page.evaluate(async()=>{
  const registration=await navigator.serviceWorker.getRegistration('/');
  return registration?.active?.state;
 }),{timeout:15000}).toBe('activated');
 expect(await page.evaluate(async()=>(await navigator.serviceWorker.ready).active?.scriptURL)).toMatch(/\/sw\.js$/);
 await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/sw\.js$/);
}

async function noHorizontalOverflow(page:Page){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 const dialog=page.getByRole('dialog');
 if(await dialog.count())expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
}

async function onlyPublicOfflineCache(page:Page){
 const cachesFound=await page.evaluate(async()=>Promise.all((await caches.keys()).map(async name=>({
  name,urls:(await (await caches.open(name)).keys()).map(request=>request.url),
 }))));
 expect(cachesFound).toHaveLength(1);
 expect(cachesFound[0].name).toMatch(/^vave-log-offline-[a-f0-9]{16}$/);
 expect(cachesFound[0].urls.sort()).toEqual(offlineAssets.map(path=>new URL(path,page.url()).href).sort());
}

test('PWA metadata serves credentialed manifest, correctly sized PNG icons and a revalidated root worker',async({page,request})=>{
 await setup(page);await page.goto('/');
 await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href','/manifest.webmanifest');
 await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('crossorigin','use-credentials');
 const response=await request.get('/manifest.webmanifest');
 expect(response.ok()).toBe(true);expect(response.headers()['content-type']).toContain('application/manifest+json');
 const manifest=await response.json();
 expect(manifest).toMatchObject({id:'/',name:'VAVE.LOG',start_url:'/',scope:'/',display:'standalone'});
 expect(manifest.icons).toEqual([
  {src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
  {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
  {src:'/icons/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
 ]);
 for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512],['apple-touch-icon.png',180]] as const){
  const icon=await request.get(`/icons/${name}`);expect(icon.ok()).toBe(true);expect(icon.headers()['content-type']).toContain('image/png');
  const body=await icon.body();expect(body.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(body.readUInt32BE(16)).toBe(size);expect(body.readUInt32BE(20)).toBe(size);
 }
 await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href','/icons/apple-touch-icon.png');
 const worker=await request.get('/sw.js');expect(worker.ok()).toBe(true);
 expect(worker.headers()['content-type']).toMatch(/(?:text|application)\/javascript/);
 expect(worker.headers()['cache-control']).toBe('no-store');expect(worker.headers()['service-worker-allowed']).toBe('/');
});

test('real worker serves localized offline fallback, retains only public assets and retries online',async({page,context})=>{
 const requested=await setup(page,true);await page.goto('/');
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();await readyWorker(page);
 await expect.poll(()=>requested.has('/rest/v1/time_entries')).toBe(true);
 await onlyPublicOfflineCache(page);
 const locales=[
  {locale:'en',heading:'Your flow will be back.',retry:'Try again',settings:'Settings'},
  {locale:'de',heading:'Gleich wieder im Flow.',retry:'Erneut versuchen',settings:'Einstellungen'},
  {locale:'zh',heading:'稍后继续，保持节奏。',retry:'重试',settings:'设置'},
 ];
 for(const copy of locales){
  await page.evaluate(locale=>localStorage.setItem('vave-log.locale',locale),copy.locale);
  await context.setOffline(true);
  await page.goto('/offline-check');
  await expect(page.getByRole('heading',{name:copy.heading,exact:true})).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang',copy.locale);
  await expect(page.getByText('Private PWA project',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Private PWA time entry',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('navigation')).toHaveCount(0);await noHorizontalOverflow(page);
  await onlyPublicOfflineCache(page);
  await context.setOffline(false);
  await page.getByRole('button',{name:copy.retry,exact:true}).click();
  await expect(page.getByRole('navigation').getByRole('button',{name:copy.settings,exact:true})).toBeVisible();
 }
 await onlyPublicOfflineCache(page);
});

test('native install prompt waits for a user click and a dismissed prompt is consumed only once',async({page})=>{
 await setup(page);
 // Keep any real browser prompt from replacing the controlled, one-shot event.
 await page.addInitScript(()=>window.addEventListener('beforeinstallprompt',event=>{
  if(event.isTrusted){event.preventDefault();event.stopImmediatePropagation();}
 },{capture:true}));
 await page.goto('/');
 const install=page.getByRole('button',{name:'Install app',exact:true});await expect(install).toBeVisible();
 await page.evaluate(()=>{
  const state={calls:0,userActivated:false,prevented:false};
  (window as Window & {pwaInstallTest?:typeof state}).pwaInstallTest=state;
  const event=Object.assign(new Event('beforeinstallprompt',{cancelable:true}),{
   prompt:async()=>{state.calls++;state.userActivated=navigator.userActivation.isActive;},
   userChoice:Promise.resolve({outcome:'dismissed'}),
  });
  window.dispatchEvent(event);state.prevented=event.defaultPrevented;
 });
 const promptState=()=>page.evaluate(()=>(window as Window & {pwaInstallTest?:{calls:number;userActivated:boolean;prevented:boolean}}).pwaInstallTest);
 expect(await promptState()).toEqual({calls:0,userActivated:false,prevented:true});
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await install.click();const dialog=page.getByRole('dialog',{name:'VAVE.LOG on your device',exact:true});await expect(dialog).toBeVisible();
 expect((await promptState())?.calls).toBe(0);await noHorizontalOverflow(page);
 await dialog.getByRole('button',{name:'Install app',exact:true}).click();
 await expect.poll(promptState).toEqual({calls:1,userActivated:true,prevented:true});
 await expect(dialog.getByRole('button',{name:'Install app',exact:true})).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await install.click();await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Install app',exact:true})).toHaveCount(0);
 expect((await promptState())?.calls).toBe(1);
});

test('manual installation stays opt-in and localized with accessible offline status',async({page,context},testInfo)=>{
 await setup(page);
 // Model a browser that does not expose a native installation event.
 await page.addInitScript(()=>window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();event.stopImmediatePropagation();},{capture:true}));
 await page.goto('/');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const locales=[
  {locale:'en',install:'Install app',dialog:'VAVE.LOG on your device',offline:'Offline. Connect to save changes. Changes are not queued for syncing.'},
  {locale:'de',install:'App installieren',dialog:'VAVE.LOG auf deinem Gerät',offline:'Offline. Zum Speichern bitte verbinden. Änderungen werden nicht automatisch synchronisiert.'},
  {locale:'zh',install:'安装应用',dialog:'在你的设备上使用 VAVE.LOG',offline:'当前离线。请联网后保存修改。修改不会自动同步。'},
 ];
 for(const copy of locales){
  await page.getByRole('combobox',{name:/^(Language|Sprache|语言)$/}).selectOption(copy.locale);
  const install=page.getByRole('button',{name:copy.install,exact:true});
  await install.click();const dialog=page.getByRole('dialog',{name:copy.dialog,exact:true});await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:copy.install,exact:true})).toHaveCount(0);
  await expect(dialog.getByText(testInfo.project.name==='mobile'?/Add to Home Screen|Zum Home-Bildschirm|添加到主屏幕/:/Chrome/)).toBeVisible();
  await noHorizontalOverflow(page);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(install).toBeFocused();
  const status=page.getByRole('status').filter({hasText:copy.offline});await expect(status).toHaveCount(0);
  await context.setOffline(true);await expect(status).toBeVisible();await noHorizontalOverflow(page);
  await context.setOffline(false);await expect(status).toHaveCount(0);
 }
});

test('Settings checks the real worker for updates without reloading and fits all supported languages',async({page,context})=>{
 await setup(page,true);await page.goto(`/#w=${workspace}&view=settings`);
 const panel=page.locator('.pwa-settings');await expect(panel.getByRole('heading',{name:'VAVE.LOG app',exact:true})).toBeVisible();
 await readyWorker(page);
 let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
 await panel.getByRole('button',{name:'Check for updates',exact:true}).click();
 await expect(panel.getByRole('status')).toHaveText('Your app is up to date.');
 await expect(panel.getByRole('button',{name:'Reload and update',exact:true})).toHaveCount(0);
 expect(navigations).toBe(0);
 await context.setOffline(true);await expect(panel.getByRole('button',{name:'Check for updates',exact:true})).toBeDisabled();
 await context.setOffline(false);await expect(panel.getByRole('button',{name:'Check for updates',exact:true})).toBeEnabled();
 const locales=[
  {locale:'en',heading:'VAVE.LOG app',install:'Install app',dialog:'VAVE.LOG on your device'},
  {locale:'de',heading:'VAVE.LOG App',install:'App installieren',dialog:'VAVE.LOG auf deinem Gerät'},
  {locale:'zh',heading:'VAVE.LOG 应用',install:'安装应用',dialog:'在你的设备上使用 VAVE.LOG'},
 ];
 for(const copy of locales){
  await page.getByRole('combobox',{name:/^(Language|Sprache|语言)$/}).selectOption(copy.locale);
  await expect(panel.getByRole('heading',{name:copy.heading,exact:true})).toBeVisible();await noHorizontalOverflow(page);
  await panel.getByRole('button',{name:copy.install,exact:true}).click();
  await expect(page.getByRole('dialog',{name:copy.dialog,exact:true})).toBeVisible();await noHorizontalOverflow(page);
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 }
 expect(navigations).toBe(0);
});

test('standalone display and iOS installation signals hide auth install links and identify the installed app in Settings',async({context})=>{
 for(const signal of ['display','ios'] as const){
  const page=await context.newPage();await setup(page);
  await page.addInitScript(signal=>{
   if(signal==='ios')Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>true});
   else{
    const matchMedia=window.matchMedia.bind(window);
    window.matchMedia=query=>{const media=matchMedia(query);if(query==='(display-mode: standalone)')Object.defineProperty(media,'matches',{get:()=>true});return media;};
   }
  },signal);
  await page.goto('/');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Install app',exact:true})).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await signInOnNextNavigation(page);await page.goto(`/#w=${workspace}&view=settings`);await page.reload();
  const panel=page.locator('.pwa-settings');await expect(panel.getByRole('heading',{name:'VAVE.LOG app',exact:true})).toBeVisible();
  await expect(panel.getByText('Already installed',{exact:true})).toBeVisible();
  await expect(panel.getByRole('button',{name:'Install app',exact:true})).toHaveCount(0);await noHorizontalOverflow(page);
  await page.evaluate(()=>localStorage.removeItem('sb-test-auth-token'));await page.close();
 }
});
