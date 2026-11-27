# VAVE.LOG: Auth-E-Mails und Rückleitungen

## Stand

Die vorbereiteten Bestätigungs-, Einladungs-, Anmelde-, Passwortreset- und E-Mail-Änderungs-Links tragen den Einmal-Token im URL-Fragment. Nach dem Öffnen prüft die App den Link auf ausdrückliche Bestätigung hin und zeigt das erkannte Konto. Supabase-Standardvorlagen verwenden weiterhin die Weiterleitung über den Auth-Dienst.

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

**Geräteübergreifende Links aus den vorbereiteten Vorlagen.** `{{ .SiteURL }}/#token_hash={{ .TokenHash }}&type=…` hält den Token aus der HTTP-Anfrage heraus. Die App entfernt die Auth-Parameter vor dem Start des Auth-Clients aus der Adresszeile. „E-Mail-Link prüfen“ löst den Token in einer separaten Sitzung ein. Die App zeigt die geprüfte E-Mail-Adresse, bevor die Person mit diesem Konto fortfährt oder dessen Passwort ändert. Ein automatischer Vorababruf der Seite allein löst den Token nicht ein. Die alten Query-Links bleiben über denselben Dialog nutzbar. Server und Proxys sollten die Auth-Parameter alter URLs aus Zugriffslogs ausblenden.

**Rückleitung mit PKCE.** Standardvorlagen von Supabase können bei einer Registrierung oder einem Reset auf einen Code weiterleiten. Öffne die E-Mail für diesen Weg im selben Browserprofil, das sie angefordert hat. Der beim Start gespeicherte PKCE-Verifier muss zum Code passen. Die App kann den geräteübergreifenden Reset nach dem Einlösen eines E-Mail-Links bis zum Neuladen im Arbeitsspeicher halten. Falls der Tab geschlossen oder neu geladen wird, fordere einen neuen Link an.

**Fehler „Cannot GET /?code=…“ oder `otp_expired` auf localhost:3000:** Der Bestätigungslink hat zum lokalen Standardziel statt zur App geführt. Die CSP-Meldung zu `/.well-known/appspecific/com.chrome.devtools.json` kommt von Chromes DevTools und ist nicht die Ursache der falschen Rückleitung. Keine CSP-Ausnahme für localhost hinzufügen.

Nach der Korrektur zuerst die veröffentlichte App direkt öffnen und normal anmelden. Die E-Mail kann bereits bestätigt sein, wenn die Standardweiterleitung fehlgeschlagen ist. Falls sie noch unbestätigt ist, über „Neuen Bestätigungslink anfordern“ einen frischen Link für das eigene Testkonto anfordern. Für einen abgelaufenen Passwortreset „Passwort vergessen?“ verwenden.

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
- Die Aktionslinks verwenden den Linktyp aus `AUTH_LINK_TYPES` und den Platzhalter `{{ .TokenHash }}` im Fragment. Die erneute Sicherheitsbestätigung verwendet `{{ .Token }}` für den Sicherheitscode. Die Sprachmetadaten wählen die Fassung aus.

Alternativ enthält [auth-email-branding.json](../supabase/auth-email-branding.json) den vollständigen, **ausschließlich auf Betreff und Inhalt begrenzten** PATCH-Body für `https://api.supabase.com/v1/projects/ieeujtmpxqxmfyietqgw/config/auth`. Vor einer Anwendung über die offizielle Management API bestehende Template-Felder sichern. Einen Management-Zugriffstoken nur über einen sicheren lokalen Secret-Kanal bereitstellen; ein Publishable- oder Service-Role-Key ersetzt diesen Token nicht. Der Body verändert weder SMTP noch Site URL, Redirects, Registrierung, Verifizierung oder Benachrichtigungsschalter.

## Pflege und Prüfung

Texte und gemeinsames Layout in `scripts/build-auth-emails.mjs` bearbeiten, danach `npm run emails:build`. Alle drei Sprachkataloge pflegen; unvollständige englische oder chinesische Inhalte lassen den Generator abbrechen. `npm run emails:check` vergleicht alle erzeugten Dateien einschließlich Vorschau und API-Payload; es verändert weder Dateien noch den gehosteten Dienst. Der normale CI-Check führt diesen Abgleich ebenfalls aus. `npm test -- tests/email-templates.test.ts` prüft alle Sprachfassungen, die genaue Go-Bedingungsstruktur mit geschütztem Metadatenzugriff und englischem Fallback, die erlaubten Payload-Felder, Link-/Code-Platzhalter und die skriptfreie Vorschau. Diese Strukturtests führen die Go-Engine nicht aus.

Nach Aktivierung mit dem eigenen Testkonto Registrierung und Bestätigung, Anmeldung nach Rückkehr, Passwortreset und Sicherheitsbenachrichtigungen prüfen. Bei den Fragmentlinks einen zweiten Browser verwenden und prüfen, welches Konto der Dialog vor dem Fortfahren anzeigt. Die Standardweiterleitung mit PKCE im Browserprofil der Anforderung prüfen. Für `en`, `de` und `zh` jeweils Betreff und Inhalt kontrollieren. Bei fehlendem, unbekanntem und `null`-Wert erscheint Englisch. Den tatsächlichen Versand auf Desktop, Mobilgerät und in den verwendeten Mailprogrammen prüfen.

## Quellen

- https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/troubleshooting/customizing-emails-by-language-KZ_38Q
- https://pkg.go.dev/text/template
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/redirect-urls
