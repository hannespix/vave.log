-- M5-E: In-App-Benachrichtigungen. Eine Zurückweisung setzte eingereichte
-- Zeiten bisher stillschweigend zurück auf "Entwurf" - die betroffene Person
-- erfuhr davon nichts. Jetzt schreiben die Review-Funktionen eine
-- Benachrichtigung an die Besitzerin des Eintrags; ungelesene gleicher Art
-- werden zusammengezählt statt zu fluten. E-Mail-Versand bleibt bewusst
-- außen vor (kein SMTP/Edge-Deploy in diesem Setup).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null,
  kind text not null check (kind in ('entries_approved','entries_returned')),
  entry_count integer not null default 1 check (entry_count between 1 and 1000000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  foreign key (workspace_id,user_id) references public.memberships(workspace_id,user_id)
);
create index notifications_unread on public.notifications(user_id,workspace_id) where read_at is null;
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid());
-- Schreiben nur über die Definer-Funktionen (kein insert/update/delete-Grant).

-- Zählt in eine ungelesene Benachrichtigung gleicher Art hinein oder legt eine
-- neue an. Läuft immer unter dem Advisory-Lock der betroffenen Person
-- (lock_user in den Review-Funktionen), daher existiert höchstens eine
-- ungelesene Zeile je Art. Wer eigene Einträge prüft, braucht keinen Hinweis.
create function private.notify_review(p_workspace_id uuid,p_user_id uuid,p_approve boolean,p_count integer) returns void
language plpgsql set search_path = '' as $$
declare v_kind text := case when p_approve then 'entries_approved' else 'entries_returned' end;
begin
  if p_count is null or p_count<=0 or p_user_id=auth.uid() then return; end if;
  update public.notifications set entry_count=entry_count+p_count, created_at=now()
    where workspace_id=p_workspace_id and user_id=p_user_id and kind=v_kind and read_at is null;
  if not found then
    insert into public.notifications(workspace_id,user_id,kind,entry_count) values(p_workspace_id,p_user_id,v_kind,p_count);
  end if;
end $$;
revoke all on function private.notify_review(uuid,uuid,boolean,integer) from public,anon,authenticated;

-- Einzel-Review (Basis: 20261013202303) + Benachrichtigung.
create or replace function public.review_entry(p_id uuid,p_approve boolean) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare v_entry public.time_entries;
begin
  perform private.require_user();
  select * into v_entry from public.time_entries where id=p_id;
  if not found then raise exception 'Keine Berechtigung oder Eintrag nicht gefunden.' using errcode='42501'; end if;
  perform private.require_role(v_entry.workspace_id,array['owner','manager']);
  perform private.lock_user(v_entry.user_id);
  perform private.require_role(v_entry.workspace_id,array['owner','manager']);
  select * into v_entry from public.time_entries where id=p_id for update;
  if not found or v_entry.status<>'submitted' then raise exception 'Nur eingereichte Zeiten können geprüft werden.'; end if;
  if p_approve is null then raise exception 'Freigabe-Entscheidung fehlt.'; end if;
  update public.time_entries set status=case when p_approve then 'approved' else 'draft' end where id=p_id returning * into v_entry;
  perform private.audit(v_entry.workspace_id,case when p_approve then 'approve' else 'return' end,'time_entry',v_entry.id);
  perform private.notify_review(v_entry.workspace_id,v_entry.user_id,p_approve,1);
  return v_entry;
end $$;

-- Sammel-Review (Basis: 20261014280000) + Benachrichtigung je Eintrag; die
-- Zusammenführung ungelesener Zeilen verdichtet sie zu einer Zahl.
create or replace function public.review_entries(p_workspace_id uuid,p_ids uuid[],p_approve boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer:=0; v_user uuid; v_entry public.time_entries;
begin
  perform private.require_user();
  if p_approve is null or p_ids is null or array_length(p_ids,1) is null or array_length(p_ids,1)>500 then raise exception 'Freigabe-Entscheidung oder Auswahl fehlt (höchstens 500 Einträge je Lauf).'; end if;
  perform private.require_role(p_workspace_id,array['owner','manager']);
  for v_user in select distinct user_id from public.time_entries where workspace_id=p_workspace_id and id=any(p_ids) order by 1 loop
    perform private.lock_user(v_user);
  end loop;
  perform private.require_role(p_workspace_id,array['owner','manager']);
  for v_entry in select * from public.time_entries where workspace_id=p_workspace_id and id=any(p_ids) and status='submitted' order by id for update loop
    update public.time_entries set status=case when p_approve then 'approved' else 'draft' end where id=v_entry.id;
    perform private.audit(p_workspace_id,case when p_approve then 'approve' else 'return' end,'time_entry',v_entry.id);
    perform private.notify_review(p_workspace_id,v_entry.user_id,p_approve,1);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

-- Freigabe aufheben (Basis: 20261014191000) meldet sich ebenfalls: der
-- Eintrag liegt wieder als Entwurf bei der Person.
create or replace function public.revoke_approval(p_id uuid) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare v_entry public.time_entries;
begin
  perform private.require_user();
  select * into v_entry from public.time_entries where id=p_id;
  if not found then raise exception 'Keine Berechtigung oder Eintrag nicht gefunden.' using errcode='42501'; end if;
  perform private.require_role(v_entry.workspace_id,array['owner','manager']);
  perform private.lock_user(v_entry.user_id);
  perform private.require_role(v_entry.workspace_id,array['owner','manager']);
  select * into v_entry from public.time_entries where id=p_id for update;
  if not found or v_entry.status<>'approved' then raise exception 'Nur freigegebene Zeiten können zurückgeholt werden.'; end if;
  if exists(select 1 from public.finance_time_claims c where c.time_entry_id=v_entry.id) then
    raise exception 'Diese Zeit ist bereits fakturiert. Storniere zuerst die zugehörige Rechnung.';
  end if;
  update public.time_entries set status='draft' where id=p_id returning * into v_entry;
  perform private.audit(v_entry.workspace_id,'revoke_approval','time_entry',v_entry.id);
  perform private.notify_review(v_entry.workspace_id,v_entry.user_id,false,1);
  return v_entry;
end $$;

create function public.mark_notifications_read(p_workspace_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_count integer;
begin
  update public.notifications set read_at=now() where workspace_id=p_workspace_id and user_id=v_user and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.mark_notifications_read(uuid) from public,anon,authenticated;
grant execute on function public.mark_notifications_read(uuid) to authenticated;
