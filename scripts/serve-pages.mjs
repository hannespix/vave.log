// Serviert den Pages-Build so, wie GitHub Pages es täte: nur Dateien, nur
// unter dem Projekt-Basispfad. Alles außerhalb antwortet 404 — damit fallen
// root-absolute URLs (die Regressionsklasse aus #9/#11/M1-A) im e2e-Smoke
// laut auf, statt zufällig vom Dev-Server bedient zu werden.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join, normalize, extname, sep} from 'node:path';

const root = normalize(process.argv[2] || 'dist/pages');
const base = process.env.PAGES_BASE || '/vave.log/';
const port = Number(process.env.PAGES_PORT || 4174);
if (!base.startsWith('/') || !base.endsWith('/')) throw Error('PAGES_BASE must start and end with "/".');
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.woff2': 'font/woff2', '.map': 'application/json'};

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (!path.startsWith(base)) { res.writeHead(404, {'content-type': 'text/plain'}); res.end('outside base path'); return; }
  let rel = decodeURIComponent(path.slice(base.length));
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(root, rel));
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await readFile(file);
    // api/config hat wie beim Server-Deployment keine Endung.
    const type = rel === 'api/config' ? 'application/json' : (types[extname(file)] ?? 'application/octet-stream');
    res.writeHead(200, {'content-type': type});
    res.end(body);
  } catch { res.writeHead(404, {'content-type': 'text/plain'}); res.end('not found'); }
}).listen(port, () => console.log(`Pages fixture on http://localhost:${port}${base}`));
