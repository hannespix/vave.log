import {useEffect,useState,type FormEvent} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {Plug} from 'lucide-react';
import {Field,Notice,Spinner} from './components';
import {useI18n} from './i18n';
import {uuid} from '../shared/validation';

const translations={
  de:{title:'MCP-Freigaben',intro:'Erlaube einem OAuth-Client den Zugriff auf diesen Workspace. Wähle für die Freigabe Lesen oder Zeitvorschläge.',
    client:'OAuth-Client-ID',proposals:'Zeitvorschläge erlauben',save:'Freigeben',remove:'Zugriff entfernen',missing:'Gib eine gültige OAuth-Client-ID ein.',
    read:'Lesen',suggest:'Lesen und Vorschlagen',fail:'Die MCP-Freigabe konnte nicht geladen oder gespeichert werden.',saved:'MCP-Freigabe gespeichert.'},
  en:{title:'MCP access',intro:'Allow an OAuth client to access this workspace. Choose read access or allow time suggestions.',
    client:'OAuth client ID',proposals:'Allow time suggestions',save:'Grant access',remove:'Remove access',missing:'Enter a valid OAuth client ID.',
    read:'Read',suggest:'Read and propose',fail:'MCP access could not be loaded or saved.',saved:'MCP access saved.'},
  zh:{title:'MCP 访问权限',intro:'允许 OAuth 客户端访问此工作区。可选择只读或允许提出工时建议。',
    client:'OAuth 客户端 ID',proposals:'允许提出工时建议',save:'授予访问权限',remove:'移除访问权限',missing:'请输入有效的 OAuth 客户端 ID。',
    read:'读取',suggest:'读取并提出建议',fail:'无法加载或保存 MCP 权限。',saved:'MCP 权限已保存。'}
}as const;
type Access={client_id:string;allow_proposals:boolean};

export function ConnectorSettings({client,workspaceId}:{client:SupabaseClient;workspaceId:string}){
  const {locale}=useI18n();
  const copy=translations[locale];
  const [access,setAccess]=useState<Access[]>();
  const [clientId,setClientId]=useState('');
  const [allowProposals,setAllowProposals]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<'fail'|'missing'|'saved'>();
  useEffect(()=>{
    let active=true;
    client.rpc('vave_mcp_access',{p_workspace_id:workspaceId}).then(({data,error})=>{
      if(!active)return;
      if(error)setMessage('fail');
      setAccess(error?[]:(data??[]) as Access[]);
    },()=>{
      if(active){setAccess([]);setMessage('fail')}
    });
    return()=>{active=false};
  },[client,workspaceId]);

  async function change(id:string,mode:'read'|'propose'|'off'){
    if(!uuid.safeParse(id).success){setMessage('missing');return}
    setBusy(true);
    setMessage(undefined);
    try{
      const {error}=await client.rpc('vave_mcp_set_access',{p_workspace_id:workspaceId,p_client_id:id,p_mode:mode});
      if(error)throw error;
      setAccess(previous=>[
        ...(previous??[]).filter(row=>row.client_id!==id),
        ...(mode==='off'?[]:[{client_id:id,allow_proposals:mode==='propose'}])
      ].sort((a,b)=>a.client_id.localeCompare(b.client_id)));
      if(mode!=='off'){setClientId('');setAllowProposals(false)}
      setMessage('saved');
    }catch{setMessage('fail')}
    finally{setBusy(false)}
  }

  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    void change(clientId.trim().toLowerCase(),allowProposals?'propose':'read');
  }
  return <section className="panel">
    <div className="panel-heading"><div><h2>{copy.title}</h2><p>{copy.intro}</p></div><Plug size={22}/></div>
    {message&&<Notice kind={message==='saved'?'success':'error'}>{copy[message]}</Notice>}
    {access===undefined?<Spinner/>:<>
      {access.map(row=><div className="app-grant" key={row.client_id}>
        <div><code className="wrap-code">{row.client_id}</code><p>{row.allow_proposals?copy.suggest:copy.read}</p></div>
        <button className="button secondary small" type="button" disabled={busy} onClick={()=>void change(row.client_id,'off')}>{copy.remove}</button>
      </div>)}
      <form className="form-stack" onSubmit={submit}>
        <Field label={copy.client}><input type="text" maxLength={36} required value={clientId} onChange={event=>setClientId(event.target.value)}/></Field>
        <label className="checkbox-field"><input type="checkbox" checked={allowProposals} onChange={event=>setAllowProposals(event.target.checked)}/> {copy.proposals}</label>
        <button className="button primary small" disabled={busy}>{copy.save}</button>
      </form>
    </>}
  </section>;
}
