-- Audit 16.11.2026, Teil Datenbank: Rechte, Einladungen, Abwesenheiten.
--
-- 1. Rechte nie nach oben umgehen: Wer das Teamrecht hat, konnte die Rechte einer Person
--    mit MEHR Rechten ändern (also herabstufen) und Einladungen mit mehr Rechten
--    überschreiben oder widerrufen. Geprüft wurde nur das Ziel, nicht der Ausgangsstand.
-- 2. Wiederkehrende Aufgaben: Wer eine ihm zugewiesene Aufgabe nur erledigen darf, konnte
--    eine wiederkehrende nicht abschließen – der Trigger legte die Folgeaufgabe mit den
--    Rechten der Person an und scheiterte an der Einfügeregel.
-- 3. Urlaubskonten und Protokoll waren breiter lesbar als die Oberfläche sie zeigt.
-- 4. Angebot → Projekt legt ein Projekt an und braucht dafür das Projektrecht.
-- 5. Überlappende Abwesenheiten je Person waren möglich und wurden an drei Stellen
--    unterschiedlich gezählt.
-- 6. Aufräumen: Hilfsfunktionen der Angebote nicht direkt aufrufbar; Vorlage „individuell“
--    und Matrix gehören zusammen.

create or replace function public.set_member_rights(p_workspace_id uuid,p_user_id uuid,p_template text,p_permissions jsonb default null) returns public.memberships
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_row public.memberships; v_own jsonb; v_new jsonb; v_old jsonb; v_key text; v_perm jsonb;
begin
  perform private.require_can(p_workspace_id,'team','edit');
  if p_template is null or p_template not in ('admin','leitung','projektplanung','personal','finanzen','mitarbeit','lesen','individuell') then raise exception 'Unbekannte Rechte-Vorlage.'; end if;
  if p_user_id=v_user then raise exception 'Die eigenen Rechte ändert eine andere Person mit Teamrecht.' using errcode='42501'; end if;
  if p_template='individuell' then
    if p_permissions is null or not private.valid_permissions(p_permissions) then raise exception 'Die Rechte-Matrix ist unvollständig oder enthält unbekannte Werte.'; end if;
    v_perm := p_permissions; v_new := p_permissions;
  else
    v_perm := null; v_new := private.template_rights(p_template);
  end if;
  perform private.lock_user(p_user_id);
  perform private.require_can(p_workspace_id,'team','edit');
  select * into v_row from public.memberships where workspace_id=p_workspace_id and user_id=p_user_id and not is_demo for update;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
  if v_row.role='owner' then raise exception 'Owner haben alle Rechte; die Rolle ändert nur ein Owner.' using errcode='42501'; end if;
  if v_row.role='disabled' then raise exception 'Diese Person ist deaktiviert.'; end if;
  v_own := private.rights(p_workspace_id);
  -- Wer selbst weniger darf, stuft niemanden mit mehr Rechten herab.
  v_old := private.rights_of(p_workspace_id,p_user_id);
  for v_key in select jsonb_object_keys(v_old) loop
    if private.level_rank(v_old->>v_key)>private.level_rank(v_own->>v_key) then raise exception 'Diese Person hat mehr Rechte als du. Ändern kann sie nur jemand mit diesen Rechten.' using errcode='42501'; end if;
  end loop;
  for v_key in select jsonb_object_keys(v_new) loop
    if private.level_rank(v_new->>v_key)>private.level_rank(v_own->>v_key) then raise exception 'Du kannst nur Rechte vergeben, die du selbst hast.' using errcode='42501'; end if;
  end loop;
  update public.memberships set rights_template=p_template, permissions=v_perm where workspace_id=p_workspace_id and user_id=p_user_id returning * into v_row;
  perform private.audit(p_workspace_id,'rights_change','membership',p_user_id,jsonb_build_object('rights_template',p_template,'permissions',v_perm));
  return v_row;
end $$;

create or replace function public.invite_member(p_workspace_id uuid,p_email text,p_role text,p_template text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(btrim(p_email)); v_own jsonb; v_new jsonb; v_key text; v_old public.invitations; v_old_rights jsonb;
begin
  perform private.require_can(p_workspace_id,'team','edit');
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Ungültige E-Mail-Adresse.'; end if;
  if p_role is null or p_role not in ('manager','member') then raise exception 'Ungültige Rolle: Einladungen erlauben nur Manager oder Mitglied.'; end if;
  if p_template is not null and p_template not in ('admin','leitung','projektplanung','personal','finanzen','mitarbeit','lesen') then raise exception 'Unbekannte Rechte-Vorlage.'; end if;
  -- Niemand lädt mit mehr Rechten ein, als er selbst hat.
  v_own := private.rights(p_workspace_id);
  v_new := private.template_rights(coalesce(p_template,case when p_role='manager' then 'leitung' else 'mitarbeit' end));
  for v_key in select jsonb_object_keys(v_new) loop
    if private.level_rank(v_new->>v_key)>private.level_rank(v_own->>v_key) then raise exception 'Du kannst nur Rechte vergeben, die du selbst hast.' using errcode='42501'; end if;
  end loop;
  delete from public.invitations where workspace_id=p_workspace_id and expires_at<=now();
  -- Eine bestehende Einladung mit mehr Rechten, als man selbst hat, lässt sich nicht überschreiben.
  select * into v_old from public.invitations where workspace_id=p_workspace_id and email=v_email for update;
  if found then
    v_old_rights := private.template_rights(coalesce(v_old.rights_template,case when v_old.role='manager' then 'leitung' else 'mitarbeit' end));
    for v_key in select jsonb_object_keys(v_old_rights) loop
      if private.level_rank(v_old_rights->>v_key)>private.level_rank(v_own->>v_key) then raise exception 'Diese Einladung vergibt mehr Rechte, als du selbst hast. Ändern kann sie nur jemand mit diesen Rechten.' using errcode='42501'; end if;
    end loop;
  end if;
  if exists(select 1 from public.memberships where workspace_id=p_workspace_id and email=v_email) then
    raise exception 'Diese E-Mail-Adresse gehört bereits zu einem Mitglied dieses Workspace. Passe stattdessen die Rechte unter Team an.';
  end if;
  insert into public.invitations(workspace_id,email,role,rights_template,invited_by) values(p_workspace_id,v_email,p_role,p_template,auth.uid())
  on conflict(workspace_id,email) do update set role=excluded.role,rights_template=excluded.rights_template,invited_by=excluded.invited_by,created_at=now(),expires_at=now()+interval '14 days'
  returning id into v_id;
  perform private.audit(p_workspace_id,'invite','invitation',v_id,jsonb_build_object('role',p_role,'rights_template',p_template));
end $$;

create or replace function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invitations; v_own jsonb; v_rights jsonb; v_key text;
begin
  perform private.require_user();
  select * into v_inv from public.invitations where id=p_id;
  if not found then raise exception 'Keine Berechtigung oder Einladung nicht gefunden.' using errcode='42501'; end if;
  perform private.require_can(v_inv.workspace_id,'team','edit');
  v_own := private.rights(v_inv.workspace_id);
  v_rights := private.template_rights(coalesce(v_inv.rights_template,case when v_inv.role='manager' then 'leitung' else 'mitarbeit' end));
  for v_key in select jsonb_object_keys(v_rights) loop
    if private.level_rank(v_rights->>v_key)>private.level_rank(v_own->>v_key) then raise exception 'Diese Einladung vergibt mehr Rechte, als du selbst hast. Widerrufen kann sie nur jemand mit diesen Rechten.' using errcode='42501'; end if;
  end loop;
  delete from public.invitations where id=p_id;
  perform private.audit(v_inv.workspace_id,'revoke','invitation',p_id,jsonb_build_object('role',v_inv.role));
end $$;

-- Die Folgeaufgabe legt die Regel an, nicht die Person: Erledigen darf, wer die Aufgabe ändern
-- darf (auch nur die eigene). Ohne angemeldete Person (Systempfad) wird weiter nicht gerollt.
alter function private.roll_repeating_task() security definer;
revoke all on function private.roll_repeating_task() from public,anon,authenticated;

-- Urlaubskonten: das eigene immer, die der anderen nur mit dem Recht „Abwesenheiten im Team“.
alter policy vacation_balances_read on public.vacation_balances
  using (private.current_role(workspace_id) is not null and (user_id=auth.uid() or private.can(workspace_id,'absences_team','view')));
-- Das Protokoll nennt Rollen-, Rechte- und Löschvorgänge. Lesen darf es, wer das Team oder den
-- Workspace verwaltet – nicht mehr jedes Konto, das die Team-Liste nur sehen darf.
alter policy audit_read on public.audit_log using (private.can(workspace_id,'team','edit') or private.can(workspace_id,'settings','edit'));
-- Offene Einladungen sieht, wer das Team sieht (bisher nur Owner; die Liste lief schon über die Funktion).
alter policy invitation_read on public.invitations using (private.can(workspace_id,'team','view'));

-- Angebot → Projekt: zusätzlich das Projektrecht.
do $patch$
declare def text:=pg_get_functiondef('private.finance_offer_project(uuid,uuid,text)'::regprocedure); anchor text:=' if d.project_id is not null then return private.finance_offer_json(p_workspace_id,p_id); end if;';
begin
  if position(anchor in def)=0 then raise exception 'finance_offer_project: unerwartete Fassung'; end if;
  execute replace(def,anchor,anchor||E'\n perform private.require_can(p_workspace_id,''projects'',''edit'');');
end $patch$;
revoke all on function private.finance_offer_project(uuid,uuid,text) from public,anon;

revoke all on function private.finance_offer_json(uuid,uuid),private.finance_next_offer_number(uuid),private.finance_build_offer_lines(jsonb,boolean) from public,anon,authenticated;

create or replace function private.absence_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_manager boolean := private.can(new.workspace_id,'absences_team','edit'); v_approval boolean;
begin
  select absence_approval into v_approval from public.workspaces where id=new.workspace_id;
  if tg_op='INSERT' then
    if not v_manager then
      if new.user_id<>auth.uid() then raise exception 'Nur die Leitung trägt Abwesenheiten für andere ein.' using errcode='42501'; end if;
      new.status := case when new.kind='sick' or not coalesce(v_approval,true) then 'approved' else 'requested' end;
      new.decided_by := null; new.decided_at := null;
    elsif new.status='requested' then new.decided_by := null; new.decided_at := null;
    else new.decided_by := auth.uid(); new.decided_at := now(); end if;
  else
    if not v_manager then
      if old.status<>'requested' and old.kind<>'sick' then raise exception 'Entschiedene Abwesenheiten ändert nur die Leitung.' using errcode='42501'; end if;
      if new.user_id<>old.user_id then raise exception 'Die Person einer Abwesenheit lässt sich nicht ändern.' using errcode='42501'; end if;
      new.status := case when new.kind='sick' or not coalesce(v_approval,true) then 'approved' else 'requested' end;
      new.decided_by := null; new.decided_at := null;
    elsif new.status is distinct from old.status then
      if new.status='requested' then new.decided_by := null; new.decided_at := null;
      else new.decided_by := auth.uid(); new.decided_at := now(); end if;
    end if;
  end if;
  -- Je Person und Tag gilt eine Abwesenheit. Ausnahmen: abgelehnte Anträge zählen nicht, zwei
  -- halbe Tage am selben Tag (vormittags und nachmittags) ergänzen sich, und eine Krankmeldung
  -- darf in einen Urlaub fallen – die Krankheitstage zählen dann nicht als Urlaub.
  if new.status<>'declined' then
    perform private.lock_user(new.user_id);
    if exists(select 1 from public.absences a where a.workspace_id=new.workspace_id and a.user_id=new.user_id and a.id<>new.id
        and a.status<>'declined' and a.starts_on<=new.ends_on and a.ends_on>=new.starts_on
        and not ((a.kind='sick')<>(new.kind='sick'))
        and not (a.half_day<>'' and new.half_day<>'' and a.half_day<>new.half_day)) then
      raise exception 'In diesem Zeitraum ist für diese Person bereits eine Abwesenheit eingetragen.' using errcode='23P01';
    end if;
  end if;
  return new;
end $$;

alter table public.memberships add constraint memberships_rights_shape
  check ((rights_template is not distinct from 'individuell') = (permissions is not null));
