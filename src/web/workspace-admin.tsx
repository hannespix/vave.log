import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ChevronLeft,RefreshCw,Trash2} from 'lucide-react';
import type {createWorkspaceAdminService} from '../shared/workspace-admin-service';
import type {WorkspaceAdminSummary} from '../shared/workspace-admin-types';
import {Dialog,Field,Notice,Spinner} from './components';
import {useI18n} from './i18n';
import {workspaceAdminText as text} from './workspace-admin-copy';
import './workspace-admin.css';

type AdminService=ReturnType<typeof createWorkspaceAdminService>;
export function WorkspaceAdminList({workspaces,currentId,onDelete,busy}:{workspaces:WorkspaceAdminSummary[];currentId?:string;onDelete:(workspace:WorkspaceAdminSummary)=>void;busy:boolean}){
 const {locale}=useI18n();
 return <div className="workspace-admin-list">{workspaces.length?workspaces.map(workspace=><article className="workspace-admin-row" key={workspace.id}>
  <div><h3>{workspace.name}</h3><p className="tiny muted">{text(locale,workspace.is_demo?'demo':'studio')} · {text(locale,workspace.archived_at?'archived':'active')}{workspace.id===currentId&&<> · {text(locale,'current')}</>}</p></div>
  <button className="button secondary small danger-text" type="button" aria-label={text(locale,'deleteLabel',{name:workspace.name})} disabled={busy} onClick={()=>onDelete(workspace)}><Trash2 size={15}/>{text(locale,'delete')}</button>
 </article>):<p className="muted">{text(locale,'empty')}</p>}</div>;
}

export function WorkspaceDeleteConfirmation({workspace,confirmationName,confirmed,busy,online,blocked=false,onNameChange,onConfirmedChange,onBack,onSubmit}:{workspace:WorkspaceAdminSummary;confirmationName:string;confirmed:boolean;busy:boolean;online:boolean;blocked?:boolean;onNameChange:(name:string)=>void;onConfirmedChange:(confirmed:boolean)=>void;onBack:()=>void;onSubmit:()=>void}){
 const {locale}=useI18n();
 const allowed=confirmationName===workspace.name&&confirmed&&online&&!busy&&!blocked&&workspace.running_timers===0;
 function submit(event:FormEvent){event.preventDefault();if(allowed)onSubmit();}
 return <form className="form-stack workspace-delete-form" onSubmit={submit}>
  <button className="text-button workspace-admin-back" type="button" onClick={onBack} disabled={busy}><ChevronLeft size={16}/>{text(locale,'back')}</button>
  <h3 className="workspace-delete-name">{workspace.name}</h3>
  <div className="workspace-delete-warning"><p><strong>{text(locale,'permanent')}</strong></p><p>{text(locale,'finances')}</p><p>{text(locale,'accounts')}</p></div>
  <section aria-label={text(locale,'counts')}><h4>{text(locale,'counts')}</h4><dl className="workspace-delete-counts">{(['projects','tasks','time_entries','members','invoices','expenses'] as const).map(key=><div key={key}><dt>{text(locale,key)}</dt><dd>{workspace.counts[key]}</dd></div>)}</dl></section>
  {workspace.running_timers>0&&<Notice>{text(locale,'running_timers')}</Notice>}
  {!online&&<Notice>{text(locale,'offline')}</Notice>}
  <Field label={text(locale,'nameLabel')} hint={text(locale,'nameHint')}><input name="confirmationName" value={confirmationName} onChange={event=>onNameChange(event.target.value)} disabled={busy} required autoComplete="off" spellCheck={false}/></Field>
  <label className="checkbox-field"><input type="checkbox" checked={confirmed} onChange={event=>onConfirmedChange(event.target.checked)} disabled={busy}/>{text(locale,'acknowledge')}</label>
  <div className="form-actions"><button className="button secondary" type="button" onClick={onBack} disabled={busy}>{text(locale,'back')}</button><button className="button danger" type="submit" disabled={!allowed}>{text(locale,busy?'deleting':'submit')}</button></div>
 </form>;
}

export function WorkspaceAdminDialog({service,currentId,onClose,onDeleted}:{service:AdminService;currentId?:string;onClose:()=>void;onDeleted:(id:string)=>void}){
 const {locale}=useI18n();const [workspaces,setWorkspaces]=useState<WorkspaceAdminSummary[]>([]);const [selected,setSelected]=useState<WorkspaceAdminSummary|null>(null);
 const [confirmationName,setConfirmationName]=useState('');const [confirmed,setConfirmed]=useState(false);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');const [deleted,setDeleted]=useState(false);const [online,setOnline]=useState(()=>typeof navigator==='undefined'||navigator.onLine);
 const alive=useRef(true);const generation=useRef(0);const submitting=useRef(false);const content=useRef<HTMLDivElement>(null);
 useEffect(()=>{alive.current=true;const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{alive.current=false;generation.current++;window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 const load=useCallback(async()=>{const request=++generation.current;setLoading(true);setError('');try{const list=await service.listOwned();if(alive.current&&request===generation.current)setWorkspaces(list);}catch{if(alive.current&&request===generation.current)setError('loadError');}finally{if(alive.current&&request===generation.current)setLoading(false);}},[service]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(!loading)content.current?.focus();},[selected?.id,loading]);
 const back=()=>{setSelected(null);setConfirmationName('');setConfirmed(false);setError('');void load();};
 async function remove(){
  if(!selected||submitting.current||(error&&error!=='confirmation')||confirmationName!==selected.name||!confirmed||!online||selected.running_timers>0)return;
  submitting.current=true;setBusy(true);setError('');const id=selected.id;
  try{await service.deleteWorkspace({workspaceId:id,confirmationName,confirmed:true});if(!alive.current)return;setWorkspaces(list=>list.filter(w=>w.id!==id));setSelected(null);setConfirmationName('');setConfirmed(false);setDeleted(true);onDeleted(id);}
  catch(cause){if(alive.current){const code=(cause as {code?:string})?.code;setError(code&&['forbidden','confirmation','running_timers','not_found'].includes(code)?code:'failed');setConfirmed(false);}}
  finally{submitting.current=false;if(alive.current)setBusy(false);}
 }
 return <Dialog title={text(locale,selected?'deleteTitle':'title')} onClose={onClose} busy={busy}>
  <div className="workspace-admin-content" ref={content} tabIndex={-1}>
   {error&&<Notice>{text(locale,error as 'failed')}</Notice>}{deleted&&!selected&&<Notice kind="success">{text(locale,'deleted')}</Notice>}
   {selected?<WorkspaceDeleteConfirmation workspace={selected} confirmationName={confirmationName} confirmed={confirmed} busy={busy} online={online} blocked={Boolean(error&&error!=='confirmation')} onNameChange={setConfirmationName} onConfirmedChange={setConfirmed} onBack={back} onSubmit={()=>void remove()}/>:<>
    <p className="muted">{text(locale,'intro')}</p>{loading?<Spinner label={text(locale,'loading')}/>:!error&&<WorkspaceAdminList workspaces={workspaces} currentId={currentId} busy={busy} onDelete={workspace=>{setSelected(workspace);setConfirmationName('');setConfirmed(false);setDeleted(false);setError('');}}/>}
    <div className="form-actions"><button className="button secondary" type="button" disabled={loading||busy||!online} onClick={()=>void load()}><RefreshCw size={15}/>{text(locale,error?'retry':'refresh')}</button></div>
   </>}
  </div>
 </Dialog>;
}
