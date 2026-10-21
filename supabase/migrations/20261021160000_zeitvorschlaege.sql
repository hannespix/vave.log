-- M14: Vorschläge für die Zeiterfassung aus dem KI-Workspace (ChatGPT, Claude …).
-- Ein KI-Client liest Kalender, Meeting-Protokolle und Ablagen über seine eigenen
-- Connectoren, ordnet Blöcke Projekten zu und schickt VORSCHLÄGE über das
-- MCP-Werkzeug propose_time_entries. Nichts wird gebucht, bis die Person einen
-- Vorschlag übernimmt; dann entsteht ein normaler Entwurf. Vorschläge sind
-- private Rohdaten: nur die eigene Person liest und schreibt sie, die Leitung
-- sieht sie nicht. external_id macht wiederholte Läufe idempotent.
create table public.time_suggestions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null default auth.uid(),
  source text not null default 'other' check (source in ('chatgpt','claude','calendar','fireflies','box','other')),
  external_id text check (external_id is null or length(external_id) between 1 and 200),
  project_id uuid,
  task_id uuid references public.tasks(id) on delete set null,
  work_date date not null check (work_date between date '2000-01-01' and date '2100-12-31'),
  minutes integer not null check (minutes between 1 and 1440),
  note text not null default '' check (length(note)<=2000),
  billable boolean not null default true,
  confidence numeric(3,2) check (confidence is null or (confidence>=0 and confidence<=1)),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence)='array' and jsonb_array_length(evidence)<=20 and octet_length(evidence::text)<=20000),
  status text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  entry_id uuid references public.time_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  foreign key (workspace_id,user_id) references public.memberships(workspace_id,user_id),
  foreign key (workspace_id,project_id) references public.projects(workspace_id,id)
);
create unique index time_suggestions_external on public.time_suggestions(workspace_id,user_id,external_id) where external_id is not null;
create index time_suggestions_open on public.time_suggestions(user_id,workspace_id,work_date) where status='pending';
alter table public.time_suggestions enable row level security;
revoke all on public.time_suggestions from public,anon,authenticated;
grant select,insert,update,delete on public.time_suggestions to authenticated;
create policy time_suggestions_own on public.time_suggestions for all to authenticated
  using(user_id=(select auth.uid()) and private.current_role(workspace_id) is not null)
  with check(user_id=(select auth.uid()) and private.current_role(workspace_id) is not null);

-- Deckel: höchstens 500 offene Vorschläge je Person und Workspace.
create function private.suggestion_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='pending' and (select count(*) from public.time_suggestions where workspace_id=new.workspace_id and user_id=new.user_id and status='pending')>=500 then
    raise exception 'Zu viele offene Vorschläge (höchstens 500). Bitte erst übernehmen oder verwerfen.';
  end if;
  return new;
end $$;
revoke all on function private.suggestion_cap() from public,anon,authenticated;
create trigger time_suggestions_cap before insert on public.time_suggestions for each row execute function private.suggestion_cap();

-- Übernehmen: legt in einer Transaktion den Entwurf an und schließt den Vorschlag.
create function public.accept_time_suggestion(p_id uuid,p_project_id uuid,p_task_id uuid,p_work_date date,p_minutes integer,p_note text,p_billable boolean) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_s public.time_suggestions; v_entry public.time_entries;
begin
  select * into v_s from public.time_suggestions where id=p_id and user_id=v_user for update;
  if not found then raise exception 'Vorschlag nicht gefunden.' using errcode='42501'; end if;
  if v_s.status<>'pending' then raise exception 'Dieser Vorschlag ist schon entschieden.'; end if;
  if private.current_role(v_s.workspace_id) is null then raise exception 'Keine Berechtigung für diesen Workspace.' using errcode='42501'; end if;
  if p_minutes is null or p_minutes<1 or p_minutes>1440 then raise exception 'Minuten zwischen 1 und 1440.'; end if;
  perform private.lock_user(v_user);
  insert into public.time_entries(workspace_id,project_id,user_id,work_date,minutes,note,billable,task_id)
    values(v_s.workspace_id,p_project_id,v_user,p_work_date,p_minutes,left(coalesce(p_note,''),2000),coalesce(p_billable,true),p_task_id) returning * into v_entry;
  update public.time_suggestions set status='accepted', entry_id=v_entry.id, decided_at=now(), project_id=p_project_id, task_id=p_task_id, work_date=p_work_date, minutes=p_minutes where id=p_id;
  perform private.audit(v_s.workspace_id,'accept_suggestion','time_entry',v_entry.id,jsonb_build_object('source',v_s.source));
  return v_entry;
end $$;
revoke all on function public.accept_time_suggestion(uuid,uuid,uuid,date,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.accept_time_suggestion(uuid,uuid,uuid,date,integer,text,boolean) to authenticated;
