-- M5-D: Sammel-Freigabe. Die Leitung gab eingereichte Zeiten bisher nur
-- einzeln frei — ein Wochenstapel eines Teams heißt Dutzende Klicks. Eine
-- Auswahl wird jetzt in EINEM Aufruf entschieden: dieselben Regeln wie
-- review_entry (nur owner/manager, nur eingereichte Einträge, Audit je
-- Eintrag), Personen-Sperren in stabiler Reihenfolge (deadlock-frei).
-- Einträge, die inzwischen nicht mehr „eingereicht" sind, werden still
-- übersprungen — bei paralleler Einzel-Freigabe scheitert der Stapel nicht;
-- die Rückgabe nennt die tatsächlich entschiedene Anzahl.
create function public.review_entries(p_workspace_id uuid,p_ids uuid[],p_approve boolean) returns integer
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
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.review_entries(uuid,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.review_entries(uuid,uuid[],boolean) to authenticated;
