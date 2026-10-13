import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { DemoLocale, DemoWorkspace } from './demo-data.js';
import type { Workspace } from './types.js';
import { uuid, workspaceSchema } from './validation.js';

export type DemoErrorCode='validation'|'forbidden'|'conflict'|'database';
export class DemoError extends Error {
  constructor(message:string,public code:DemoErrorCode) { super(message); this.name='DemoError'; }
}
const createSchema=workspaceSchema.omit({currency:true}).extend({locale:z.enum(['en','de','zh']),requestId:uuid});
function parse<T>(schema:z.ZodType<T>,input:unknown):T {
  const result=schema.safeParse(input);
  if(!result.success) throw new DemoError('Check the workspace name, timezone, language and request ID.','validation');
  return result.data;
}
function fail(error:{code?:string;message?:string}|null) {
  if(!error) return;
  if(error.code==='42501'||error.message?.startsWith('DEMO_FORBIDDEN')) throw new DemoError('A verified account and the required workspace permissions are needed.','forbidden');
  if(error.message?.startsWith('DEMO_CONFLICT')) throw new DemoError(error.message.toLowerCase().includes('timer')?'Stop or discard running timers before archiving this demo workspace.':'This demo workspace has been archived. Start a new sample with a new request ID.','conflict');
  if(error.message?.startsWith('DEMO_VALIDATION')||['22P02','23514'].includes(error.code??'')) throw new DemoError('Check the workspace name, timezone, language and request ID.','validation');
  throw new DemoError('The demo workspace could not be loaded or saved.','database');
}

/** Uses the acting user's client. The database supplies and protects sample data. */
export function createDemoService(client:SupabaseClient) {
  return {
    async create(input:{name:string;timezone:string;locale:DemoLocale;requestId:string}):Promise<Workspace> {
      const v=parse(createSchema,input);
      const {data,error}=await client.rpc('demo_create_workspace',{p_name:v.name,p_timezone:v.timezone,p_locale:v.locale,p_request_id:v.requestId});
      fail(error);
      if(!data) throw new DemoError('The demo workspace could not be loaded or saved.','database');
      return data as Workspace;
    },
    async get(workspaceId:string):Promise<DemoWorkspace|null> {
      const id=parse(uuid,workspaceId);
      const {data,error}=await client.from('workspace_demos').select('*').eq('workspace_id',id).maybeSingle();
      fail(error); return data as DemoWorkspace|null;
    },
    async archive(workspaceId:string):Promise<void> {
      const id=parse(uuid,workspaceId);
      const {error}=await client.rpc('demo_archive_workspace',{p_workspace_id:id});
      fail(error);
    }
  };
}
export type DemoService=ReturnType<typeof createDemoService>;
