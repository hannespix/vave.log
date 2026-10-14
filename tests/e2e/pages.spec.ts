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
