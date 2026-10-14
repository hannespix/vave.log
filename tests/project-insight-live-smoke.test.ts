import { PGlite } from '@electric-sql/pglite';
import { readdirSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect,it } from 'vitest';

it('executes the exact rollback-only live project-insight smoke SQL and leaves no fixtures',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort())await db.exec(readFileSync(join('supabase/migrations',file),'utf8'));
  const results=await db.exec(readFileSync('tests/live/project-insight-smoke.sql','utf8'));
  expect(results.flatMap(x=>x.rows)).toContainEqual({result:'passed; the following ROLLBACK removes all synthetic data',total_minutes:1185,recent_minutes:1045,denials:8,planning_preserved:true});
  expect((await db.query('select count(*)::int total from public.workspaces')).rows).toEqual([{total:0}]);
  expect((await db.query('select count(*)::int total from auth.users')).rows).toEqual([{total:0}]);
 }finally{await db.close()}
},60000);
