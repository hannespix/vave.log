import { useSyncExternalStore } from 'react';
import { useI18n } from './i18n';
import { SelectMenu } from './select-menu';

type Appearance = 'system' | 'light' | 'dark';
const storageKey = 'vave-log.appearance';
const listeners = new Set<() => void>();

function readAppearance(): Appearance {
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* The system setting remains available when storage is blocked. */ }
  return 'system';
}

let appearance = readAppearance();
const system = typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');
function applyAppearance(next: Appearance) {
  appearance = next;
  const resolved = next === 'system' ? (system?.matches ? 'dark' : 'light') : next;
  document.documentElement.dataset.appearance = resolved;
  for (const listener of listeners) listener();
}
if (typeof window !== 'undefined') {
  applyAppearance(appearance);
  system?.addEventListener('change', () => {
    if (appearance === 'system') applyAppearance('system');
  });
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) applyAppearance(readAppearance());
  });
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function AppearanceSettings() {
  const { t } = useI18n();
  const selected = useSyncExternalStore(subscribe, () => appearance, (): Appearance => 'system');
  const label = t('Farbschema');
  return <section className="panel">
    <h2>{t('Darstellung')}</h2>
    <div className="field">
      <span>{label}</span>
      <SelectMenu label={label} value={selected} searchable={false}
        options={[
          { value: 'system', label: t('System') },
          { value: 'light', label: t('Hell') },
          { value: 'dark', label: t('Dunkel') }
        ]}
        onChange={value => {
          if (value !== 'light' && value !== 'dark' && value !== 'system') return;
          try {
            if (value === 'system') window.localStorage.removeItem(storageKey);
            else window.localStorage.setItem(storageKey, value);
          } catch { /* The current view still changes when storage is blocked. */ }
          applyAppearance(value);
        }}
      />
    </div>
  </section>;
}
