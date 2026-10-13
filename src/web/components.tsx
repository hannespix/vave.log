import type { Membership } from '../shared/types';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ArrowRight, Check, LoaderCircle, X } from 'lucide-react';

export function Spinner({ label = 'Wird geladen …' }: { label?: string }) { return <div className="loading-state" role="status"><LoaderCircle className="spin" size={24}/><span>{label}</span></div>; }
export function Notice({ children, kind = 'error' }: { children: ReactNode; kind?: 'error'|'success'|'info' }) { return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{kind === 'success' && <Check size={17}/>}<div>{children}</div></div>; }
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><span className="empty-glyph" aria-hidden="true">↗</span><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Dialog({ title, children, onClose, busy = false, description }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; description?: string }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className="dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><div className="dialog-heading"><div><p className="eyebrow">VAVE.LOG</p><h2 id={id}>{title}</h2>{description && <p className="muted">{description}</p>}</div><button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label="Dialog schließen"><X size={20}/></button></div>{children}</dialog>;
}
export function FormActions({ busy, onClose, label = 'Speichern' }: { busy: boolean; onClose: () => void; label?: string }) { return <div className="form-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>Abbrechen</button><button className="button primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <ArrowRight size={17}/>} {busy ? 'Wird gespeichert …' : label}</button></div>; }

export function TaskAssigneeSelect({ members, currentAssignee }: { members: Membership[]; currentAssignee?: string | null }) {
  // Keep the current historical assignment successful in FormData. Disabling its
  // option would omit it from submission even while it remains selected.
  const options = members.filter(member => member.role !== 'disabled' || member.user_id === currentAssignee);
  return <Field label="Zugewiesen an"><select name="assignee" defaultValue={currentAssignee || ''}>
    <option value="">Noch nicht zugewiesen</option>
    {options.map(member => <option value={member.user_id} key={member.user_id}>
      {member.display_name || member.email}{member.role === 'disabled' ? ' (deaktiviert)' : ''}
    </option>)}
  </select></Field>;
}
