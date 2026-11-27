import {PGlite} from '@electric-sql/pglite';
import {readdirSync,readFileSync} from 'node:fs';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';

const person='00000000-0000-4000-8000-000000000001';
const client='00000000-0000-4000-8000-000000000010';
const oauthSession='00000000-0000-4000-8000-000000000011';
const renewedSession='00000000-0000-4000-8000-000000000012';
let db:PGlite;
let ws:string;
let other:string;
let project:string;

async function identity(clientId?:string,sessionId=oauthSession){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [person,JSON.stringify(clientId?{client_id:clientId,session_id:sessionId}:{})]);
  await db.exec('set local role authenticated');
}
async function first<T>(sql:string,args:unknown[]=[]){return (await db.query<T>(sql,args)).rows[0]!}
async function outcome(sql:string,args:unknown[]=[]){
  await db.exec('savepoint expected_error');
  try {
    const result=await db.query(sql,args);
    await db.exec('release savepoint expected_error');
    return result;
  } catch(error) {
    await db.exec('rollback to savepoint expected_error; release savepoint expected_error');
    throw error;
  }
}
async function mode(value:'off'|'read'|'propose'){
  await identity();
  await db.query('select public.vave_mcp_set_access($1,$2,$3)',[ws,client,value]);
}

beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role authenticator nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid,oauth_client_id uuid,not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
    await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  }
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.org',now())",[person]);
  await db.query('insert into auth.oauth_consents(user_id,client_id) values($1,$2)',[person,client]);
  await db.query('insert into auth.sessions(id,user_id,oauth_client_id) values($1,$2,$3)',[oauthSession,person,client]);
},60_000);
afterAll(async()=>{await db?.close()});
beforeEach(async()=>{
  await db.exec('begin');
  await identity();
  ws=(await first<{id:string}>("select * from public.create_workspace('Shared studio','UTC','EUR')")).id;
  other=(await first<{id:string}>("select * from public.create_workspace('Other studio','UTC','EUR')")).id;
  project=(await first<{id:string}>("insert into public.projects(workspace_id,code,name) values($1,'VAVE','Project') returning id",[ws])).id;
});
afterEach(async()=>{await db.exec('rollback')});

describe('OAuth connector permissions',()=>{
  it('issues a scoped workspace list only after the owner authorizes the client',async()=>{
    await identity(client);
    expect((await first<{value:unknown}>('select public.vave_mcp_workspaces() value')).value).toEqual([]);
    await mode('read');
    await identity(client);
    expect((await first<{value:unknown}>('select public.vave_mcp_workspaces() value')).value)
      .toEqual([{id:ws,name:'Shared studio',timezone:'UTC',currency:'EUR',allow_proposals:false}]);
    expect((await first<{value:unknown}>("select public.vave_mcp_read($1,'projects') value",[ws])).value)
      .toEqual([{id:project,code:'VAVE',name:'Project',status:'active',due_date:null}]);
    await expect(outcome("select public.vave_mcp_read($1,'projects')",[other])).rejects.toThrow(/VAVE_CONNECTOR_SCOPE/);
  });
  it('keeps the OAuth role behind the API scope guard',async()=>{
    const setting=await first<{options:string[]}>(
      "select setconfig options from pg_db_role_setting where setrole=(select oid from pg_roles where rolname='authenticator')");
    expect(setting.options).toContain('pgrst.db_pre_request=public.vave_request_gate');
    await mode('read');
    await identity(client);
    await db.exec("select set_config('request.method','POST',true),set_config('request.path','/rpc/vave_mcp_workspaces',true)");
    await expect(outcome('select public.vave_request_gate()')).resolves.toBeDefined();
    expect((await first<{count:number}>('select count(*)::int count from public.projects')).count).toBe(0);
  });
  it('stops a connector when consent is revoked or the workspace removes its grant',async()=>{
    await mode('read');
    await db.exec('reset role');
    await db.query('update auth.oauth_consents set revoked_at=now() where client_id=$1',[client]);
    await identity(client);
    await expect(outcome('select public.vave_mcp_workspaces()')).rejects.toThrow(/VAVE_CONNECTOR_SCOPE/);
    await db.exec('reset role');
    await db.query('update auth.oauth_consents set revoked_at=null where client_id=$1',[client]);
    await mode('off');
    await identity(client);
    expect((await first<{value:unknown}>('select public.vave_mcp_workspaces() value')).value).toEqual([]);
  });
  it('observes the project-wide pause at the data boundary',async()=>{
    await mode('read');
    await db.exec('reset role');
    await db.exec('update private.vave_mcp_control set enabled=false');
    await identity(client);
    await expect(outcome('select public.vave_mcp_workspaces()')).rejects.toThrow(/VAVE_CONNECTOR_SCOPE/);
  });
  it('requires the live OAuth session associated with a renewed grant',async()=>{
    await mode('read');
    await db.exec('reset role');
    await db.query('delete from auth.sessions where id=$1',[oauthSession]);
    await db.query('insert into auth.sessions(id,user_id,oauth_client_id) values($1,$2,$3)',[renewedSession,person,client]);
    await identity(client);
    await expect(outcome('select public.vave_mcp_workspaces()')).rejects.toThrow(/VAVE_CONNECTOR_SCOPE/);
    await identity(client,renewedSession);
    expect((await first<{value:unknown[]}>('select public.vave_mcp_workspaces() value')).value).toHaveLength(1);
  });
  it('does not save proposals under a read grant and repeats a proposal without creating time',async()=>{
    const payload=JSON.stringify([{external_id:'meeting-01',project_id:project,work_date:'2026-11-27',minutes:40,note:'Planning'}]);
    await mode('read');
    await identity(client);
    await expect(outcome('select public.vave_mcp_propose($1,$2)',[ws,payload])).rejects.toThrow(/VAVE_CONNECTOR_SCOPE/);
    await mode('propose');
    await identity(client);
    const saved=await first<{rows:{id:string}[]}>('select public.vave_mcp_propose($1,$2) rows',[ws,payload]);
    expect(saved.rows).toHaveLength(1);
    expect(await first('select public.vave_mcp_propose($1,$2) rows',[ws,payload])).toEqual(saved);
    await identity();
    expect(await first('select id,status from public.time_suggestions where workspace_id=$1',[ws]))
      .toEqual({id:saved.rows[0].id,status:'pending'});
    expect((await first<{count:number}>('select count(*)::int count from public.time_entries')).count).toBe(0);
  });
});
