export type Role = 'owner' | 'manager' | 'member' | 'disabled';
export interface Workspace { id: string; name: string; timezone: string; currency: string; created_by: string; created_at: string; default_location?: string | null; absence_approval?: boolean }
export interface Membership { is_demo?:boolean; demo_title?:string; demo_studio?:string; demo_origin?:'public'|'fictional'|null; workspace_id: string; user_id: string; role: Role; rights_template?: string | null; permissions?: Partial<Record<string, string>> | null; display_name: string; email: string; created_at: string; weekly_capacity_minutes?: number | null; location?: string | null; vacation_days_per_year?: number | null; work_schedule?: number[] | null; balance_start_on?: string | null; balance_start_minutes?: number | null }
export type AbsenceStatus = 'requested'|'approved'|'declined';
export interface AbsenceInput { id?:string; workspace_id:string; user_id:string; starts_on:string; ends_on:string; kind:'vacation'|'sick'|'holiday'|'other'; note:string; half_day?:''|'am'|'pm'; status?:AbsenceStatus }
export interface Absence extends AbsenceInput { id:string; created_at:string; status?:AbsenceStatus; half_day?:''|'am'|'pm'; decided_by?:string|null; decided_at?:string|null }
export interface VacationBalance { workspace_id:string; user_id:string; year:number; carried_over:number; adjustment:number; note:string; updated_at?:string; updated_by?:string|null }
export interface Invitation { id: string; workspace_id: string; email: string; role: 'manager' | 'member'; rights_template?: string | null; invited_by: string; created_at: string; expires_at: string }
export interface Project { id: string; workspace_id: string; code: string; name: string; client: string; budget_minutes: number; status: 'active'|'paused'|'archived'; color: string; due_date?: string|null; progress_percent?: number|null; progress_updated_at?: string|null; created_at: string; tags?: string[]; billable_default?: boolean }
export type ProjectInput = Omit<Project,'id'|'created_at'|'progress_updated_at'>;
export interface Task { id:string; workspace_id:string; project_id:string; title:string; status:'todo'|'doing'|'done'; assignee_id:string|null; due_date:string|null; estimated_minutes?:number|null; is_milestone?:boolean; repeat?:''|'weekly'|'biweekly'|'monthly'; tags?:string[]; rating?:number|null; started_at?:string|null; done_at?:string|null; reopened_count?:number; created_by:string; created_at:string }
export type TaskInput = Omit<Task,'id'|'created_at'|'created_by'|'started_at'|'done_at'|'reopened_count'>;
export interface TimeEntry { id:string; workspace_id:string; project_id:string; user_id:string; work_date:string; minutes:number; note:string; billable:boolean; status:'draft'|'submitted'|'approved'; timer_id:string|null; task_id?:string|null; phase_id?:string|null; service_type_id?:string|null; created_at:string }
export type EntryInput = Omit<TimeEntry,'id'|'created_at'|'user_id'|'status'|'timer_id'>;
export interface RunningTimer { id:string; workspace_id:string; project_id:string; user_id:string; started_at:string; note:string; billable:boolean; task_id?:string|null }
export type SuggestionSource = 'chatgpt'|'claude'|'calendar'|'fireflies'|'box'|'other';
export interface SuggestionEvidence { title:string; url?:string|null; snippet?:string|null }
export interface TimeSuggestionInput { workspace_id:string; source?:SuggestionSource; external_id?:string|null; project_id:string|null; task_id?:string|null; work_date:string; minutes:number; note:string; billable?:boolean; confidence?:number|null; evidence?:SuggestionEvidence[] }
export interface TimeSuggestion extends TimeSuggestionInput { id:string; user_id:string; oauth_client_id?:string|null; source:SuggestionSource; status:'pending'|'accepted'|'dismissed'; entry_id:string|null; created_at:string; decided_at:string|null; evidence:SuggestionEvidence[] }
export interface AppNotification { id:string; workspace_id:string; user_id:string; kind:'entries_approved'|'entries_returned'|'absence_requested'|'absence_approved'|'absence_declined'; entry_count:number; created_at:string; read_at:string|null }
export interface TimerInput { workspace_id:string; project_id:string; note:string; billable:boolean; task_id?:string|null }
/** Phase eines Projekts: die Ebene zwischen Projekt und Aufgabe, mit Zeitraum und Stundenbudget. */
export interface ProjectPhase { id:string; workspace_id:string; project_id:string; name:string; position:number; starts_on:string|null; ends_on:string|null; budget_minutes:number; created_at:string }
export type ProjectPhaseInput = Omit<ProjectPhase,'id'|'created_at'>;
/** Leistungsart (PM, CD, 3D …): die Rolle, in der jemand an einem Projekt arbeitet. */
export interface ServiceType { id:string; workspace_id:string; name:string; position:number; active:boolean; created_at:string }
/** Zeile des Kapazitätsplans: Projekt × Leistungsart × Person (oder noch offen). */
export interface PlanRow { id:string; workspace_id:string; project_id:string; user_id:string|null; service_type_id:string|null; offered_minutes:number|null; note:string; position:number; created_at:string }
export type PlanRowInput = Omit<PlanRow,'id'|'created_at'>;
/** Geplante Minuten einer Zeile in einer Kalenderwoche (week_start = Montag). */
export interface PlanCell { workspace_id:string; row_id:string; week_start:string; minutes:number }
export interface PlanActual { project_id:string; user_id:string; week_start:string; minutes:number }
export interface PhaseEffort { project_id:string; phase_id:string|null; service_type_id:string|null; minutes:number; billable_minutes:number|null; entries:number }
/** Ein ganzer Plan für den Import (Excel, Zwischenablage): Projekte mit Phasen, Zeilen und Wochenwerten in Minuten. */
export interface PlanImport { replace:boolean; service_types:string[]; projects:{ project_id:string|null; create?:{ code:string; name:string; client?:string; budget_minutes?:number }; budget_minutes?:number|null; phases:{ name:string; starts_on:string|null; ends_on:string|null }[]; rows:{ user_id:string|null; service_type:string|null; offered_minutes:number|null; note:string; cells:Record<string,number> }[] }[] }
export interface PlanImportResult { projects:number; created_projects:number; rows:number; cells:number; phases:number; service_types:number }
/** Schwesterfirma: ein verknüpfter Workspace. `can_accept`: die angemeldete Person darf dort Projekte annehmen. */
export interface SisterWorkspace { workspace_id:string; name:string; currency:string; timezone:string; can_accept:boolean; can_unlink:boolean }
export interface HandoverSummary { code:string; name:string; client:string; due_date:string|null; budget_minutes?:number; booked_minutes?:number; phases:number; open_tasks?:number; plan_rows?:number; planned_minutes?:number; source_name:string; target_name:string; offered_by_name?:string|null }
/** Angebot, ein Projekt an eine Schwesterfirma zu übergeben. */
export interface ProjectHandover { id:string; source_workspace_id:string; source_project_id:string; target_workspace_id:string; target_project_id:string|null; status:'offered'|'accepted'|'declined'|'withdrawn'; note:string; summary:HandoverSummary; offered_by:string; offered_at:string; decided_by:string|null; decided_at:string|null }
