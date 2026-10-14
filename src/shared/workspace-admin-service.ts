import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { uuid } from './validation.js';
import type { DeleteWorkspaceInput, WorkspaceAdminSummary } from './workspace-admin-types.js';

export type WorkspaceAdminErrorCode='forbidden'|'confirmation'|'running_timers'|'not_found'|'failed';
const messages:Record<WorkspaceAdminErrorCode,string>={
  forbidden:'Only a verified workspace owner can manage permanent deletion.',
  confirmation:'Confirm permanent deletion and enter the exact workspace name.',
  running_timers:'Stop or discard all running timers in this workspace before deleting it.',
  not_found:'This workspace is no longer available.',
  failed:'The workspace administration request could not be completed.'
};
export class WorkspaceAdminError extends Error {
  constructor(public code:WorkspaceAdminErrorCode) {super(messages[code]);this.name='WorkspaceAdminError'}
}
// No trimming or Unicode normalization: the database compares the stored name.
export const workspaceConfirmationName=z.string().min(1).max(120);
const deleteSchema=z.strictObject({workspaceId:uuid,confirmationName:workspaceConfirmationName,confirmed:z.literal(true)});
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const summarySchema=z.object({id:uuid,name:workspaceConfirmationName,is_demo:z.boolean(),archived_at:z.string().nullable(),created_at:z.string(),
  counts:z.object({projects:count,tasks:count,time_entries:count,members:count,invoices:count,expenses:count}),running_timers:count});
function fail(error:{code?:string;message?:string}|null) {
  if(!error)return;
  if(error.code==='42501'||error.message?.startsWith('WORKSPACE_ADMIN_FORBIDDEN'))throw new WorkspaceAdminError('forbidden');
  if(error.message?.startsWith('WORKSPACE_ADMIN_CONFIRMATION'))throw new WorkspaceAdminError('confirmation');
  if(error.message?.startsWith('WORKSPACE_ADMIN_RUNNING_TIMERS'))throw new WorkspaceAdminError('running_timers');
  if(error.message?.startsWith('WORKSPACE_ADMIN_NOT_FOUND'))throw new WorkspaceAdminError('not_found');
  throw new WorkspaceAdminError('failed');
}
/** Always receives the acting user's client; authorization is enforced in SQL. */
export function createWorkspaceAdminService(client:SupabaseClient) {
  return {
    async listOwned():Promise<WorkspaceAdminSummary[]> {
      const {data,error}=await client.rpc('list_owned_workspaces');fail(error);
      const parsed=z.array(summarySchema).safeParse(data);
      if(!parsed.success)throw new WorkspaceAdminError('failed');
      return parsed.data;
    },
    async deleteWorkspace(input:DeleteWorkspaceInput):Promise<void> {
      const parsed=deleteSchema.safeParse(input);
      if(!parsed.success)throw new WorkspaceAdminError('confirmation');
      const v=parsed.data;
      const {error}=await client.rpc('delete_workspace',{p_workspace_id:v.workspaceId,p_confirmation_name:v.confirmationName,p_confirmed:v.confirmed});
      fail(error);
    }
  };
}
export type WorkspaceAdminService=ReturnType<typeof createWorkspaceAdminService>;
