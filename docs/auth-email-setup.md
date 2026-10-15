# VAVE.LOG: Auth-E-Mails und Rückleitungen

## Stand

Die Bestätigungs-, Einladungs-, Anmelde-, Passwortreset- und E-Mail-Änderungs-Links sind Token-Hash-Links auf die Site, die erst die App einlöst (siehe Abschnitt 1). Solange die Vorlagen im Dashboard nicht übernommen sind, verschickt Supabase seine Standardmail mit dem alten Weiterleitungslink; der funktioniert nur, wenn die Site URL stimmt, und ist anfällig für Link-Scanner.

Die 13 gebrandeten HTML-Vorlagen sind in **Englisch, Deutsch und vereinfachtem Chinesisch** vorbereitet, **noch nicht im gehosteten Supabase aktiviert**. Ein GitHub-Push oder Sites-Deployment aktiviert keine Auth-E-Mail-Vorlagen. Die verbundene Supabase-MCP-Schnittstelle bietet keinen Zugriff auf die Auth-Konfiguration; es liegen hier weder SMTP-Zugangsdaten noch ein Management-API-Token vor. Es wurden keine Testmails verschickt.

Supabase hat die Anpassung von Vorlagen für **neue Free-Projekte mit Standard-SMTP seit 3. Juni 2026 eingeschränkt**. Das VAVE.LOG-Projekt wurde danach erstellt. Ein eigener SMTP-Dienst ermöglicht die Anpassung auch im Free-Plan und ist für den Teamversand erforderlich. Ein kostenpflichtiger Supabase-Plan ist dafür nicht zwingend nötig.

## Sprachauswahl

Betreff, Vorschautext, Überschrift, Erläuterungen, Aktionsbutton, Sicherheitshinweis und Fußzeile werden gemeinsam übersetzt. Jede Supabase-Vorlage enthält genau eine Go-Bedingungskette, die nur eine vollständige Sprachfassung ausgibt:

| Gespeichertes `user_metadata.locale` | Ausgabe |
| --- | --- |
| `de` | Deutsch (`lang="de"`) |
| `zh` | Vereinfachtes Chinesisch (`lang="zh-CN"`) |
| `en`, fehlend, `null`, unbekannt oder falscher Datentyp | Englisch (`lang="en"`) |

Die App ermittelt ihre aktive Sprache anhand der System-/Browsersprache beziehungsweise der expliziten Sprachauswahl. Sie setzt den kanonischen Wert `en`, `de` oder `zh` bei der Registrierung über `signUp({ options: { data: { locale } } })` und synchronisiert die aktive Sprache bei angemeldeten Nutzern über `updateUser({ data: { locale } })`. Regionale Browserwerte wie `de-DE` oder `zh-CN` werden bereits in der App normalisiert. Die E-Mail-Vorlage akzeptiert nur die drei kanonischen Werte; rohe Regionalwerte fallen auf Englisch zurück.

Supabase kann beim Versand selbst keine System-/Browsersprache lesen. Passwortreset und spätere Sicherheitsbenachrichtigungen verwenden deshalb die zuletzt erfolgreich gespeicherte Sprache des Accounts. Für bestehende Accounts oder Einladungen ohne Sprachmetadaten gilt Englisch, bis die Metadaten gespeichert wurden. Eine bereits versandte Nachricht ändert ihre Sprache nicht nachträglich.

Die Go-Bedingung `and .Data (eq (printf "%s" .Data.locale) "de")` (analog für `zh`) prüft zunächst, ob Metadaten vorhanden sind. Der String-Vergleich bleibt auch bei unerwarteten JSON-Datentypen sicher. Der abschließende `else`-Zweig enthält Englisch. Der Metadatenwert selbst wird an keiner Stelle in den Mailtext, HTML-Attribute oder den Betreff geschrieben; er wählt ausschließlich statische, geprüfte Inhalte aus. Sprache ist eine Darstellungseinstellung und wird nicht für Berechtigungen verwendet.

## 1. Bestätigungslinks auf die richtige App führen

[URL Configuration für dieses Projekt](https://supabase.com/dashboard/project/ieeujtmpxqxmfyietqgw/auth/url-configuration) öffnen.

| Feld | Wert |
| --- | --- |
| Site URL | `https://hannespix.github.io/vave.log` (GitHub Pages; ohne Schrägstrich am Ende – Pages leitet `/vave.log?…` selbst auf `/vave.log/?…` um) |
| Redirect URL | `https://hannespix.github.io/vave.log/**` |
| Weitere Redirect URL | keine nötig – `?reset=1` liegt unter dem Muster oben |

Speichern. Nicht `localhost:3000` als Produktionsadresse stehen lassen. Die App übergibt ihre Rückleitung bei Registrierung und Passwortreset bereits; Supabase muss sie zusätzlich erlauben. Weitere echte Callback-Pfade, etwa für eine Registrierung während einer OAuth-Verbindung, später gezielt ergänzen. Keine pauschale Wildcard für fremde Domains verwenden.

**Token-Hash-Links statt Supabase-Weiterleitung (seit 15.10.2026):** Die Vorlagen verlinken nicht mehr `{{ .ConfirmationURL }}` (Supabase-Endpunkt `/auth/v1/verify`, der den Token sofort beim Abruf einlöst und dann weiterleitet), sondern `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=…`. Erst die App löst den Token mit `verifyOtp` ein (`src/web/main.tsx`). Zwei Probleme verschwinden damit: Link-Scanner in Mailprogrammen und Sicherheitsgateways, die jeden Link vorab abrufen, verbrauchen den Token nicht mehr (Symptom: `error_code=otp_expired`, obwohl die E-Mail in `auth.users` längst bestätigt ist); und der Link funktioniert auf jedem Gerät, weil kein PKCE-Verifier aus dem Browser der Registrierung nötig ist. Landet trotzdem eine Fehlerrückleitung in der App (`error_code` in Query oder Hash), zeigt sie einen Hinweis mit „Neuen Bestätigungslink anfordern“ (`auth.resend`). Die Site URL muss dafür stimmen – ohne sie führen die Links ins Leere.

**Fehler „Cannot GET /?code=…“ oder `otp_expired` auf localhost:3000:** Der Bestätigungslink hat zum lokalen Standardziel statt zur App geführt. Die CSP-Meldung zu `/.well-known/appspecific/com.chrome.devtools.json` kommt von Chromes DevTools und ist nicht die Ursache der falschen Rückleitung. Keine CSP-Ausnahme für localhost hinzufügen.

Nach der Korrektur zuerst die veröffentlichte App direkt öffnen und normal anmelden: Die E-Mail kann durch den Klick bereits bestätigt sein, obwohl die anschließende Weiterleitung fehlschlug. Wenn sie noch unbestätigt ist, im Supabase-Dashboard unter Auth > Users gezielt einen neuen Bestätigungslink für das eigene Testkonto anfordern. Bereits verbrauchte Links nicht wiederverwenden. Passwortreset erneut über „Passwort vergessen?“ anfordern und im selben Browser öffnen. Der PKCE-Code braucht den dort gespeicherten Verifier; nicht in einer anderen Browser-App testen. Keine Bestätigung abschalten und keine Auth-Tabellen manuell umschreiben.

## 2. Eigenen SMTP-Absender verbinden

Unter Auth > Email > SMTP Settings (bzw. [SMTP-Konfiguration](https://supabase.com/dashboard/project/ieeujtmpxqxmfyietqgw/auth/smtp)) einen vorhandenen Maildienst verbinden. Erforderlich sind Server, Port, Benutzername, Passwort und eine vom Anbieter freigegebene Absenderadresse. Den Absendernamen auf **VAVE.LOG** setzen. Die tatsächliche Absenderadresse bleibt offen, bis der Besitzer einen autorisierten Absender eingerichtet hat; keine erfundene Adresse von vave.studio verwenden.

Zugangsdaten direkt im Supabase-Dashboard eingeben, nicht im Chat oder Repository. Die vom Anbieter verlangten SPF-/DKIM-/DMARC-Einträge einrichten. Link- und Öffnungstracking für Auth-E-Mails deaktivieren: Linkumschreibungen können die Bestätigung beeinträchtigen. SMTP-Bestätigung und Auth-Rate-Limits prüfen, E-Mail-Bestätigung aktiviert lassen.

## 3. Vorlagen übernehmen

Die [Vorschau](email-preview.html) lokal im Browser öffnen. Sie zeigt alle **39 Sprachfassungen** mit Sprunglinks für English, Deutsch und 简体中文; die Auswahl benötigt kein JavaScript. Sie benötigt keine externen Bilder, Schriften oder Zugangsdaten. Vorschau-Buttons führen nur zum jeweiligen Vorschauhinweis. Die E-Mails verwenden die App-Farben `#641dff`, `#e8ffb9` und `#f8f9f6`, eine statische Textwortmarke, Inline-Stile, Tabellenlayout und einen Outlook-Fallback. So bleibt das Branding auch bei gesperrten Bildern lesbar. Keine Animation, Werbung oder Trackingpixel.

In [Auth > Email Templates](https://supabase.com/dashboard/project/ieeujtmpxqxmfyietqgw/auth/templates) jeweils **Subject** und **Body** ersetzen. Die Zuordnung steht in [subjects.json](../supabase/templates/subjects.json); der Body liegt in der gleichnamigen HTML-Datei unter [supabase/templates](../supabase/templates/). Alle Dateien sind vollständig, einschließlich der Supabase-Platzhalter und Sprachbedingungen. Den **gesamten bedingten Betreff** und den **gesamten Body** übernehmen, nicht nur eine einzelne Sprachfassung aus der Vorschau.

- Sechs Auth-Vorlagen: Registrierung, Account-Einladung, Anmeldelink, Passwortreset, E-Mail-Änderung und erneute Sicherheitsbestätigung.
- Sieben Sicherheitsbenachrichtigungen: Passwort, E-Mail, Telefon, verknüpfte/entfernte Anmeldung und hinzugefügte/entfernte Verifizierungsmethode.
- Die Vorlagen schalten keine neuen Anmeldeverfahren ein. Sicherheitsbenachrichtigungen werden nur versendet, wenn ihre jeweiligen Schalter in Supabase aktiv sind. Diese Schalter separat prüfen; das Branding-Paket verändert sie nicht.
- Die Supabase-Account-Einladung ist nicht die Workspace-Einladung der Anwendung. Letztere speichert weiterhin die Zuordnung ohne automatischen Mailversand und vergibt Rechte erst beim bestätigten Login.
- Dynamische Namen und sonstige nutzersteuerbare Metadaten werden nicht in die E-Mails übernommen. Aktionslinks sind Token-Hash-Links auf die Site (`{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=signup|invite|magiclink|recovery|email_change`, Passwortreset zusätzlich mit `reset=1`), der Sicherheitscode verwendet `{{ .Token }}`. Keine fest eingetragenen Zugangstokens oder erfundenen Ablaufzeiten; die Typen müssen zu `AUTH_LINK_TYPES` in `src/web/helpers.ts` passen.

Alternativ enthält [auth-email-branding.json](../supabase/auth-email-branding.json) den vollständigen, **ausschließlich auf Betreff und Inhalt begrenzten** PATCH-Body für `https://api.supabase.com/v1/projects/ieeujtmpxqxmfyietqgw/config/auth`. Vor einer Anwendung über die offizielle Management API bestehende Template-Felder sichern. Einen Management-Zugriffstoken nur über einen sicheren lokalen Secret-Kanal bereitstellen; ein Publishable- oder Service-Role-Key ersetzt diesen Token nicht. Der Body verändert weder SMTP noch Site URL, Redirects, Registrierung, Verifizierung oder Benachrichtigungsschalter.

## Pflege und Prüfung

Texte und gemeinsames Layout in `scripts/build-auth-emails.mjs` bearbeiten, danach `npm run emails:build`. Alle drei Sprachkataloge pflegen; unvollständige englische oder chinesische Inhalte lassen den Generator abbrechen. `npm run emails:check` vergleicht alle erzeugten Dateien einschließlich Vorschau und API-Payload; es verändert weder Dateien noch den gehosteten Dienst. Der normale CI-Check führt diesen Abgleich ebenfalls aus. `npm test -- tests/email-templates.test.ts` prüft alle Sprachfassungen, die genaue Go-Bedingungsstruktur mit geschütztem Metadatenzugriff und englischem Fallback, die erlaubten Payload-Felder, Link-/Code-Platzhalter und die skriptfreie Vorschau. Diese Strukturtests führen die Go-Engine nicht aus.

Nach Aktivierung mit dem eigenen Testkonto prüfen: Registrierung und Bestätigung, Anmeldung nach Rückkehr, Passwortreset und Sicherheitsbenachrichtigungen. Für `en`, `de` und `zh` jeweils Betreff und Body kontrollieren; bei fehlendem, unbekanntem und `null`-Wert muss Englisch erscheinen. Linkziel muss auf die echte Site führen. Desktop, schmalen Bildschirm und mindestens die tatsächlich genutzten Mailprogramme prüfen. HTML-Vorschau und Strukturprüfung ersetzen keinen echten Zustell- und Mailclient-Test. PKCE-E-Mails im selben Browser öffnen. Mailscanner können einmalige Bestätigungslinks vorab aufrufen; ein verbrauchter Link braucht einen neuen Versand, keine Lockerung der Auth-Sicherheit.

## Quellen

- https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/troubleshooting/customizing-emails-by-language-KZ_38Q
- https://pkg.go.dev/text/template
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/redirect-urls
