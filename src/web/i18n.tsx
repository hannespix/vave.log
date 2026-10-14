import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { Globe2 } from 'lucide-react';
import { SelectMenu } from './select-menu';
import { localeTag, resolveLocale, translate, type Locale } from '../shared/i18n';
import './i18n.css';
export { localeTag, type Locale } from '../shared/i18n';
type Preference = Locale | 'system';
type LocaleStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const storageKey = 'vave-log.locale';
function browserStorage(): LocaleStorage | undefined { try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; } }
export function readLocalePreference(storage: LocaleStorage | undefined = browserStorage()): Preference {
  try { const value = storage?.getItem(storageKey); return value === 'en' || value === 'de' || value === 'zh' ? value : 'system'; } catch { return 'system'; }
}
export function writeLocalePreference(storage: LocaleStorage | undefined, preference: Preference): void {
  try { if (preference === 'system') storage?.removeItem(storageKey); else storage?.setItem(storageKey, preference); } catch { /* Language still works when browser storage is blocked. */ }
}
export function getPreferredLocale(preference: Preference, languages: readonly string[]): Locale { return preference === 'system' ? resolveLocale(languages[0] ?? '') : preference; }
function languages(): readonly string[] { return typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]; }
let preference: Preference = readLocalePreference();
let activeLocale = getPreferredLocale(preference, languages());
const listeners = new Set<() => void>();
export function getLocale(): Locale { return activeLocale; }
function notify() { for (const listener of listeners) listener(); }
export function setLocalePreference(next: Preference) {
  preference = next; writeLocalePreference(browserStorage(), next); activeLocale = getPreferredLocale(next, languages()); notify();
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
const LocaleContext = createContext<Locale | null>(null);
export function I18nProvider({ children, initialLocale }: { children?: ReactNode; initialLocale?: Locale }) {
  const locale = useSyncExternalStore(subscribe, getLocale, () => initialLocale ?? 'en');
  useEffect(() => { document.documentElement.lang = localeTag(locale); document.title = 'VAVE.LOG'; }, [locale]);
  useEffect(() => {
    const refresh = () => { preference = readLocalePreference(); activeLocale = getPreferredLocale(preference, languages()); notify(); };
    const storage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) refresh(); };
    const systemChanged = () => { if (preference === 'system') { activeLocale = getPreferredLocale(preference, languages()); notify(); } };
    window.addEventListener('storage', storage); window.addEventListener('languagechange', systemChanged);
    return () => { window.removeEventListener('storage', storage); window.removeEventListener('languagechange', systemChanged); };
  }, []);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
export function useI18n() {
  const context = useContext(LocaleContext);
  const current = useSyncExternalStore(subscribe, getLocale, (): Locale => 'en');
  const locale = context ?? current;
  const t = useCallback((message: string, values?: Record<string, string | number>) => translate(message, locale, values), [locale]);
  return useMemo(() => ({ locale, t, setLocale: setLocalePreference }), [locale, t]);
}
export function LanguageSwitcher() {
  const { locale, t, setLocale } = useI18n();
  const selected = useSyncExternalStore(subscribe, () => preference, () => 'system' as Preference);
  return <SelectMenu className="language-switcher" label={t('Sprache')} value={selected} onChange={value => setLocale(value as Preference)} align="end" searchable={false}
    options={[{ value: 'system', label: t('Systemsprache') }, { value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }, { value: 'zh', label: '简体中文' }]}
    renderValue={() => <span className="language-switcher-display" aria-hidden="true"><Globe2 size={14}/><span>{{en:'EN',de:'DE',zh:'中文'}[locale]}</span></span>}/>;
}
// Metadata selects future email language only; it must never be used for authorization.
export function useLocaleMetadata(client: SupabaseClient, user: User | undefined) {
  const { locale } = useI18n();
  useEffect(() => {
    if (!user || user.user_metadata?.locale === locale) return;
    void client.auth.updateUser({ data: { locale } }).catch(() => { /* Local preference remains usable offline. */ });
  }, [client, user?.id, user?.user_metadata?.locale, locale]);
}
