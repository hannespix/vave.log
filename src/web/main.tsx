import { useI18n, I18nProvider, useLocaleMetadata } from './i18n';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient, type Session } from '@supabase/supabase-js';
import '@fontsource-variable/readex-pro';
import './styles.css';
import { AuthForm, ConfirmEmail, OAuthConsent, PasswordReset, Setup, type RuntimeConfig } from './auth';
import { Spinner, Notice } from './components';
const WorkspaceApp = React.lazy(() => import('./workspace').then(module => ({ default: module.WorkspaceApp })));
import { appPath, errorMessage, parseAuthLink, stripAuthLink } from './helpers';
import { PwaProvider } from './pwa';

function Connected({ config }: { config: RuntimeConfig }) {
  const { t } = useI18n();
  const client = useMemo(() => createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } }), [config.supabaseUrl, config.supabasePublishableKey]);
  const [session, setSession] = useState<Session | null>(null); const [ready, setReady] = useState(false); const [error, setError] = useState(''); const [recovery, setRecovery] = useState(() => parseAuthLink(window.location.search, window.location.hash).reset); const [linkNotice, setLinkNotice] = useState<{ text: string; resend: boolean } | null>(null);
  // Token-Hash-Links aus den Auth-E-Mails (`?token_hash=…&type=…`) löst erst die App ein – nicht der bloße Abruf
  // der Seite durch einen Link-Scanner im Mailprogramm. Fehlerrückleitungen von Supabase (`error_code`) werden
  // in einen Hinweis mit „neuen Link anfordern“ übersetzt; die Adresse wird danach bereinigt.
  useEffect(() => { let alive = true; let authEvent = 0; const { data } = client.auth.onAuthStateChange((event, next) => { authEvent++; if (!alive) return; setSession(next); setReady(true); if (event === 'PASSWORD_RECOVERY') setRecovery(true); if (event === 'SIGNED_OUT') setRecovery(false); }); const initialEvent = authEvent;
    const link = parseAuthLink(window.location.search, window.location.hash); const clean = () => window.history.replaceState({}, '', stripAuthLink(window.location.search, window.location.hash));
    const expired = () => setLinkNotice({ text: t('Der Link ist abgelaufen oder wurde bereits verwendet. Melde dich einfach an – falls deine E-Mail-Adresse noch nicht bestätigt ist, fordere einen neuen Link an.'), resend: true });
    if (link.errorCode || link.errorDescription) { clean(); if (['otp_expired', 'access_denied'].includes(link.errorCode)) expired(); else setLinkNotice({ text: t('Der Link konnte nicht verarbeitet werden: {reason}', { reason: link.errorDescription || link.errorCode }), resend: false }); }
    const start = link.tokenHash && link.type ? client.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type }).then(({ error }) => { if (!alive) return; clean(); if (error) expired(); else if (link.type === 'recovery') setRecovery(true); }).catch(() => { if (alive) { clean(); expired(); } }) : Promise.resolve();
    void start.then(() => client.auth.getSession()).then(({ data, error }) => { if (!alive || initialEvent !== authEvent) return; if (error) setError(errorMessage(error)); setSession(data.session); setReady(true); }).catch(e => { if (alive) { setError(errorMessage(e)); setReady(true); } }); return () => { alive = false; data.subscription.unsubscribe(); };
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- t nur für Hinweistexte.
  }, [client]);
  async function signOut() { const { error } = await client.auth.signOut(); if (error) { setError(errorMessage(error)); return; } setSession(null); }
  useLocaleMetadata(client, session?.user);
  if (!ready) return <div className="boot"><Spinner label={t('Dein Workspace wird vorbereitet …')}/></div>;
  if (!session) return <>{error && <div className="global-alert"><Notice>{error}</Notice></div>}<AuthForm client={client} config={config} notice={linkNotice} onNoticeDone={() => setLinkNotice(null)}/></>;
  if (recovery) return <PasswordReset client={client} done={() => { setRecovery(false); window.history.replaceState({}, '', appPath()); }}/>;
  if (!session.user.email_confirmed_at) return <ConfirmEmail session={session} signOut={() => void signOut()}/>;
  if (window.location.pathname === appPath('oauth/consent')) return <OAuthConsent key={session.user.id} client={client} session={session}/>;
  return <>{error && <div className="global-alert"><Notice>{error}</Notice></div>}<React.Suspense fallback={<div className="boot"><Spinner label={t('Dein Workspace wird geladen …')}/></div>}><WorkspaceApp key={session.user.id} client={client} session={session} config={config} signOut={signOut}/></React.Suspense></>;
}
function Root() {
  const { t } = useI18n();
  const [config, setConfig] = useState<RuntimeConfig | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- Konfiguration einmal laden; t nur für Fehlertexte.
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); fetch(`${import.meta.env.BASE_URL}api/config`, { signal: controller.signal, cache: 'no-store' }).then(async res => { if (!res.ok) throw new Error(t('Die Server-Konfiguration konnte nicht geladen werden.')); const value = await res.json() as RuntimeConfig; if (value.configured && (!value.supabaseUrl || !value.supabasePublishableKey)) throw new Error(t('Die Verbindung ist noch nicht vollständig eingerichtet.')); setConfig(value); }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, []);
  if (loading) return <div className="boot"><span className="boot-word">VAVE<span>.LOG</span></span><Spinner label={t('Ein Moment für deinen Flow …')}/></div>;
  if (error || !config?.configured) return <Setup error={error} onRetry={() => window.location.reload()}/>;
  return <Connected config={config}/>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><I18nProvider><PwaProvider><Root/></PwaProvider></I18nProvider></React.StrictMode>);
