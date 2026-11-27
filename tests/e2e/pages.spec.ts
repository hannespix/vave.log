import {test, expect} from '@playwright/test';

// Läuft nur im Playwright-Projekt "pages": der echte build:pages-Output wird
// wie auf GitHub Pages unter /vave.log/ serviert (scripts/serve-pages.mjs),
// alles außerhalb des Basispfads antwortet 404. Der Test fängt damit die
// Regressionsklasse "root-absolute URL" (Logo-Animation #9, PWA-Assets #11,
// Reset-Links M1-A), ohne die Mocks der übrigen Suite zu duplizieren.
test('the Pages bundle boots under its base path without touching the domain root', async ({page}) => {
  const leaks: string[] = [];
  const failures: string[] = [];
  page.on('request', req => { const u = new URL(req.url()); if (u.port === '4174' && !u.pathname.startsWith('/vave.log/')) leaks.push(u.pathname); });
  page.on('response', res => { const u = new URL(res.url()); if (u.port === '4174' && res.status() >= 400) failures.push(`${res.status()} ${u.pathname}`); });
  await page.route('https://test.supabase.co/**', route => route.fulfill({json: {}}));
  await page.goto('/vave.log/');
  await expect(page.getByLabel('Email address', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Sign in', exact: true})).toBeVisible();
  // Die Logo-Animation beweist, dass der dynamische lottie-Chunk UND das
  // Animations-JSON vom Basispfad aufgelöst werden (M2-D + Befund aus #9).
  await expect(page.locator('.brand-animation.is-loaded').first()).toBeVisible();
  expect(leaks).toEqual([]);
  expect(failures).toEqual([]);
});

// GitHub Pages liefert JavaScript als application/javascript aus. Der Service Worker prüft die Typen
// seiner Offline-Dateien; lehnt er diesen Typ ab, scheitert seine Installation still – ohne Worker
// gibt es weder Offline-Seite noch Updates, und ältere Browser bieten die App nicht zur Installation an.
test('the service worker installs and takes control under the Pages base path', async ({page}) => {
  await page.route('https://test.supabase.co/**', route => route.fulfill({json: {}}));
  await page.goto('/vave.log/');
  await expect(page.getByLabel('Email address', {exact: true})).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/vave.log/'))?.active?.state), {timeout: 20000}).toBe('activated');
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/vave.log/'))?.scope)).toMatch(/\/vave\.log\/$/);
  const manifest = await (await page.request.get('/vave.log/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({start_url: '/vave.log/', scope: '/vave.log/', display: 'standalone'});
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok(), icon.src).toBe(true);
});

test('the static app requires a top-level tab before initializing sign-in', async ({page}) => {
  let authRequests = 0;
  await page.route('https://test.supabase.co/**', route => { authRequests++; return route.fulfill({json:{}}); });
  await page.route('**/frame-test', route => route.fulfill({
    contentType:'text/html', body:'<!doctype html><iframe title="Static app" src="/vave.log/"></iframe>',
  }));
  await page.goto('/frame-test');
  const app = page.frameLocator('iframe');
  await expect(app.getByRole('link',{name:'Open VAVE.LOG in its own tab',exact:true})).toHaveAttribute('href','/vave.log/');
  await expect(app.locator('meta[name="referrer"]')).toHaveAttribute('content','no-referrer');
  await expect(app.getByRole('button',{name:'Sign in',exact:true})).toHaveCount(0);
  expect(authRequests).toBe(0);
});
