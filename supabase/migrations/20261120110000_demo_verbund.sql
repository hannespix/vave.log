-- Firmenverbund auch zwischen Demos (20.11.2026).
--
-- Bisher blieb jeder Demo-Workspace außen vor. Wer die Übergabe zeigen will, braucht aber genau das:
-- zwei Demos, die sich Projekte zuschieben. Jetzt gilt: Demo mit Demo und Firma mit Firma lassen sich
-- verknüpfen. Nur die Mischung bleibt gesperrt, damit keine Beispieldaten in eine echte Firma wandern.

create or replace function public.link_workspaces(p_workspace_id uuid,p_other_workspace_id uuid) returns public.workspace_links
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_row public.workspace_links;
begin
  if p_workspace_id is null or p_other_workspace_id is null or p_workspace_id=p_other_workspace_id then
    raise exception 'Zwei verschiedene Firmen wählen.';
  end if;
  if not private.can(p_workspace_id,'settings','edit') or not private.can(p_other_workspace_id,'settings','edit') then
    raise exception 'Dafür fehlt die Berechtigung: Einstellungen bearbeiten in beiden Firmen.' using errcode='42501';
  end if;
  if exists(select 1 from public.workspace_demos where workspace_id=p_workspace_id)
     is distinct from exists(select 1 from public.workspace_demos where workspace_id=p_other_workspace_id) then
    raise exception 'Eine Demo lässt sich nur mit einer anderen Demo verknüpfen, nicht mit einer echten Firma.';
  end if;
  insert into public.workspace_links(workspace_a,workspace_b,created_by)
  values(least(p_workspace_id,p_other_workspace_id),greatest(p_workspace_id,p_other_workspace_id),v_user)
  on conflict (workspace_a,workspace_b) do update set workspace_a=excluded.workspace_a
  returning * into v_row;
  perform private.audit(p_workspace_id,'link','workspace',p_other_workspace_id,'{}'::jsonb);
  perform private.audit(p_other_workspace_id,'link','workspace',p_workspace_id,'{}'::jsonb);
  return v_row;
end $$;

-- Werden die Beispieldaten einer Demo neu geladen, gibt es ihre bisherigen Projekte nicht mehr:
-- Offene Angebote aus dieser Demo gelten dann als zurückgezogen.
do $patch$
declare def text:=pg_get_functiondef('private.demo_reset_workspace(uuid)'::regprocedure); anchor text:='  update public.workspace_demos set experience_version=6';
begin
  if position(anchor in def)=0 then raise exception 'demo_reset_workspace: unerwartete Fassung'; end if;
  execute replace(def,anchor,'  update public.project_handovers set status=''withdrawn'',decided_by=actor,decided_at=now() where status=''offered'' and source_workspace_id=p_workspace_id;'||E'\n'||anchor);
end $patch$;
