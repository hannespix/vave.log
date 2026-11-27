import { useI18n, I18nProvider, useLocaleMetadata } from './i18n';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient, type Session } from '@supabase/supabase-js';
import '@fontsource-variable/readex-pro';
import './theme.css';
import './styles.css';
import './appearance';
import { AuthForm, ConfirmEmail, OAuthConsent, PasswordReset, Setup, type AuthNotice, type RuntimeConfig } from './auth';
import { AuthLinkReview } from './auth-link';
import { Spinner, Notice } from './components';
const WorkspaceApp = React.lazy(() => import('./workspace').then(module => ({ default: module.WorkspaceApp })));
import { appPath, errorMessage, parseAuthLink, stripAuthLink, type AuthLink } from './helpers';
import { PwaProvider } from './pwa';

// Only a browser-bound recovery can survive a page reload in the same tab.
const RECOVERY_KEY = 'vave-log.pkce-recovery';
function pendingRecovery() { try { return window.sessionStorage.getItem(RECOVERY_KEY); } catch { return null; } }
function rememberRecovery(userId?: string) { try { if (userId) window.sessionStorage.setItem(RECOVERY_KEY, userId); else window.sessionStorage.removeItem(RECOVERY_KEY); } catch { /* ohne Speicher gilt das Formular nur bis zum Neuladen */ } }

function captureAuthLink() {
  const { search, hash, pathname, origin } = window.location;
  const clean = stripAuthLink(search, hash, pathname);
  if (clean === pathname + search + hash) return null;
  // Keep email credentials in memory and clear the address before creating any Auth client.
  window.history.replaceState(window.history.state, '', origin + clean);
  return parseAuthLink(search, hash);
}

function canReview(link: AuthLink) {
  const methods = [Boolean(link.code), Boolean(link.tokenHash && link.type), Boolean(link.legacy)];
  return !link.errorCode && !link.errorDescription && methods.filter(Boolean).length === 1;
}

function Connected({ config, initialLink }: { config: RuntimeConfig; initialLink: AuthLink | null }) {
  const { t } = useI18n();
  const noticeFor = (reset: boolean): AuthNotice => reset
    ? { text: t('Dieser Link zum Zurücksetzen gilt nicht mehr: Er ist abgelaufen, wurde schon verwendet oder es gibt eine neuere E-Mail. Fordere einen neuen Link an und nimm den aus der neuesten E-Mail.'), resend: false, forgot: true }
    : { text: t('Der Link ist abgelaufen oder wurde bereits verwendet. Melde dich einfach an – falls deine E-Mail-Adresse noch nicht bestätigt ist, fordere einen neuen Link an.'), resend: true };
  const [link, setLink] = useState(() => initialLink && canReview(initialLink) ? initialLink : null);
  const [linkNotice, setLinkNotice] = useState<AuthNotice | null>(() => initialLink && !canReview(initialLink) ? noticeFor(initialLink.reset) : null);
  const [session, setSession] = useState<Session | null>(null);
  const [recoveryUser, setRecoveryUser] = useState(pendingRecovery);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const client = useMemo(() => createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' } }), [config.supabaseUrl, config.supabasePublishableKey]);
  useEffect(() => {
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
      const pending = pendingRecovery();
      if (!next || (pending && pending !== next.user.id)) { rememberRecovery(); setRecoveryUser(null); }
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  // Abmelden gilt für dieses Gerät. Die Vorgabe von supabase-js beendet sonst alle Anmeldungen der Person – auch am Handy.
  async function signOut() { const { error } = await client.auth.signOut({ scope: 'local' }); if (error) { setError(errorMessage(error)); return; } setSession(null); }
  useLocaleMetadata(client, link ? undefined : session?.user);
  if (!ready) return <div className="boot"><Spinner label={t('Dein Workspace wird vorbereitet …')}/></div>;
  if (link) return <AuthLinkReview client={client} config={config} link={link} onCancel={() => setLink(null)} onInvalid={() => { setLinkNotice(noticeFor(link.reset)); setLink(null); }} onSession={(next, recovery) => { rememberRecovery(recovery ? next.user.id : undefined); setRecoveryUser(recovery ? next.user.id : null); setSession(next); setLink(null); }}/>;
  if (!session) return <>{error && <div className="global-alert"><Notice>{error}</Notice></div>}<AuthForm client={client} config={config} notice={linkNotice} onNoticeDone={() => setLinkNotice(null)}/></>;
  if (recoveryUser === session.user.id) {
    const finish = () => { rememberRecovery(); setRecoveryUser(null); };
    return <PasswordReset client={client} email={session.user.email ?? ''} done={finish} cancel={finish} expired={() => { finish(); setSession(null); setLinkNotice(noticeFor(true)); }}/>;
  }
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
function Root({ initialLink }: { initialLink: AuthLink | null }) {
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
  return <Connected config={config} initialLink={initialLink}/>;
}

function Embedded() {
  const { t } = useI18n();
  return <div className="boot"><a className="button primary" href={appPath()} target="_blank" rel="noopener noreferrer">{t('VAVE.LOG in einem eigenen Tab öffnen')}</a></div>;
}

const root = createRoot(document.getElementById('root')!);
if (window.self !== window.top) {
  root.render(<I18nProvider><Embedded/></I18nProvider>);
} else {
  const initialLink = captureAuthLink();
  root.render(<React.StrictMode><I18nProvider><PwaProvider><Root initialLink={initialLink}/></PwaProvider></I18nProvider></React.StrictMode>);
}
