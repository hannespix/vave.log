# VAVE.LOG: Auth-E-Mails und Rückleitungen

## Stand

Die 13 gebrandeten HTML-Vorlagen sind vorbereitet, **noch nicht im gehosteten Supabase aktiviert**. Ein GitHub-Push oder Sites-Deployment aktiviert keine Auth-E-Mail-Vorlagen. Die verbundene Supabase-MCP-Schnittstelle bietet keinen Zugriff auf die Auth-Konfiguration; es liegen hier weder SMTP-Zugangsdaten noch ein Management-API-Token vor. Es wurden keine Testmails verschickt.

Supabase hat die Anpassung von Vorlagen für **neue Free-Projekte mit Standard-SMTP seit 3. Juni 2026 eingeschränkt**. Das VAVE.LOG-Projekt wurde danach erstellt. Ein eigener SMTP-Dienst ermöglicht die Anpassung auch im Free-Plan und ist für den Teamversand erforderlich. Ein kostenpflichtiger Supabase-Plan ist dafür nicht zwingend nötig.

## 1. Bestätigungslinks auf die richtige App führen

[URL Configuration für dieses Projekt](https://supabase.com/dashboard/project/ieeujtmpxqxmfyietqgw/auth/url-configuration) öffnen.

| Feld | Wert |
| --- | --- |
| Site URL | `https://vave-log.pixer.chatgpt.site` |
| Redirect URL | `https://vave-log.pixer.chatgpt.site/` |
| Weitere Redirect URL | `https://vave-log.pixer.chatgpt.site/?reset=1` |

Speichern. Nicht `localhost:3000` als Produktionsadresse stehen lassen. Die App übergibt ihre Rückleitung bei Registrierung und Passwortreset bereits; Supabase muss sie zusätzlich erlauben. Weitere echte Callback-Pfade, etwa für eine Registrierung während einer OAuth-Verbindung, später gezielt ergänzen. Keine pauschale Wildcard für fremde Domains verwenden.

**Fehler „Cannot GET /?code=…“ auf localhost:** Der Bestätigungslink hat zum lokalen Standardziel statt zur App geführt. Die CSP-Meldung zu `/.well-known/appspecific/com.chrome.devtools.json` kommt von Chromes DevTools und ist nicht die Ursache der falschen Rückleitung. Keine CSP-Ausnahme für localhost hinzufügen.

Nach der Korrektur zuerst die veröffentlichte App direkt öffnen und normal anmelden: Die E-Mail kann durch den Klick bereits bestätigt sein, obwohl die anschließende Weiterleitung fehlschlug. Wenn sie noch unbestätigt ist, im Supabase-Dashboard unter Auth > Users gezielt einen neuen Bestätigungslink für das eigene Testkonto anfordern. Bereits verbrauchte Links nicht wiederverwenden. Passwortreset erneut über „Passwort vergessen?“ anfordern und im selben Browser öffnen. Der PKCE-Code braucht den dort gespeicherten Verifier; nicht in einer anderen Browser-App testen. Keine Bestätigung abschalten und keine Auth-Tabellen manuell umschreiben.

## 2. Eigenen SMTP-Absender verbinden

Unter Auth > Email > SMTP Settings (bzw. [SMTP-Konfiguration](https://supabase.com/dashboard/project/ieeujtmpxqxmfyietqgw/auth/smtp)) einen vorhandenen Maildienst verbinden. Erforderlich sind Server, Port, Benutzername, Passwort und eine vom Anbieter freigegebene Absenderadresse. Den Absendernamen auf **VAVE.LOG** setzen. Die tatsächliche Absenderadresse bleibt offen, bis der Besitzer einen autorisierten Absender eingerichtet hat; keine erfundene Adresse von vave.studio verwenden.

Zugangsdaten direkt im Supabase-Dashboard eingeben, nicht im Chat oder Repository. Die vom Anbieter verlangten SPF-/DKIM-/DMARC-Einträge einrichten. Link- und Öffnungstracking für Auth-E-Mails deaktivieren: Linkumschreibungen können die Bestätigung beeinträchtigen. SMTP-Bestätigung und Auth-Rate-Limits prüfen, E-Mail-Bestätigung aktiviert lassen.

## 3. Vorlagen übernehmen

Die [Vorschau](email-preview.html) lokal im Browser öffnen. Sie benötigt keine externen Bilder, Schriften, Skripte oder Zugangsdaten. Vorschau-Buttons sind absichtlich funktionslos. Die E-Mails verwenden die App-Farben `#641dff`, `#e8ffb9` und `#f8f9f6`, eine statische Textwortmarke, Inline-Stile, Tabellenlayout und einen Outlook-Fallback. So bleibt das Branding auch bei gesperrten Bildern lesbar. Keine Animation, Werbung oder Trackingpixel.

In [Auth > Email Templates](https://supabase.com/dashboard/project/ieeujtmpxqxmfyietqgw/auth/templates) jeweils **Subject** und **Body** ersetzen. Die Zuordnung steht in [subjects.json](../supabase/templates/subjects.json); der Body liegt in der gleichnamigen HTML-Datei unter [supabase/templates](../supabase/templates/). Alle Dateien sind vollständig, einschließlich der Supabase-Platzhalter.

- Sechs Auth-Vorlagen: Registrierung, Account-Einladung, Anmeldelink, Passwortreset, E-Mail-Änderung und erneute Sicherheitsbestätigung.
- Sieben Sicherheitsbenachrichtigungen: Passwort, E-Mail, Telefon, verknüpfte/entfernte Anmeldung und hinzugefügte/entfernte Verifizierungsmethode.
- Die Vorlagen schalten keine neuen Anmeldeverfahren ein. Sicherheitsbenachrichtigungen werden nur versendet, wenn ihre jeweiligen Schalter in Supabase aktiv sind. Diese Schalter separat prüfen; das Branding-Paket verändert sie nicht.
- Die Supabase-Account-Einladung ist nicht die Workspace-Einladung der Anwendung. Letztere speichert weiterhin die Zuordnung ohne automatischen Mailversand und vergibt Rechte erst beim bestätigten Login.
- Dynamische Namen und sonstige nutzersteuerbare Metadaten werden nicht in die E-Mails übernommen. Aktionslinks behalten `{{ .ConfirmationURL }}` unverändert, der Sicherheitscode verwendet `{{ .Token }}`. Keine selbst gebauten Tokenlinks, fest eingetragenen Zugangstokens oder erfundenen Ablaufzeiten.

Alternativ enthält [auth-email-branding.json](../supabase/auth-email-branding.json) den vollständigen, **ausschließlich auf Betreff und Inhalt begrenzten** PATCH-Body für `https://api.supabase.com/v1/projects/ieeujtmpxqxmfyietqgw/config/auth`. Vor einer Anwendung über die offizielle Management API bestehende Template-Felder sichern. Einen Management-Zugriffstoken nur über einen sicheren lokalen Secret-Kanal bereitstellen; ein Publishable- oder Service-Role-Key ersetzt diesen Token nicht. Der Body verändert weder SMTP noch Site URL, Redirects, Registrierung, Verifizierung oder Benachrichtigungsschalter.

## Pflege und Prüfung

Texte und gemeinsames Layout in `scripts/build-auth-emails.mjs` bearbeiten, danach `npm run emails:build`. `npm run emails:check` vergleicht alle erzeugten Dateien einschließlich Vorschau und API-Payload; es verändert weder Dateien noch den gehosteten Dienst. Der normale CI-Check führt diesen Abgleich ebenfalls aus.

Nach Aktivierung mit dem eigenen Testkonto prüfen: Registrierung und Bestätigung, Anmeldung nach Rückkehr, Passwortreset und Sicherheitsbenachrichtigungen. Linkziel muss auf die echte Site führen. Desktop, schmalen Bildschirm und mindestens die tatsächlich genutzten Mailprogramme prüfen. HTML-Vorschau und Strukturprüfung ersetzen keinen echten Zustell- und Mailclient-Test. PKCE-E-Mails im selben Browser öffnen. Mailscanner können einmalige Bestätigungslinks vorab aufrufen; ein verbrauchter Link braucht einen neuen Versand, keine Lockerung der Auth-Sicherheit.

## Quellen

- https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/redirect-urls
