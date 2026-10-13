# vave.log

Projekte, Aufgaben und Arbeitszeiten für VAVE — per Oberfläche oder KI über MCP.

React/TypeScript, Supabase Postgres/Auth mit Row Level Security, gemeinsam genutzte Datenzugriffe und ein authentifizierter MCP-Server. Kein Service-Role-Key im laufenden System. Originales animiertes VAVE-Logo, lokale Readex-Pro-Schrift.

## Lokal

Node.js >=22.12. `npm ci`, `.env.example` nach `.env` kopieren, Supabase konfigurieren. Dann `npm run build && npm start`. Entwicklung: `npm run dev:server` und `npm run dev` in getrennten Terminals.

## Prüfung

`npm run typecheck`, `npm test`, `npm run build`. PostgreSQL/RLS wird in PGlite tatsächlich ausgeführt; MCP-Tests verwenden den offiziellen Client und das HTTP-Protokoll.

## Stand

Die erste produktive Implementierung wird gerade integriert. Siehe `STATE.md` für überprüfte Nachweise und offene Infrastruktur-Schritte. Ein erfolgreicher Build ist keine Bestätigung eines produktiv eingerichteten Supabase-Projekts.
