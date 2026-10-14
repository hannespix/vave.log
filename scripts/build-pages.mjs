// Turns a Vite build into a self-contained static bundle for GitHub Pages.
// The Node/Worker deployments stay untouched: they keep serving /api/config,
// CSP headers and the root-scoped service worker at runtime. Here the same
// public runtime configuration is written as a static file instead, and the
// PWA assets are rewritten for the Pages base path (e.g. /vave.log/).
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';

const out = process.argv[2] || 'dist/pages';
const base = process.env.PAGES_BASE || '/';
if (!base.startsWith('/') || !base.endsWith('/')) throw Error('PAGES_BASE must start and end with "/".');
const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
if (supabasePublishableKey && !supabasePublishableKey.startsWith('sb_publishable_')) throw Error('Only a Supabase publishable key may be embedded in the static bundle.');
if (!existsSync(join(out, 'index.html'))) throw Error(`No build found in ${out}. Run vite build first.`);

// Static stand-in for GET /api/config. Public configuration only — identical
// shape to the server response; an unconfigured bundle shows the setup state.
const configured = Boolean(supabaseUrl && supabasePublishableKey);
mkdirSync(join(out, 'api'), {recursive: true});
writeFileSync(join(out, 'api', 'config'), JSON.stringify({configured, appUrl, supabaseUrl, supabasePublishableKey}));

// Manifest and service worker are written for the base path so installs and
// offline assets work on a project site.
const manifest = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'));
manifest.id = base; manifest.start_url = base; manifest.scope = base;
manifest.icons = manifest.icons.map(icon => ({...icon, src: icon.src.replace(/^\//, base)}));
writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
const sw = readFileSync(join(out, 'sw.js'), 'utf8').replaceAll("'/offline.", `'${base}offline.`);
if (base !== '/' && !sw.includes(`'${base}offline.html'`)) throw Error('Service worker rewrite failed; check public/sw.js offline asset paths.');
writeFileSync(join(out, 'sw.js'), sw);

// GitHub Pages cannot send response headers. The document carries the same
// policy as the server (headers helmet cannot express in <meta> are omitted).
const csp = `default-src 'self'; script-src 'self'; worker-src 'self'; manifest-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'${supabaseUrl ? ` ${new URL(supabaseUrl).origin}` : ''}; base-uri 'none'; form-action 'self'; object-src 'none'`;
const index = readFileSync(join(out, 'index.html'), 'utf8')
  .replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}"/>`)
  // The touch icon is generated after the Vite build, so Vite leaves its URL alone.
  .replaceAll('href="/icons/', `href="${base}icons/`);
writeFileSync(join(out, 'index.html'), index);
writeFileSync(join(out, '404.html'), index);
writeFileSync(join(out, '.nojekyll'), '');
console.log(`Pages bundle ready in ${out} (base ${base}, configured: ${configured}).`);
