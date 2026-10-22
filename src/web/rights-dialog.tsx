import { useState, type FormEvent } from 'react';
import type { Membership } from '../shared/types';
import type { Service } from '../shared/service';
import { LEVEL_NAMES, MODULES, MODULE_HINTS, MODULE_LEVELS, MODULE_NAMES, TEMPLATES, TEMPLATE_HINTS, TEMPLATE_NAMES, TEMPLATE_RIGHTS, effectiveRights, grantable, matchTemplate, rank, templateFor, type Level, type Module, type Rights, type RightsTemplate } from '../shared/rights';
import { Dialog, Field, FormActions, Notice } from './components';
import { SelectMenu } from './select-menu';
import { useI18n } from './i18n';
import './rights.css';

type Run = (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
const LEVELS: Level[] = ['none', 'view', 'edit'];

/** Dialog „Rechte“ je Person: Vorlage wählen oder die Matrix je Modul setzen. Mehr als die eigenen Rechte lässt weder die Oberfläche noch die Datenbank zu. */
export function RightsDialog({ member, own, service, run, busy, onClose }: { member: Membership; own: Rights; service: Service; run: Run; busy: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [template, setTemplate] = useState<RightsTemplate>(templateFor(member));
  const [matrix, setMatrix] = useState<Rights>(effectiveRights(member));
  const name = member.display_name || member.email;
  const choose = (next: RightsTemplate) => { setTemplate(next); if (next !== 'individuell') setMatrix({ ...TEMPLATE_RIGHTS[next] }); };
  const set = (module: Module, level: Level) => { const next = { ...matrix, [module]: level }; setMatrix(next); setTemplate(matchTemplate(next)); };
  const blocked = grantable(own, matrix);
  const templates = TEMPLATES.filter((tp) => grantable(own, TEMPLATE_RIGHTS[tp]).length === 0);
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (blocked.length) return; void run(() => service.setMemberRights({ workspace_id: member.workspace_id, user_id: member.user_id, template, permissions: template === 'individuell' ? matrix : undefined }), t('Rechte gespeichert.')); }
  return <Dialog title={t('Rechte von {name}', { name })} onClose={onClose} busy={busy} wide>
    <form className="form-stack" onSubmit={submit}>
      <Field label={t('Vorlage')} hint={t(TEMPLATE_HINTS[template])}><SelectMenu label={t('Vorlage')} value={template} onChange={(value) => choose(value as RightsTemplate)} searchable={false} options={[...templates.map((tp) => ({ value: tp, label: t(TEMPLATE_NAMES[tp]) })), { value: 'individuell', label: t(TEMPLATE_NAMES.individuell) }]}/></Field>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={t('Rechte je Modul')}><table className="rights-grid"><thead><tr><th scope="col">{t('Modul')}</th>{LEVELS.map((level) => <th scope="col" key={level}>{t(LEVEL_NAMES[level])}</th>)}</tr></thead><tbody>
        {MODULES.map((module) => <tr key={module}><th scope="row"><strong>{t(MODULE_NAMES[module])}</strong><small className="muted">{t(MODULE_HINTS[module])}</small></th>{LEVELS.map((level) => { const allowed = MODULE_LEVELS[module].includes(level); const over = rank(level) > rank(own[module]); return <td key={level}>{allowed ? <input type="radio" name={`rights-${module}`} aria-label={`${t(MODULE_NAMES[module])}: ${t(LEVEL_NAMES[level])}`} checked={matrix[module] === level} disabled={busy || over} title={over ? t('Mehr als deine eigenen Rechte kannst du nicht vergeben.') : undefined} onChange={() => set(module, level)}/> : <span className="muted" aria-hidden="true">–</span>}</td>; })}</tr>)}
      </tbody></table></div>
      {blocked.length > 0 && <Notice>{t('Mehr als deine eigenen Rechte kannst du nicht vergeben: {modules}', { modules: blocked.map((m) => t(MODULE_NAMES[m])).join(', ') })}</Notice>}
      <p className="tiny muted">{t('Immer erlaubt: eigene Zeiten und Timer, eigene Abwesenheiten, eigene Konten, Projekt- und Mitgliederliste, eigene Aufgaben. Owner-Rollen vergibt nur ein Owner.')}</p>
      <FormActions busy={busy} onClose={onClose} label={t('Rechte speichern')}/>
    </form>
  </Dialog>;
}
