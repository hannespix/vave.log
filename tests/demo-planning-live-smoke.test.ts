import { PGlite } from '@electric-sql/pglite';
import { readdirSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect,it } from 'vitest';

it('executes the exact v5 rollback-only demo planning smoke and leaves no samples',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
   insert into auth.users(id,email,email_confirmed_at)values('00000000-0000-4000-8000-000000000001','existing@example.invalid',now());`);
  for(const file of readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort())await db.exec(readFileSync(join('supabase/migrations',file),'utf8'));
  const results=await db.exec(readFileSync('tests/live/demo-planning-smoke.sql','utf8'));
  expect(results.flatMap(x=>x.rows)).toContainEqual({new_planned_projects:25,healthy_enterprise_projects:9,existing_planned_projects:24,retry_changed_projects:0,preserved_business_records:true,unchanged_auth_users:true,estimated_tasks:102,milestones:33,automatic_updates_verified:true});
  expect((await db.query('select count(*)::int total from public.workspaces')).rows).toEqual([{total:0}]);
  expect((await db.query('select count(*)::int total from auth.users')).rows).toEqual([{total:1}]);
 }finally{await db.close()}
},60000);
