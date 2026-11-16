import { describe,it,expect,vi } from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {createService} from '../src/shared/service.js';
const id='11111111-1111-4111-8111-111111111111';
function backend(data:unknown,status=200,headers:Record<string,string>={}){
 const fetch=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}}));
 const client=createClient('https://test.supabase.co','sb_publishable_test',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch}});
 return {service:createService(client),fetch};
}
describe('shared service boundary',()=>{
 it('accepts successful void RPCs',async()=>{const {service}=backend(null);await expect(service.inviteMember({workspace_id:id,email:'a@vave.studio',role:'member'})).resolves.toBeUndefined();await expect(service.discardTimer(id)).resolves.toBeUndefined()});
 it('rejects forged identity before network',async()=>{const{service,fetch}=backend(null);await expect(async()=>service.saveEntry({workspace_id:id,project_id:id,work_date:'2026-10-13',minutes:30,note:'',billable:true,user_id:id} as never)).rejects.toThrow('Eingaben');expect(fetch).not.toHaveBeenCalled()});
 it('throws on RLS denial and does not expose database details',async()=>{const{service}=backend({code:'42501',message:'private SQL internals'},403);await expect(service.listProjects(id)).rejects.toThrow('Berechtigung');});
 it('passes on database messages the catalog knows, even with their own error code, and hides everything else',async()=>{
  await expect(backend({code:'42501',message:'Diese Person hat mehr Rechte als du. Ändern kann sie nur jemand mit diesen Rechten.'},403).service.listProjects(id)).rejects.toThrow('mehr Rechte als du');
  await expect(backend({code:'23P01',message:'In diesem Zeitraum ist für diese Person bereits eine Abwesenheit eingetragen.'},409).service.listProjects(id)).rejects.toThrow('bereits eine Abwesenheit');
  await expect(backend({code:'23P01',message:'conflicting key value violates exclusion constraint "internal_name"'},409).service.listProjects(id)).rejects.toThrow('erneut versuchen');
 });
 it('rejects truncated results using exact count',async()=>{const{service}=backend([{id}],200,{'content-range':'0-0/1200'});await expect(service.listProjects(id)).rejects.toThrow('1.000')});
 it('reads tasks and task effort page by page beyond the 1,000-row cap of one request',async()=>{
  const page=(n:number,from:number)=>Array.from({length:n},(_,i)=>({id:`task-${from+i}`,task_id:`task-${from+i}`,minutes:1}));
  const fetch=vi.fn(async(input:RequestInfo|URL)=>{const offset=Number(new URL(String(input)).searchParams.get('offset')??0);return new Response(JSON.stringify(offset===0?page(1000,0):offset===1000?page(1000,1000):page(3,2000)),{status:200,headers:{'content-type':'application/json'}});});
  const service=createService(createClient('https://test.supabase.co','sb_publishable_test',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch}}));
  const tasks=await service.listTasks(id);expect(tasks).toHaveLength(2003);expect(new Set(tasks.map(t=>t.id)).size).toBe(2003);
  const urls=fetch.mock.calls.map(c=>new URL(String(c[0])));expect(urls.map(u=>u.searchParams.get('offset'))).toEqual(['0','1000','2000']);
  expect(urls.every(u=>u.searchParams.get('limit')==='1000'&&u.searchParams.get('order')==='created_at.asc,id.asc')).toBe(true);
  fetch.mockClear();expect(await service.listTaskEffort(id)).toHaveLength(2003);expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.get('order')).toBe('task_id.asc');
 });
 it('sends explicit date filters and authenticated-only write fields',async()=>{const{service,fetch}=backend([],200,{'content-range':'*/0'});await service.listEntries(id,'2026-10-01','2026-10-13');const url=String(fetch.mock.calls[0]?.[0]);expect(url).toContain('work_date=gte.2026-10-01');expect(url).toContain('work_date=lte.2026-10-13');expect(url).toContain('workspace_id=eq.');});
 it('reports inaccessible deletes as errors rather than success',async()=>{const{service}=backend({code:'PGRST116'},406);await expect(service.deleteEntry(id)).rejects.toThrow('nicht gefunden')});
});

describe('project insight service boundary',()=>{
 it('loads one all-history RPC result with exact workspace/project arguments',async()=>{
  const payload={project:{id},as_of:'2026-10-14',total_minutes:240000,first_work_date:'2024-01-01',last_work_date:'2026-10-14',recent_daily:[],tasks:{total:0,done:0,overdue:0}};
  const {service,fetch}=backend(payload);expect(await service.getProjectInsight(id,id)).toEqual(payload);
  expect(String(fetch.mock.calls[0]?.[0])).toContain('/rpc/project_insight');
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({p_workspace_id:id,p_project_id:id});
 });
 it('validates both insight IDs before making a request and propagates permission denial',async()=>{
  const {service,fetch}=backend(null);
  for(const [w,p] of [[id,'invalid'],['invalid',id]])await expect(async()=>service.getProjectInsight(w,p)).rejects.toThrow('Eingaben');
  expect(fetch).not.toHaveBeenCalled();
  await expect(backend({code:'42501',message:'private database detail'},403).service.getProjectInsight(id,id)).rejects.toThrow('Berechtigung');
 });
 it('preserves omitted planning payloads and rejects read-only timestamp input',async()=>{
  const {service,fetch}=backend({id});const input={id,workspace_id:id,code:'P',name:'Project',client:'',budget_minutes:0,status:'active' as const,color:'#641dff'};
  await service.saveProject(input);expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual(input);
  await service.saveProject({...input,due_date:null,progress_percent:25});
  expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({due_date:null,progress_percent:25});
  await expect(async()=>service.saveProject({...input,progress_updated_at:'2100-01-01'} as never)).rejects.toThrow('Eingaben');
  expect(fetch).toHaveBeenCalledTimes(2);
 });
});
