import { useI18n, I18nProvider, useLocaleMetadata } from './i18n';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient, type Session } from '@supabase/supabase-js';
import '@fontsource-variable/readex-pro';
import './theme.css';
import './styles.css';
import './appearance';
import { AuthForm, ConfirmEmail, OAuthConsent, PasswordReset, Setup, type AuthNotice, type RuntimeConfig } from './auth';
import { Spinner, Notice } from './components';
const WorkspaceApp = React.lazy(() => import('./workspace').then(module => ({ default: module.WorkspaceApp })));
import { appPath, errorMessage, parseAuthLink, stripAuthLink } from './helpers';
import { PwaProvider } from './pwa';

// Merkt je Browser-Tab, dass gerade ein geprüfter Link zum Zurücksetzen eingelöst wurde (Wert: Konto-ID).
const RECOVERY_KEY = 'vave-log.recovery';
function pendingRecovery() { try { return window.sessionStorage.getItem(RECOVERY_KEY); } catch { return null; } }
function rememberRecovery(userId?: string) { try { if (userId) window.sessionStorage.setItem(RECOVERY_KEY, userId); else window.sessionStorage.removeItem(RECOVERY_KEY); } catch { /* ohne Speicher gilt das Formular nur bis zum Neuladen */ } }

function Connected({ config }: { config: RuntimeConfig }) {
  const { t } = useI18n();
  // Vor dem Client lesen: supabase-js räumt Token aus der Adresse, sobald es sie verarbeitet hat.
  const [link] = useState(() => parseAuthLink(window.location.search, window.location.hash));
  // Implizite Rückleitung statt PKCE: Der Link aus einer Auth-E-Mail muss auf jedem Gerät funktionieren, nicht nur in dem
  // Browser, der ihn angefordert hat. PKCE band ihn an einen dort gespeicherten Schlüssel – am Handy geöffnet oder nach
  // einer zweiten Anforderung scheiterte der Tausch („code challenge does not match“).
  const client = useMemo(() => createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } }), [config.supabaseUrl, config.supabasePublishableKey]);
  const [session, setSession] = useState<Session | null>(null); const [ready, setReady] = useState(false); const [error, setError] = useState(''); const [recovery, setRecovery] = useState(false); const [linkNotice, setLinkNotice] = useState<AuthNotice | null>(null);
  const resetFailed = () => setLinkNotice({ text: t('Dieser Link zum Zurücksetzen gilt nicht mehr: Er ist abgelaufen, wurde schon verwendet oder es gibt eine neuere E-Mail. Fordere einen neuen Link an und nimm den aus der neuesten E-Mail.'), resend: false, forgot: true });
  // Das Formular „Neues Passwort“ erscheint nur nach einem geprüften Link (Ereignis PASSWORD_RECOVERY, eingelöster
  // Token-Hash oder Token im Fragment) – nie allein wegen `?reset=1`. Vorher zeigte ein abgelaufener Link das Formular
  // trotzdem, sobald im Browser noch irgendeine Anmeldung lag, und das Speichern scheiterte mit „Session not found“.
  // Fehlerrückleitungen von Supabase (`error_code`) werden zu einem Hinweis mit dem passenden nächsten Schritt.
  useEffect(() => { let alive = true; let authEvent = 0; const { data } = client.auth.onAuthStateChange((event, next) => { authEvent++; if (!alive) return; setSession(next); setReady(true); if (event === 'PASSWORD_RECOVERY') { rememberRecovery(next?.user.id); setRecovery(true); } if (event === 'SIGNED_OUT') { rememberRecovery(); setRecovery(false); } }); const initialEvent = authEvent;
    const clean = () => window.history.replaceState({}, '', stripAuthLink(window.location.search, window.location.hash));
    const expired = () => setLinkNotice({ text: t('Der Link ist abgelaufen oder wurde bereits verwendet. Melde dich einfach an – falls deine E-Mail-Adresse noch nicht bestätigt ist, fordere einen neuen Link an.'), resend: true });
    const failed = Boolean(link.errorCode || link.errorDescription);
    if (failed) { clean(); if (link.reset) resetFailed(); else if (['otp_expired', 'access_denied'].includes(link.errorCode)) expired(); else setLinkNotice({ text: t('Der Link konnte nicht verarbeitet werden: {reason}', { reason: link.errorDescription || link.errorCode }), resend: false }); }
    const start = link.tokenHash && link.type ? client.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type }).then(({ data, error }) => { if (!alive) return; clean(); if (error) { if (link.type === 'recovery') resetFailed(); else expired(); } else if (link.type === 'recovery') { rememberRecovery(data.user?.id); setRecovery(true); } }).catch(() => { if (alive) { clean(); if (link.type === 'recovery') resetFailed(); else expired(); } }) : Promise.resolve();
    void start.then(() => client.auth.initialize()).then(async init => { const { data, error } = await client.auth.getSession(); if (!alive) return;
      if (link.reset && !link.tokenHash && !failed) { clean(); if (!init?.error && data.session && link.recoveryToken) { rememberRecovery(data.session.user.id); setRecovery(true); } else resetFailed(); }
      // Seite während des Zurücksetzens neu geladen: das Formular bleibt, solange dieselbe Anmeldung besteht.
      if (data.session && pendingRecovery() === data.session.user.id) setRecovery(true); else if (!data.session) rememberRecovery();
      if (initialEvent !== authEvent) return; if (error) setError(errorMessage(error)); setSession(data.session); setReady(true); }).catch(e => { if (alive) { setError(errorMessage(e)); setReady(true); } }); return () => { alive = false; data.subscription.unsubscribe(); };
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- t nur für Hinweistexte; der Link wird einmal beim Start gelesen.
  }, [client]);
  // Abmelden gilt für dieses Gerät. Die Vorgabe von supabase-js beendet sonst alle Anmeldungen der Person – auch am Handy.
  async function signOut() { const { error } = await client.auth.signOut({ scope: 'local' }); if (error) { setError(errorMessage(error)); return; } setSession(null); }
  useLocaleMetadata(client, session?.user);
  if (!ready) return <div className="boot"><Spinner label={t('Dein Workspace wird vorbereitet …')}/></div>;
  if (!session) return <>{error && <div className="global-alert"><Notice>{error}</Notice></div>}<AuthForm client={client} config={config} notice={linkNotice} onNoticeDone={() => setLinkNotice(null)}/></>;
  if (recovery) return <PasswordReset client={client} done={() => { rememberRecovery(); setRecovery(false); window.history.replaceState({}, '', appPath()); }} expired={() => { rememberRecovery(); setRecovery(false); setSession(null); resetFailed(); }}/>;
  if (!session.user.email_confirmed_at) return <ConfirmEmail session={session} signOut={() => void signOut()}/>;
  if (window.location.pathname === appPath('oauth/consent')) return <OAuthConsent key={session.user.id} client={client} session={session}/>;
  return <>{error && <div className="global-alert"><Notice>{error}</Notice></div>}<React.Suspense fallback={<div className="boot"><Spinner label={t('Dein Workspace wird geladen …')}/></div>}><WorkspaceApp key={session.user.id} client={client} session={session} config={config} signOut={signOut}/></React.Suspense></>;
}
/** Liest die im Pages-Build eingebettete Konfiguration (`<meta name="vave-config">`); fehlt sie oder ist sie unbrauchbar, lädt die App `api/config`. */
function inlineConfig(): RuntimeConfig | null {
  try {
    const raw = document.querySelector('meta[name="vave-config"]')?.getAttribute('content');
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<RuntimeConfig>;
    return typeof value.configured === 'boolean' && typeof value.supabaseUrl === 'string' && typeof value.supabasePublishableKey === 'string' && typeof value.appUrl === 'string' ? value as RuntimeConfig : null;
  } catch { return null; }
}
function Root() {
  const { t } = useI18n();
  const [config, setConfig] = useState<RuntimeConfig | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError('');
    const check = (value: RuntimeConfig) => { if (value.configured && (!value.supabaseUrl || !value.supabasePublishableKey)) throw new Error(t('Die Verbindung ist noch nicht vollständig eingerichtet.')); return value; };
    // Die statische Auslieferung (GitHub Pages) trägt die öffentliche Konfiguration im Dokument; dann entfällt der Request.
    const inline = inlineConfig();
    const load = inline ? Promise.resolve(check(inline)) : fetch(`${import.meta.env.BASE_URL}api/config`, { signal: controller.signal, cache: 'no-store' }).then(async res => { if (!res.ok) throw new Error(t('Die Server-Konfiguration konnte nicht geladen werden.')); return check(await res.json() as RuntimeConfig); });
    load.then(setConfig).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort();
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- Konfiguration einmal laden; t nur für Fehlertexte.
  }, []);
  if (loading) return <div className="boot"><span className="boot-word">VAVE<span>.LOG</span></span><Spinner label={t('Ein Moment für deinen Flow …')}/></div>;
  if (error || !config?.configured) return <Setup error={error} onRetry={() => window.location.reload()}/>;
  return <Connected config={config}/>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><I18nProvider><PwaProvider><Root/></PwaProvider></I18nProvider></React.StrictMode>);
