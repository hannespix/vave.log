-- Einladungs-Verwaltung: Owner und Manager sehen offene Einladungen, Owner
-- widerrufen sie. Einladen räumt abgelaufene Einladungen des Workspace auf
-- und meldet eine bestehende Mitgliedschaft klar zurück, statt dass die
-- Einladung später beim Annehmen stillschweigend verpufft; Annehmen räumt
-- die abgelaufenen Einladungen der eigenen Adresse auf.
create or replace function public.invite_member(p_workspace_id uuid,p_email text,p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(btrim(p_email));
begin
  perform private.require_role(p_workspace_id,array['owner']);
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Ungültige E-Mail-Adresse.'; end if;
  if p_role is null or p_role not in ('manager','member') then raise exception 'Ungültige Rolle: Einladungen erlauben nur Manager oder Mitglied.'; end if;
  delete from public.invitations where workspace_id=p_workspace_id and expires_at<=now();
  if exists(select 1 from public.memberships where workspace_id=p_workspace_id and email=v_email) then
    raise exception 'Diese E-Mail-Adresse gehört bereits zu einem Mitglied dieses Workspace. Passe stattdessen die Rolle unter Team an.';
  end if;
  insert into public.invitations(workspace_id,email,role,invited_by) values(p_workspace_id,v_email,p_role,auth.uid())
  on conflict(workspace_id,email) do update set role=excluded.role,invited_by=excluded.invited_by,created_at=now(),expires_at=now()+interval '14 days'
  returning id into v_id;
  perform private.audit(p_workspace_id,'invite','invitation',v_id,jsonb_build_object('role',p_role));
end $$;

create or replace function public.accept_invitations() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_email text; v_name text; v_inv public.invitations; v_count integer:=0; v_added integer;
begin
  select lower(email),left(coalesce(nullif(raw_user_meta_data->>'display_name',''),split_part(email,'@',1)),120) into v_email,v_name from auth.users where id=v_user and email_confirmed_at is not null;
  delete from public.invitations where email=v_email and expires_at<=now();
  for v_inv in select * from public.invitations where email=v_email and expires_at>now() order by workspace_id for update loop
    insert into public.memberships(workspace_id,user_id,role,display_name,email) values(v_inv.workspace_id,v_user,v_inv.role,v_name,v_email) on conflict(workspace_id,user_id) do nothing;
    get diagnostics v_added = row_count;
    v_count:=v_count+v_added;
    delete from public.invitations where id=v_inv.id;
    perform private.audit(v_inv.workspace_id,'accept','invitation',v_inv.id);
  end loop;
  return v_count;
end $$;

create function public.list_invitations(p_workspace_id uuid) returns setof public.invitations
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role(p_workspace_id,array['owner','manager']);
  return query select * from public.invitations where workspace_id=p_workspace_id and expires_at>now() order by created_at desc,id;
end $$;

create function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invitations;
begin
  perform private.require_user();
  select * into v_inv from public.invitations where id=p_id;
  if not found then raise exception 'Keine Berechtigung oder Einladung nicht gefunden.' using errcode='42501'; end if;
  perform private.require_role(v_inv.workspace_id,array['owner']);
  delete from public.invitations where id=p_id;
  perform private.audit(v_inv.workspace_id,'revoke','invitation',p_id,jsonb_build_object('role',v_inv.role));
end $$;

revoke all on function public.list_invitations(uuid),public.revoke_invitation(uuid) from public,anon,authenticated;
grant execute on function public.list_invitations(uuid),public.revoke_invitation(uuid) to authenticated;
