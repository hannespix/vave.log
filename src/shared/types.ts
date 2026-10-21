export type Role = 'owner' | 'manager' | 'member' | 'disabled';
export interface Workspace { id: string; name: string; timezone: string; currency: string; created_by: string; created_at: string; default_location?: string | null }
export interface Membership { is_demo?:boolean; demo_title?:string; demo_studio?:string; demo_origin?:'public'|'fictional'|null; workspace_id: string; user_id: string; role: Role; display_name: string; email: string; created_at: string; weekly_capacity_minutes?: number | null; location?: string | null }
export interface AbsenceInput { id?:string; workspace_id:string; user_id:string; starts_on:string; ends_on:string; kind:'vacation'|'sick'|'holiday'|'other'; note:string }
export interface Absence extends AbsenceInput { id:string; created_at:string }
export interface Invitation { id: string; workspace_id: string; email: string; role: 'manager' | 'member'; invited_by: string; created_at: string; expires_at: string }
export interface Project { id: string; workspace_id: string; code: string; name: string; client: string; budget_minutes: number; status: 'active'|'paused'|'archived'; color: string; due_date?: string|null; progress_percent?: number|null; progress_updated_at?: string|null; created_at: string }
export type ProjectInput = Omit<Project,'id'|'created_at'|'progress_updated_at'>;
export interface Task { id:string; workspace_id:string; project_id:string; title:string; status:'todo'|'doing'|'done'; assignee_id:string|null; due_date:string|null; estimated_minutes?:number|null; is_milestone?:boolean; repeat?:''|'weekly'|'biweekly'|'monthly'; created_by:string; created_at:string }
export type TaskInput = Omit<Task,'id'|'created_at'|'created_by'>;
export interface TimeEntry { id:string; workspace_id:string; project_id:string; user_id:string; work_date:string; minutes:number; note:string; billable:boolean; status:'draft'|'submitted'|'approved'; timer_id:string|null; task_id?:string|null; created_at:string }
export type EntryInput = Omit<TimeEntry,'id'|'created_at'|'user_id'|'status'|'timer_id'>;
export interface RunningTimer { id:string; workspace_id:string; project_id:string; user_id:string; started_at:string; note:string; billable:boolean; task_id?:string|null }
export interface AppNotification { id:string; workspace_id:string; user_id:string; kind:'entries_approved'|'entries_returned'; entry_count:number; created_at:string; read_at:string|null }
export interface TimerInput { workspace_id:string; project_id:string; note:string; billable:boolean; task_id?:string|null }
