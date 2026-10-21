-- M7: Standort je Person und Standard-Standort des Workspaces. Aus dem Standort
-- (ISO 3166-2, z. B. DE-BW, AT-9, CH-ZH) rechnet die Oberfläche die gesetzlichen
-- Feiertage selbst; sie zählen in Soll, Urlaub und Kapazität, ohne dass jemand
-- sie als Abwesenheit einträgt. memberships und workspaces behalten ihre
-- fehlenden Schreib-Grants; gepflegt wird nur über Definer-Funktionen.
alter table public.memberships add column location text check(location is null or location ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$');
alter table public.workspaces add column default_location text check(default_location is null or default_location ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$');

-- Leitung für alle, jede Person für sich selbst. null = Workspace-Standard.
create function public.set_member_location(p_workspace_id uuid,p_user_id uuid,p_location text) returns public.memberships
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_location text := nullif(btrim(coalesce(p_location,'')),''); v_row public.memberships;
begin
  if v_location is not null and v_location !~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$' then raise exception 'Der Standort braucht die Form LAND oder LAND-REGION (z. B. DE-BW).'; end if;
  if p_user_id<>v_user then perform private.require_role(p_workspace_id,array['owner','manager']); end if;
  perform private.lock_user(p_user_id);
  if p_user_id<>v_user then perform private.require_role(p_workspace_id,array['owner','manager']); end if;
  update public.memberships set location=v_location where workspace_id=p_workspace_id and user_id=p_user_id and (p_user_id<>v_user or role<>'disabled') returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Person nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'location','membership',p_user_id,jsonb_build_object('location',v_location));
  return v_row;
end $$;
revoke all on function public.set_member_location(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_member_location(uuid,uuid,text) to authenticated;

create function public.set_workspace_location(p_workspace_id uuid,p_location text) returns public.workspaces
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_location text := nullif(btrim(coalesce(p_location,'')),''); v_row public.workspaces;
begin
  if v_location is not null and v_location !~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$' then raise exception 'Der Standort braucht die Form LAND oder LAND-REGION (z. B. DE-BW).'; end if;
  perform private.require_role(p_workspace_id,array['owner','manager']);
  perform private.lock_user(v_user);
  perform private.require_role(p_workspace_id,array['owner','manager']);
  update public.workspaces set default_location=v_location where id=p_workspace_id returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Workspace nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'location','workspace',p_workspace_id,jsonb_build_object('default_location',v_location));
  return v_row;
end $$;
revoke all on function public.set_workspace_location(uuid,text) from public,anon,authenticated;
grant execute on function public.set_workspace_location(uuid,text) to authenticated;
