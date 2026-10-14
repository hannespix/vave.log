import { useI18n } from './i18n';
import type { Membership } from '../shared/types';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ArrowRight, Check, LoaderCircle, X } from 'lucide-react';
import { SelectMenu, memberOption, memberTabs } from './select-menu';

export function Spinner({ label = 'Wird geladen …' }: { label?: string }) {
  const { t } = useI18n(); return <div className="loading-state" role="status"><LoaderCircle className="spin" size={24}/><span>{t(label)}</span></div>; }
export function Notice({ children, kind = 'error' }: { children: ReactNode; kind?: 'error'|'success'|'info' }) {
  const { t } = useI18n(); return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{kind === 'success' && <Check size={17}/>}<div>{typeof children === 'string' ? t(children) : children}</div></div>; }
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  const { t } = useI18n(); return <div className="empty-state"><span className="empty-glyph" aria-hidden="true">↗</span><h3>{t(title)}</h3><p>{t(text)}</p>{action}</div>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const { t } = useI18n(); return <label className="field"><span>{t(label)}</span>{children}{hint && <small>{t(hint)}</small>}</label>; }
export function Dialog({ title, children, onClose, busy = false, description }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; description?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const dialog=ref.current; const opener=document.activeElement; dialog?.showModal(); return () => { dialog?.close(); if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true}); }; }, []);
  return <dialog ref={ref} className="dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><div className="dialog-heading"><div><p className="eyebrow">VAVE.LOG</p><h2 id={id}>{t(title)}</h2>{description && <p className="muted">{description}</p>}</div><button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label={t('Dialog schließen')}><X size={20}/></button></div>{children}</dialog>;
}
export function FormActions({ busy, onClose, label = 'Speichern' }: { busy: boolean; onClose: () => void; label?: string }) {
  const { t } = useI18n(); return <div className="form-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>{t('Abbrechen')}</button><button className="button primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <ArrowRight size={17}/>} {busy ? t('Wird gespeichert …') : t(label)}</button></div>; }

// Keep the current historical assignment in the options. Dropping it would
// omit it from submission even while it remains selected.
export function assigneeOptions(members: Membership[], currentAssignee: string | null | undefined, t: (message: string) => string) {
  const available = members.filter(member => member.role !== 'disabled' || member.user_id === currentAssignee);
  return [{ value: '', label: t('Noch nicht zugewiesen') }, ...available.map(member => {
    const option = memberOption(member);
    return member.role === 'disabled' ? { ...option, label: option.label + t(' (deaktiviert)'), tab: undefined } : option;
  })];
}
export function TaskAssigneeSelect({ members, currentAssignee }: { members: Membership[]; currentAssignee?: string | null }) {
  const { t } = useI18n();
  const available = members.filter(member => member.role !== 'disabled' || member.user_id === currentAssignee);
  return <Field label={t('Zugewiesen an')}><SelectMenu name="assignee" label={t('Zugewiesen an')} defaultValue={currentAssignee || ''} options={assigneeOptions(members, currentAssignee, t)} tabs={memberTabs(available, t)}/></Field>;
}
