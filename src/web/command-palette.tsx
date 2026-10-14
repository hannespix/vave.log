import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useI18n } from './i18n';
import { searchPalette, type PaletteEntry } from './helpers';

export type PaletteAction = PaletteEntry & { kindLabel: string; action: () => void };

// Globale Suche als Befehls-Palette: Ctrl/Cmd+K oder Lupe in der Kopfzeile.
// Eine Auswahl schließt zuerst die Palette und führt dann die Aktion aus,
// damit Fokus-Verschiebungen der Aktion (go/Modal) nicht verloren gehen.
export function CommandPalette({ items, onClose }: { items: PaletteAction[]; onClose: () => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = searchPalette(items, query);
  const current = Math.min(active, Math.max(0, results.length - 1));
  useEffect(() => { inputRef.current?.focus(); }, []);
  const pick = (item: PaletteAction) => { onClose(); item.action(); };
  return <div className="palette-overlay" role="presentation" onClick={onClose}>
    <div className="palette" role="dialog" aria-modal="true" aria-label={t('Globale Suche')} onClick={event => event.stopPropagation()}>
      <div className="palette-input"><Search size={16} aria-hidden="true"/><input ref={inputRef} value={query} role="combobox" aria-expanded="true" aria-controls="palette-results" aria-activedescendant={results[current] ? `palette-item-${results[current].id}` : undefined} aria-label={t('Globale Suche')} placeholder={t('Projekte, Aufgaben, Personen, Bereiche …')} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(Math.min(current + 1, results.length - 1)); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(current - 1, 0)); }
        else if (event.key === 'Enter') { event.preventDefault(); if (results[current]) pick(results[current]); }
        else if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      }}/></div>
      {results.length === 0
        ? <p className="palette-empty">{t('Keine Treffer.')}</p>
        : <ul className="palette-results" id="palette-results" role="listbox" aria-label={t('Suchergebnisse')}>{results.map((item, index) => <li key={item.id} id={`palette-item-${item.id}`} role="option" aria-selected={index === current}>
            <button type="button" tabIndex={-1} className={index === current ? 'active' : ''} onMouseEnter={() => setActive(index)} onClick={() => pick(item)}><span className="palette-kind">{t(item.kindLabel)}</span><span className="palette-title">{item.title}</span>{item.subtitle && <span className="palette-sub">{item.subtitle}</span>}</button>
          </li>)}</ul>}
      <p className="palette-hint">{t('↑↓ wählen · Enter öffnen · Esc schließen')}</p>
    </div>
  </div>;
}
