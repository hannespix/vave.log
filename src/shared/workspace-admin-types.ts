export interface WorkspaceAdminSummary {
  id:string;
  name:string;
  is_demo:boolean;
  archived_at:string|null;
  created_at:string;
  counts:{projects:number;tasks:number;time_entries:number;members:number;invoices:number;expenses:number};
  running_timers:number;
}

export interface DeleteWorkspaceInput {
  workspaceId:string;
  confirmationName:string;
  confirmed:true;
}
