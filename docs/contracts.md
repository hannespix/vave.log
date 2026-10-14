# Shared contracts (authoritative)

Table columns and TS types in src/shared/types.ts. SQL uses snake_case; TypeScript preserves DB naming. RPC argument names start p_. Service constructor createService(client: SupabaseClient) returns methods below, all Promise<T>. Errors throw Error with user-facing German messages (SQL custom messages safe, no SQL stack/details).

- listWorkspaces(): Workspace[] (via workspaces select); getMemberships(workspaceId): Membership[]
- createWorkspace({name,timezone,currency}): Workspace via create_workspace(p_name,p_timezone,p_currency)
- acceptInvitations(): number via accept_invitations()
- inviteMember({workspace_id,email,role}): void via invite_member(p_workspace_id,p_email,p_role)
- setMemberRole({workspace_id,user_id,role}): void via set_member_role(p_workspace_id,p_user_id,p_role)
- listProjects(workspaceId): Project[]; saveProject(ProjectInput + optional id): Project; (archive via status)
- listTasks(workspaceId): Task[]; saveTask(TaskInput + optional id): Task; deleteTask(id): void
- listEntries(workspaceId, from, to): TimeEntry[]; saveEntry(EntryInput + optional id): TimeEntry; deleteEntry(id): void
- submitEntries({workspace_id,from,to}): number via submit_entries(p_workspace_id,p_from,p_to)
- reviewEntry({id,approve}): TimeEntry via review_entry(p_id,p_approve)
- getTimer(): RunningTimer|null; startTimer({workspace_id,project_id,note,billable}): RunningTimer via start_timer(p_workspace_id,p_project_id,p_note,p_billable)
- stopTimer(id): TimeEntry[] via stop_timer(p_timer_id). Returns same entries on retry. Split at local midnight. Minutes <1 rejects without losing timer. >24h rejects, UI offers discard then manual entry.
- discardTimer(id): void via discard_timer(p_timer_id)

Non-time lists remain bounded to 1,000 rows. Time lists load scoped, deterministically ordered pages of 1,000 up to a maximum of 50,000 entries. Overflow, incomplete pages or detected count/identity changes produce explicit errors instead of partial results. Separate requests are not a transactional snapshot. TimeEntry queries require from/to <=366 days, no unbounded tenant dump. Lists sorted deterministic. Times stored integer minutes. IDs UUID. UI creates UUID for manual writes and passes on retry. Multi-tab timer controlled in DB.
