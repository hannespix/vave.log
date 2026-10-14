-- Freigabe aufheben: Manager holen eine freigegebene Zeit zurück in den
-- Entwurf, solange sie nicht fakturiert ist. Der Entry-Guard (Fassung aus
-- 20261014133100_workspace_administration.sql) kennt dafür zusätzlich den
-- Übergang approved -> draft; er bleibt nur über die Definer-Funktion
-- erreichbar, weil direkte Statuswechsel von anon/authenticated weiterhin
-- abgewiesen werden.
create or replace function private.guard_entry() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Separate statements prevent SQL expression planning from checking the
  -- private helper's privileges during an ordinary browser write.
  if tg_op='DELETE' then
    if current_user not in ('anon','authenticated') then
      if private.workspace_delete_allowed(old.workspace_id) then return old; end if;
    end if;
  end if;
  if tg_op='DELETE' then
    if old.status<>'draft' or old.user_id is distinct from auth.uid() then raise exception 'Nur eigene Entwürfe können gelöscht werden.'; end if;
    perform private.lock_user(old.user_id);
    if private.current_role(old.workspace_id) is null then raise exception 'Keine Berechtigung für diesen Workspace.' using errcode='42501'; end if;
    return old;
  end if;
  if tg_op='INSERT' then
    if (new.user_id is distinct from auth.uid() or new.status<>'draft') and not (current_user not in ('anon','authenticated') and private.demo_can_seed_entry(new.workspace_id,new.user_id)) then raise exception 'Nur eigene Entwürfe können erstellt werden.'; end if;
    if current_user in ('anon','authenticated') and new.timer_id is not null then raise exception 'Timer-Zuordnung ist geschützt.'; end if;
  else
    if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id or new.timer_id is distinct from old.timer_id or new.created_at is distinct from old.created_at then
      raise exception 'Identität und Timer-Zuordnung sind unveränderlich.';
    end if;
    if new.status is distinct from old.status then
      if current_user in ('anon','authenticated') then raise exception 'Statuswechsel erfordern die Freigabe-Funktion.'; end if;
      if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'Ein Statuswechsel darf den Inhalt nicht verändern.'; end if;
      if old.status='draft' and new.status='submitted' and old.user_id=auth.uid() then null;
      elsif old.status='submitted' and new.status in ('draft','approved') and private.current_role(old.workspace_id) in ('owner','manager') then null;
      elsif old.status='approved' and new.status='draft' and private.current_role(old.workspace_id) in ('owner','manager') then null;
      else raise exception 'Ungültiger Statuswechsel.'; end if;
    elsif old.status<>'draft' or old.user_id is distinct from auth.uid() then
      raise exception 'Nur eigene Entwürfe können geändert werden.';
    end if;
  end if;
  perform private.lock_user(new.user_id);
  -- Recheck after waiting: a concurrent owner may have disabled this actor.
  if private.current_role(new.workspace_id) is null then raise exception 'Keine Berechtigung für diesen Workspace.' using errcode='42501'; end if;
  if new.minutes + coalesce((select sum(minutes) from public.time_entries where user_id=new.user_id and workspace_id=new.workspace_id and work_date=new.work_date and id<>new.id),0)>1440 then
    raise exception 'Pro Tag und Workspace sind höchstens 1440 Minuten erlaubt.';
  end if;
  return new;
end $$;

create function public.revoke_approval(p_id uuid) returns public.time_entries
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
  return v_entry;
end $$;
revoke all on function public.revoke_approval(uuid) from public,anon,authenticated;
grant execute on function public.revoke_approval(uuid) to authenticated;
