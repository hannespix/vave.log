import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useI18n } from './i18n';
import { initials } from './helpers';
import type { Membership, Project } from '../shared/types';
import './select-menu.css';

export interface SelectOption {
  value: string;
  label: string;
  /** Second line below the label, e.g. client, email or role. */
  sublabel?: string;
  /** Right-aligned small text, e.g. a project code. */
  hint?: string;
  /** Color dot in front of the label (projects). */
  dot?: string;
  /** Initials avatar in front of the label (people). */
  avatar?: string;
  /** Group heading this option is listed under. */
  group?: string;
  /** Filter tab this option belongs to; options without a tab are always visible. */
  tab?: string;
  /** Additional search text that is not displayed. */
  keywords?: string;
  disabled?: boolean;
}
export interface SelectTab { id: string; label: string }
interface Props {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Form field name; the value is submitted through a hidden input. */
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Accessible name of the trigger. Always set it: it keeps the name stable while the menu is open. */
  label: string;
  id?: string;
  /** Default: search appears for more than 7 options. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Filter tabs above the list. Include an { id: '', label: 'All' } tab; empty tabs are hidden. */
  tabs?: SelectTab[];
  align?: 'start' | 'end';
  /** Compact trigger for toolbars and table rows. */
  compact?: boolean;
  /** Borderless trigger that blends into its surroundings (sidebar, topbar). */
  bare?: boolean;
  className?: string;
  /** Custom closed-state rendering, e.g. the language switcher globe. */
  renderValue?: (selected: SelectOption | undefined) => ReactNode;
}

/** Search normalization: case-, diacritic- and ß-insensitive multi-token match. */
function fold(text: string) { return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replaceAll('ß', 'ss').toLowerCase(); }
export function optionMatches(option: SelectOption, query: string) {
  const haystack = fold([option.label, option.sublabel, option.hint, option.group, option.keywords].filter(Boolean).join(' '));
  return fold(query).split(/\s+/).filter(Boolean).every(token => haystack.includes(token));
}
function Highlight({ text, query }: { text: string; query: string }) {
  const token = query.trim().split(/\s+/)[0] || '';
  const index = token ? text.toLowerCase().indexOf(token.toLowerCase()) : -1;
  if (index < 0) return <>{text}</>;
  return <>{text.slice(0, index)}<mark className="sm-mark">{text.slice(index, index + token.length)}</mark>{text.slice(index + token.length)}</>;
}

/** Shared option builders so people and projects look the same in every menu. */
export function projectOption(project: Project, nameOnly = false): SelectOption {
  return { value: project.id, label: nameOnly ? project.name : `${project.code} · ${project.name}`, sublabel: project.client || undefined, hint: nameOnly ? project.code : undefined, dot: project.color, tab: project.status, keywords: `${project.code} ${project.name} ${project.client}` };
}
export function memberOption(member: Membership): SelectOption {
  const name = member.display_name || member.email;
  return { value: member.user_id, label: name, sublabel: member.is_demo ? [member.demo_title, member.demo_studio].filter(Boolean).join(' · ') || undefined : (member.display_name ? member.email : undefined), avatar: initials(name), tab: member.role === 'owner' || member.role === 'manager' ? 'lead' : member.role, keywords: member.email };
}
/** Role tabs for people menus; shown only for teams where scanning stops working. */
export function memberTabs(members: Membership[], t: (key: string) => string): SelectTab[] | undefined {
  return members.length > 10 ? [{ id: '', label: t('Alle') }, { id: 'lead', label: t('Leitung') }, { id: 'member', label: t('Team') }] : undefined;
}
/** Status tabs for project menus that include paused or archived projects. */
export function projectTabs(projects: Project[], t: (key: string) => string): SelectTab[] | undefined {
  if (projects.length <= 6 || projects.every(project => project.status === 'active')) return undefined;
  return [{ id: '', label: t('Alle') }, { id: 'active', label: t('Aktiv') }, { id: 'paused', label: t('Pausiert') }, { id: 'archived', label: t('Archiviert') }];
}

export function SelectMenu({ options, value, defaultValue, onChange, name, required = false, disabled = false, placeholder, label, id, searchable, searchPlaceholder, emptyText, tabs, align = 'start', compact = false, bare = false, className, renderValue }: Props) {
  const { t } = useI18n();
  const listId = useId();
  const rootRef = useRef<HTMLSpanElement>(null); const triggerRef = useRef<HTMLButtonElement>(null); const searchRef = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? '');
  const current = controlled ? value : inner;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const selected = options.find(option => option.value === current);
  const hasSearch = searchable ?? options.length > 7;
  const visible = useMemo(() => options.filter(option => (!activeTab || !option.tab || option.tab === activeTab) && (!query.trim() || optionMatches(option, query))), [options, activeTab, query]);
  // Options render grouped: group order follows first appearance, ungrouped options come first.
  const rows = useMemo(() => {
    const groups = new Map<string, SelectOption[]>();
    for (const option of visible) { const key = option.group || ''; const list = groups.get(key); if (list) list.push(option); else groups.set(key, [option]); }
    return [...groups.entries()];
  }, [visible]);
  const flat = useMemo(() => rows.flatMap(([, list]) => list), [rows]);

  function openMenu() {
    if (disabled) return;
    setQuery(''); setActiveTab(''); setOpen(true);
    const index = options.filter(option => !option.disabled).findIndex(option => option.value === current);
    setActiveIndex(Math.max(0, index));
  }
  function close(focusTrigger = false) { setOpen(false); if (focusTrigger) triggerRef.current?.focus(); }
  function choose(option: SelectOption) {
    if (option.disabled) return;
    if (!controlled) setInner(option.value);
    onChange?.(option.value);
    close(true);
  }
  function move(delta: number) {
    if (!flat.length) return;
    let next = activeIndex < 0 ? (delta > 0 ? 0 : flat.length - 1) : activeIndex + delta;
    for (let i = 0; i < flat.length; i++) { const wrapped = (next + flat.length) % flat.length; if (!flat[wrapped]?.disabled) { setActiveIndex(wrapped); return; } next = wrapped + (delta > 0 ? 1 : -1); }
  }
  function onKeyDown(event: ReactKeyboardEvent) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMenu(); }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1); }
    else if (event.key === 'Home' && !hasSearch) { event.preventDefault(); setActiveIndex(flat.findIndex(option => !option.disabled)); }
    else if (event.key === 'End' && !hasSearch) { event.preventDefault(); setActiveIndex(flat.length - 1); }
    else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); const option = flat[activeIndex] ?? (flat.length === 1 ? flat[0] : undefined); if (option) choose(option); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === 'Tab') close();
  }
  useEffect(() => { if (open && activeIndex >= 0) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' }); }, [open, activeIndex, listId]);
  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);
  useEffect(() => { setActiveIndex(flat.findIndex(option => !option.disabled)); }, [query, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = triggerRef.current?.getBoundingClientRect(); if (!anchor) return;
      const viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;
      const width = Math.min(Math.max(anchor.width, compact || bare ? 248 : 268), viewportWidth - 16);
      const left = Math.min(Math.max(8, align === 'end' ? anchor.right - width : anchor.left), viewportWidth - width - 8);
      const below = viewportHeight - anchor.bottom - 12, above = anchor.top - 12;
      const up = below < Math.min(354, 230) && above > below;
      setPanelStyle(up ? { left, width, bottom: viewportHeight - anchor.top + 5, maxHeight: Math.min(354, above) } : { left, width, top: anchor.bottom + 5, maxHeight: Math.min(354, below) });
    };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => { window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); document.removeEventListener('pointerdown', onPointerDown, true); };
  }, [open, align, compact, bare]);

  let index = -1;
  return <span className={`sm-root${compact ? ' sm-is-compact' : ''}${bare ? ' sm-is-bare' : ''}${className ? ` ${className}` : ''}`} ref={rootRef} onKeyDown={onKeyDown}>
    <button type="button" ref={triggerRef} id={id} className="sm-trigger" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined} aria-label={label} title={label} data-value={current} disabled={disabled} onClick={() => open ? close() : openMenu()}>
      {renderValue ? renderValue(selected) : selected
        ? <span className="sm-value">{selected.dot && <span className="sm-dot" style={{ backgroundColor: selected.dot }} aria-hidden="true"/>}{selected.avatar && <span className="sm-avatar" aria-hidden="true">{selected.avatar}</span>}<span className="sm-value-label">{selected.label}</span></span>
        : <span className="sm-value sm-placeholder">{placeholder ?? t('Auswählen …')}</span>}
      <ChevronDown size={13} className="sm-chevron" aria-hidden="true"/>
    </button>
    {name && <input type="hidden" name={name} value={current} disabled={disabled}/>}
    {/* Focusable probe: native form validation blocks submits while nothing is chosen. */}
    {required && !disabled && <input className="sm-probe" tabIndex={-1} aria-hidden="true" required value={current} onChange={() => {}} onFocus={() => triggerRef.current?.focus()}/>}
    {open && <div className="sm-panel" style={panelStyle} onClick={event => event.preventDefault()}>
      {hasSearch && <div className="sm-search"><Search size={14} aria-hidden="true"/><input ref={searchRef} type="text" value={query} onChange={event => setQuery(event.target.value)} placeholder={searchPlaceholder ?? t('Suchen …')} aria-label={searchPlaceholder ?? t('Suchen …')} aria-controls={listId} aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} autoComplete="off" spellCheck={false}/></div>}
      {tabs && tabs.length > 1 && <div className="sm-tabs">{tabs.map(tab => {
        const count = tab.id ? options.filter(option => option.tab === tab.id).length : options.length;
        return tab.id && !count ? null : <button key={tab.id} type="button" className={`sm-tab${activeTab === tab.id ? ' sm-tab-active' : ''}`} aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}<span className="sm-count">{count}</span></button>;
      })}</div>}
      <div className="sm-list" role="listbox" id={listId} aria-label={label}>
        {rows.map(([group, list]) => <div className="sm-section" key={group || '·'}>
          {group && <div className="sm-group" role="presentation">{group}</div>}
          {list.map(option => { index++; const optionIndex = index; return <button type="button" key={option.value || '·'} id={`${listId}-${optionIndex}`} role="option" aria-selected={option.value === current} className={`sm-option${optionIndex === activeIndex ? ' sm-active' : ''}`} disabled={option.disabled} onMouseDown={event => event.preventDefault()} onMouseMove={() => activeIndex !== optionIndex && setActiveIndex(optionIndex)} onClick={() => choose(option)}>
            {option.dot && <span className="sm-dot" style={{ backgroundColor: option.dot }} aria-hidden="true"/>}
            {option.avatar && <span className="sm-avatar" aria-hidden="true">{option.avatar}</span>}
            <span className="sm-text"><span className="sm-label"><Highlight text={option.label} query={query}/></span>{option.sublabel && <span className="sm-sub"><Highlight text={option.sublabel} query={query}/></span>}</span>
            {option.hint && <span className="sm-hint">{option.hint}</span>}
            {option.value === current && <Check size={14} className="sm-check" aria-hidden="true"/>}
          </button>; })}
        </div>)}
        {!flat.length && <div className="sm-empty">{emptyText ?? t('Keine Treffer.')}</div>}
      </div>
    </div>}
  </span>;
}
