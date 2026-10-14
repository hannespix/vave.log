export type Role = 'owner' | 'manager' | 'member' | 'disabled';
export interface Workspace { id: string; name: string; timezone: string; currency: string; created_by: string; created_at: string }
export interface Membership { is_demo?:boolean; demo_title?:string; demo_studio?:string; demo_origin?:'public'|'fictional'|null; workspace_id: string; user_id: string; role: Role; display_name: string; email: string; created_at: string }
export interface Project { id: string; workspace_id: string; code: string; name: string; client: string; budget_minutes: number; status: 'active'|'paused'|'archived'; color: string; created_at: string }
export type ProjectInput = Omit<Project,'id'|'created_at'>;
export interface Task { id:string; workspace_id:string; project_id:string; title:string; status:'todo'|'doing'|'done'; assignee_id:string|null; due_date:string|null; created_by:string; created_at:string }
export type TaskInput = Omit<Task,'id'|'created_at'|'created_by'>;
export interface TimeEntry { id:string; workspace_id:string; project_id:string; user_id:string; work_date:string; minutes:number; note:string; billable:boolean; status:'draft'|'submitted'|'approved'; timer_id:string|null; created_at:string }
export type EntryInput = Omit<TimeEntry,'id'|'created_at'|'user_id'|'status'|'timer_id'>;
export interface RunningTimer { id:string; workspace_id:string; project_id:string; user_id:string; started_at:string; note:string; billable:boolean }
export interface TimerInput { workspace_id:string; project_id:string; note:string; billable:boolean }
