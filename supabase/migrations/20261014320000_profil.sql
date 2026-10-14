-- M6-A: Workspace umbenennen und eigenen Anzeigenamen pflegen. Beides waren
-- bisher Einbahnstraßen aus der Anlage (workspaces und memberships haben
-- bewusst keine Schreib-Grants); Tippfehler im Studionamen oder ein geänderter
-- Rufname blieben für immer stehen. Zeitzone und Währung bleiben fix: an der
-- Zeitzone hängen Timer-Tagesgrenzen, an der Währung eingefrorene Rechnungen.
create function public.rename_workspace(p_workspace_id uuid,p_name text) returns public.workspaces
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_name text := btrim(coalesce(p_name,'')); v_row public.workspaces;
begin
  if length(v_name)<1 or length(v_name)>100 then raise exception 'Der Workspace-Name braucht 1 bis 100 Zeichen.'; end if;
  perform private.require_role(p_workspace_id,array['owner']);
  perform private.lock_user(v_user);
  perform private.require_role(p_workspace_id,array['owner']);
  update public.workspaces set name=v_name where id=p_workspace_id returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Workspace nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'rename','workspace',p_workspace_id,jsonb_build_object('name',v_name));
  return v_row;
end $$;
revoke all on function public.rename_workspace(uuid,text) from public,anon,authenticated;
grant execute on function public.rename_workspace(uuid,text) to authenticated;

-- Der Anzeigename gilt je Mitgliedschaft; jede Person pflegt nur den eigenen.
create function public.set_display_name(p_workspace_id uuid,p_name text) returns public.memberships
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_name text := btrim(coalesce(p_name,'')); v_row public.memberships;
begin
  if length(v_name)<1 or length(v_name)>120 then raise exception 'Der Anzeigename braucht 1 bis 120 Zeichen.'; end if;
  perform private.lock_user(v_user);
  update public.memberships set display_name=v_name where workspace_id=p_workspace_id and user_id=v_user and role<>'disabled' returning * into v_row;
  if not found then raise exception 'Keine Berechtigung für diesen Workspace.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'display_name','membership',v_user,jsonb_build_object('display_name',v_name));
  return v_row;
end $$;
revoke all on function public.set_display_name(uuid,text) from public,anon,authenticated;
grant execute on function public.set_display_name(uuid,text) to authenticated;
