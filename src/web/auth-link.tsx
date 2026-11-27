import { useState } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { AuthShell, PasswordReset, type RuntimeConfig } from './auth';
import { type AuthLink } from './helpers';
import { useI18n } from './i18n';

type VerifiedLink = { client: SupabaseClient; email: string; userId: string };
interface Props {
  client: SupabaseClient;
  config: RuntimeConfig;
  link: AuthLink;
  onSession: (session: Session, recovery?: boolean) => void;
  onCancel: () => void;
  onInvalid: () => void;
}

async function verifyLegacy(client: SupabaseClient, legacy: NonNullable<AuthLink['legacy']>): Promise<Session | null> {
  const { data, error } = await client.auth.getUser(legacy.access_token);
  if (error || !data.user) return null;
  // Check that the session returned for the refresh token belongs to the same account.
  const refresh = await client.auth.refreshSession({ refresh_token: legacy.refresh_token });
  return !refresh.error && refresh.data.session?.user.id === data.user.id ? refresh.data.session : null;
}

export function AuthLinkReview({ client, config, link, onSession, onCancel, onInvalid }: Props) {
  const { t } = useI18n();
  const [verified, setVerified] = useState<VerifiedLink | null>(null);
  const [busy, setBusy] = useState(false);

  async function review() {
    setBusy(true);
    try {
      if (link.code) {
        // The SDK exchanges the code only with a verifier from the browser's matching PKCE flow.
        let recoveryUser: string | undefined;
        const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY') recoveryUser = session?.user.id;
        });
        try {
          const { data, error } = await client.auth.exchangeCodeForSession(link.code, link.flowId === undefined ? undefined : { flowId: link.flowId });
          if (error || !data.session) return onInvalid();
          onSession(data.session, recoveryUser === data.session.user.id);
        } finally { subscription.unsubscribe(); }
        return;
      }
      const isolated = createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'vave-log.email-link' },
      });
      const session = link.tokenHash && link.type
        ? (await isolated.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type })).data.session
        : link.legacy && await verifyLegacy(isolated, link.legacy);
      if (!session?.user.email) return onInvalid();
      setVerified({ client: isolated, email: session.user.email, userId: session.user.id });
    } catch { onInvalid(); }
    finally { setBusy(false); }
  }

  async function continueSession(account: VerifiedLink) {
    setBusy(true);
    try {
      const { data, error } = await account.client.auth.getSession();
      if (error || data.session?.user.id !== account.userId) return onInvalid();
      const accepted = await client.auth.setSession(data.session);
      if (accepted.error || !accepted.data.session) return onInvalid();
      onSession(accepted.data.session);
    } catch { onInvalid(); }
    finally { setBusy(false); }
  }

  if (verified && link.type === 'recovery') {
    return <PasswordReset client={verified.client} email={verified.email} done={() => continueSession(verified)} cancel={onCancel} expired={onInvalid}/>;
  }
  return <AuthShell><section className="auth-card">
    <h2>{t('E-Mail-Link bestätigen')}</h2>
    {verified && <p>{t('Konto {email}', { email: verified.email })}</p>}
    <div className="form-stack">
      <button className="button primary" disabled={busy} onClick={() => void (verified ? continueSession(verified) : review())}>
        {verified ? t('Mit diesem Konto fortfahren') : t('E-Mail-Link prüfen')}
      </button>
      <button className="text-button" disabled={busy} onClick={onCancel}>{t('Abbrechen')}</button>
    </div>
  </section></AuthShell>;
}
