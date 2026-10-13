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
 it('rejects truncated results using exact count',async()=>{const{service}=backend([{id}],200,{'content-range':'0-0/1200'});await expect(service.listProjects(id)).rejects.toThrow('1.000')});
 it('sends explicit date filters and authenticated-only write fields',async()=>{const{service,fetch}=backend([]);await service.listEntries(id,'2026-10-01','2026-10-13');const url=String(fetch.mock.calls[0]?.[0]);expect(url).toContain('work_date=gte.2026-10-01');expect(url).toContain('work_date=lte.2026-10-13');expect(url).toContain('workspace_id=eq.');});
 it('reports inaccessible deletes as errors rather than success',async()=>{const{service}=backend({code:'PGRST116'},406);await expect(service.deleteEntry(id)).rejects.toThrow('nicht gefunden')});
});
