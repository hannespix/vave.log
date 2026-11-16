-- Beispieldaten auf dem aktuellen Funktionsstand: Arbeitszeitmodell, Wochenstunden,
-- Standort und Urlaubsanspruch je Beispielperson, Abwesenheiten (genehmigt, beantragt,
-- krank, halbe Tage), Urlaubskonten, Tags und Bewertungen, Termine und Zeiten bis heute.
--
-- Neu: public.demo_refresh_workspace(workspace). Die Funktion ist wiederholbar – Beispieldaten
-- altern (Termine laufen ab, die letzte gebuchte Zeit liegt Wochen zurück); ein erneuter Aufruf
-- rückt offene Termine wieder um heute und trägt Zeiten bis gestern nach, ohne vorhandene Werte
-- zu überschreiben. Alle Zahlen bleiben fiktiv.

-- Die Seed-Erlaubnis für Zeiten anderer Beispielpersonen galt nur für die Aufbaustufen 1 und 2.
-- Das Auffrischen läuft auf der fertigen Demo (Stufe 5) und braucht dieselbe, an Transaktion
-- und Ersteller:in gebundene Erlaubnis.
do $patch$
declare def text:=pg_get_functiondef('private.demo_can_seed_entry(uuid,uuid)'::regprocedure);
begin
  if position('d.experience_version in (1,2)' in def)=0 then raise exception 'demo_can_seed_entry: unerwartete Fassung'; end if;
  execute replace(def,'d.experience_version in (1,2)','d.experience_version in (1,2,5)');
end $patch$;
revoke all on function private.demo_can_seed_entry(uuid,uuid) from public,anon;
grant execute on function private.demo_can_seed_entry(uuid,uuid) to authenticated;

alter table public.workspace_demos add column refreshed_on date;

-- Erledigte Beispielaufgaben haben seit den Stärkenprofilen weder Beginn noch Abschluss, weil
-- die Regel task_lifecycle beide Werte bei jeder Änderung festhält. Nur innerhalb der
-- Seed-Transaktion einer Demo (private.demo_seed_context) dürfen sie nachgetragen werden.
create function private.demo_seeding(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.demo_seed_context c join public.workspace_demos d using(workspace_id)
 where c.workspace_id=p_workspace_id and c.actor=auth.uid() and c.transaction_id=txid_current()
 and d.created_by=c.actor and d.archived_at is null)
$$;
revoke all on function private.demo_seeding(uuid) from public,anon,authenticated;
create or replace function private.task_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    new.started_at := case when new.status in ('doing','done') then now() else null end;
    new.done_at := case when new.status='done' then now() else null end;
    new.reopened_count := 0;
    if new.rating is not null and not private.can(new.workspace_id,'strengths','edit') then raise exception 'Die Bewertung vergibt nur die Leitung.' using errcode='42501'; end if;
    return new;
  end if;
  if new.status is not distinct from old.status and current_user not in ('anon','authenticated') and private.demo_seeding(new.workspace_id) then
    new.started_at := coalesce(old.started_at,new.started_at); new.done_at := coalesce(old.done_at,new.done_at);
    new.reopened_count := old.reopened_count;
    return new;
  end if;
  new.started_at := old.started_at; new.done_at := old.done_at; new.reopened_count := old.reopened_count;
  if new.status is distinct from old.status then
    if new.status in ('doing','done') and new.started_at is null then new.started_at := now(); end if;
    if new.status='done' then new.done_at := now();
    elsif old.status='done' then new.done_at := null; new.reopened_count := old.reopened_count+1; end if;
  end if;
  if new.rating is distinct from old.rating and not private.can(new.workspace_id,'strengths','edit') then raise exception 'Die Bewertung vergibt nur die Leitung.' using errcode='42501'; end if;
  return new;
end $$;

create function private.demo_refresh_workspace(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=private.require_user(); w public.workspaces; d public.workspace_demos;
  today date; week date; yr integer; note_time text; tagset text[]; delta integer; first_day date; day date;
  m record; sched jsonb; target integer; minutes integer; proj uuid; dow integer;
  n_people integer:=0; n_abs integer:=0; n_tasks integer:=0; n_tags integer:=0; n_entries integer:=0; affected integer;
begin
  perform private.lock_user(actor);
  select * into w from public.workspaces where id=p_workspace_id for update;
  select * into d from public.workspace_demos where workspace_id=p_workspace_id for update;
  if d.workspace_id is null or d.created_by is distinct from actor or w.created_by is distinct from actor
    or d.archived_at is not null or private.current_role(p_workspace_id) is distinct from 'owner' then
    raise exception 'DEMO_FORBIDDEN' using errcode='42501';
  end if;
  if d.experience_version<5 then return jsonb_build_object('skipped',true,'experience_version',d.experience_version); end if;

  today:=(now() at time zone w.timezone)::date; week:=date_trunc('week',today)::date; yr:=extract(year from today)::integer;
  note_time:=case d.locale when 'de' then 'Fiktive Demozeit — internationale Kundenprojekte' when 'zh' then '虚构演示工时 — 国际客户项目' else 'Fictional demo time — international client delivery' end;
  tagset:=case d.locale
    when 'de' then array['konzept','design','3d','motion','entwicklung','produktion','text','strategie']
    when 'zh' then array['概念','设计','3d','动效','开发','制作','文案','策略']
    else array['concept','design','3d','motion','development','production','copy','strategy'] end;

  -- 1. Arbeitszeitmodell, Wochenstunden, Standort und Urlaubsanspruch je Beispielperson.
  --    Sieben von zehn arbeiten Vollzeit, drei in Teilzeit; Frankfurt bekommt hessische Feiertage.
  with people as (
    select user_id,(row_number() over (order by user_id))::integer n,demo_studio from public.memberships
    where workspace_id=p_workspace_id and is_demo and role<>'disabled'
  ), plan as (
    select user_id,demo_studio,case n%10
      when 3 then '[480,480,480,480,0,0,0]'::jsonb
      when 7 then '[360,360,360,360,360,0,0]'::jsonb
      when 9 then '[480,480,480,0,0,0,0]'::jsonb
      else '[480,480,480,480,480,0,0]'::jsonb end sched
    from people
  )
  update public.memberships mm set
    work_schedule=coalesce(mm.work_schedule,p.sched),
    weekly_capacity_minutes=coalesce(mm.weekly_capacity_minutes,(select sum((e::text)::integer) from jsonb_array_elements(coalesce(mm.work_schedule,p.sched)) e)),
    location=coalesce(mm.location,case when p.demo_studio ilike '%Frankfurt%' then 'DE-HE' end),
    vacation_days_per_year=coalesce(mm.vacation_days_per_year,case when p.demo_studio ilike '%Frankfurt%' then 30 else 25 end)
  from plan p where mm.workspace_id=p_workspace_id and mm.user_id=p.user_id
    and (mm.work_schedule is null or mm.weekly_capacity_minutes is null or mm.vacation_days_per_year is null
      or (mm.location is null and p.demo_studio ilike '%Frankfurt%'));
  get diagnostics n_people=row_count;

  -- 2. Urlaubskonto des laufenden Jahres: jede dritte Person bringt Resturlaub mit.
  insert into public.vacation_balances(workspace_id,user_id,year,carried_over,adjustment,note,updated_by)
  select p_workspace_id,x.user_id,yr,1+(x.n%4),0,'',actor
  from (select user_id,(row_number() over (order by user_id))::integer n from public.memberships
        where workspace_id=p_workspace_id and is_demo and role<>'disabled') x
  where x.n%3=0 on conflict do nothing;

  -- 3. Abwesenheiten rund um heute, je Person höchstens eine neue je Auffrischung und nie
  --    überlappend: Urlaub läuft, Urlaub kommt, Antrag wartet, krank, halber Tag.
  for m in
    select user_id,(row_number() over (order by user_id))::integer n from public.memberships
    where workspace_id=p_workspace_id and is_demo and role<>'disabled' order by user_id
  loop
    if exists(select 1 from public.absences a where a.workspace_id=p_workspace_id and a.user_id=m.user_id
              and a.ends_on>=today-14 and a.starts_on<=today+60) then continue; end if;
    if m.n%6=0 then
      insert into public.absences(workspace_id,user_id,starts_on,ends_on,kind,note,status,half_day)
      values(p_workspace_id,m.user_id,week-3+((m.n/6)%3)*2,week+4+((m.n/6)%3)*2,'vacation','','approved','');
    elsif m.n%6=1 then
      insert into public.absences(workspace_id,user_id,starts_on,ends_on,kind,note,status,half_day)
      values(p_workspace_id,m.user_id,week+7*(1+(m.n/6)%5),week+7*(1+(m.n/6)%5)+4+7*((m.n/6)%2),'vacation','','approved','');
    elsif m.n%12=2 then
      insert into public.absences(workspace_id,user_id,starts_on,ends_on,kind,note,status,half_day)
      values(p_workspace_id,m.user_id,week+7*(3+(m.n/12)%4),week+7*(3+(m.n/12)%4)+2+(m.n/12)%3,'vacation','','requested','');
    elsif m.n%12=5 then
      insert into public.absences(workspace_id,user_id,starts_on,ends_on,kind,note,status,half_day)
      values(p_workspace_id,m.user_id,week-7+(m.n/12)%4,week-7+(m.n/12)%4+(m.n/12)%2,'sick','','approved','');
    elsif m.n%12=9 then
      insert into public.absences(workspace_id,user_id,starts_on,ends_on,kind,note,status,half_day)
      values(p_workspace_id,m.user_id,week+4,week+4,'vacation','','approved',case when (m.n/12)%2=0 then 'am' else 'pm' end);
    else continue; end if;
    n_abs:=n_abs+1;
  end loop;

  -- 4. Offene Aufgaben zurück in die Gegenwart: der späteste Termin liegt drei Wochen voraus.
  --    Die Abstände der Termine untereinander bleiben, ein Teil bleibt bewusst überfällig.
  select (today+21)-max(due_date) into delta from public.tasks
  where workspace_id=p_workspace_id and status<>'done' and due_date is not null;
  if coalesce(delta,0)>=7 then
    update public.tasks set due_date=due_date+delta
    where workspace_id=p_workspace_id and status<>'done' and due_date is not null;
    get diagnostics n_tasks=row_count;
  end if;

  -- 5. Kategorien für Stärkenprofile und Zuweisungsempfehlung; erledigte Aufgaben bekommen
  --    eine Bewertung und, wo sie fehlen, Beginn und Abschluss.
  update public.tasks set tags=array[tagset[1+(abs(pg_catalog.hashtext(id::text))%8)]]
  where workspace_id=p_workspace_id and cardinality(tags)=0;
  get diagnostics n_tags=row_count;
  update public.tasks set rating=3+(abs(pg_catalog.hashtext(id::text))%3)
  where workspace_id=p_workspace_id and status='done' and rating is null and assignee_id is not null;
  insert into private.demo_seed_context values(p_workspace_id,actor,txid_current())
  on conflict (workspace_id) do update set actor=excluded.actor,transaction_id=excluded.transaction_id;
  update public.tasks set done_at=coalesce(done_at,least(now(),(coalesce(due_date,today-7)::timestamp+interval '15 hours'
      +case when abs(pg_catalog.hashtext(id::text))%5=0 then interval '2 days' else interval '0' end) at time zone w.timezone)),
    started_at=coalesce(started_at,least(now(),(coalesce(due_date,today-7)::timestamp-interval '4 days'+interval '9 hours') at time zone w.timezone))
  where workspace_id=p_workspace_id and status='done' and (done_at is null or started_at is null);

  -- 6. Zeiten bis gestern nachtragen: je Arbeitstag laut Modell ein Eintrag auf dem Projekt,
  --    auf dem die Person bisher am meisten gebucht hat. Genehmigte Abwesenheiten bleiben frei,
  --    etwa jeder neunte Tag ebenfalls. Ältere Wochen sind freigegeben, die letzte ist eingereicht.
  select max(work_date)+1 into first_day from public.time_entries where workspace_id=p_workspace_id;
  first_day:=greatest(coalesce(first_day,today-28),today-42);
  if first_day<today then
    for m in
      select mm.user_id,mm.work_schedule,(row_number() over (order by mm.user_id))::integer n from public.memberships mm
      where mm.workspace_id=p_workspace_id and mm.is_demo and mm.role<>'disabled' order by mm.user_id
    loop
      select e.project_id into proj from public.time_entries e join public.projects p on p.workspace_id=e.workspace_id and p.id=e.project_id
      where e.workspace_id=p_workspace_id and e.user_id=m.user_id and p.status='active'
      group by e.project_id order by count(*) desc,e.project_id limit 1;
      if proj is null then continue; end if;
      sched:=coalesce(m.work_schedule,'[480,480,480,480,480,0,0]'::jsonb);
      day:=first_day;
      while day<today loop
        dow:=extract(isodow from day)::integer;
        target:=((sched->(dow-1))::text)::integer;
        if target>0 and (m.n+(day-date '2026-01-01'))%9<>0
          and not exists(select 1 from public.absences a where a.workspace_id=p_workspace_id and a.user_id=m.user_id
            and a.status='approved' and a.half_day='' and a.starts_on<=day and a.ends_on>=day)
          and not exists(select 1 from public.time_entries e where e.workspace_id=p_workspace_id and e.user_id=m.user_id and e.work_date=day) then
          minutes:=greatest(60,(target*(80+((m.n+(day-date '2026-01-01'))%5)*5)/100/15)*15);
          insert into public.time_entries(workspace_id,project_id,user_id,work_date,minutes,note,billable,status)
          values(p_workspace_id,proj,m.user_id,day,minutes,note_time,(m.n+(day-date '2026-01-01'))%10<>0,
            case when day<week-7 then 'approved' when day<week then 'submitted' else 'draft' end);
          n_entries:=n_entries+1;
        end if;
        day:=day+1;
      end loop;
    end loop;
  end if;
  delete from private.demo_seed_context where workspace_id=p_workspace_id;

  update public.workspace_demos set refreshed_on=today where workspace_id=p_workspace_id;
  perform private.audit(p_workspace_id,'demo_refresh','workspace',p_workspace_id,
    jsonb_build_object('people',n_people,'absences',n_abs,'tasks_moved',n_tasks,'tasks_tagged',n_tags,'entries',n_entries,'fictional_operations',true));
  return jsonb_build_object('people',n_people,'absences',n_abs,'tasks_moved',n_tasks,'tasks_tagged',n_tags,'entries',n_entries);
end $$;

create function public.demo_refresh_workspace(p_workspace_id uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$select private.demo_refresh_workspace(p_workspace_id)$$;
revoke all on function private.demo_refresh_workspace(uuid),public.demo_refresh_workspace(uuid) from public,anon,authenticated;
grant execute on function private.demo_refresh_workspace(uuid),public.demo_refresh_workspace(uuid) to authenticated;

-- Neue Demos entstehen gleich auf dem aktuellen Stand.
create or replace function private.demo_create_workspace(p_name text,p_timezone text,p_locale text,p_request_id uuid) returns public.workspaces
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user();existed boolean;w public.workspaces;
begin
 perform private.lock_user(actor);
 select exists(select 1 from public.workspace_demos where created_by=actor and request_id=p_request_id) into existed;
 select * into w from private.demo_create_workspace_base(p_name,p_timezone,p_locale,p_request_id);
 if not existed then
  -- New-only v1 drafts retain weekday spacing, even when created on Monday.
  update public.time_entries set work_date=work_date-7 where workspace_id=w.id and work_date>(now() at time zone w.timezone)::date;
  perform private.demo_upgrade_workspace(w.id);
  perform private.demo_refresh_workspace(w.id);
 end if;
 return w;
end $$;

-- Workspace endgültig löschen: Abwesenheiten, Urlaubskonten, Hinweise, Zeitvorschläge,
-- Teilzahlungen und Angebote kamen nach der ersten Fassung hinzu und fehlten in der
-- Löschreihenfolge. Sobald ein Workspace solche Zeilen hatte, brach das Löschen mit einem
-- Fremdschlüsselfehler ab.
create or replace function private.delete_workspace(p_workspace_id uuid,p_confirmation_name text,p_confirmed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=private.require_user(); v_workspace public.workspaces;
begin
 -- Avoid leaking names/counts/existence to callers with no owner membership.
 if not exists(select 1 from public.memberships where workspace_id=p_workspace_id
  and user_id=v_user and auth_user_id=v_user and not is_demo and role='owner') then
  raise exception 'WORKSPACE_ADMIN_FORBIDDEN' using errcode='42501';
 end if;
 -- Consistent with archive/role/timer operations: actor -> workspace -> member.
 perform private.lock_user(v_user);
 select * into v_workspace from public.workspaces where id=p_workspace_id for update;
 if not found then raise exception 'WORKSPACE_ADMIN_NOT_FOUND'; end if;
 perform 1 from auth.users where id=v_user and email_confirmed_at is not null for share;
 if not found then raise exception 'WORKSPACE_ADMIN_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.memberships where workspace_id=p_workspace_id and user_id=v_user
  and auth_user_id=v_user and not is_demo and role='owner' for update;
 if not found then raise exception 'WORKSPACE_ADMIN_FORBIDDEN' using errcode='42501'; end if;
 -- Compare the stored spelling exactly; no trimming, case folding or Unicode normalization.
 if p_confirmed is distinct from true or p_confirmation_name is null
  or p_confirmation_name collate "C" is distinct from v_workspace.name collate "C" then
  raise exception 'WORKSPACE_ADMIN_CONFIRMATION';
 end if;
 if exists(select 1 from public.running_timers where workspace_id=p_workspace_id) then
  raise exception 'WORKSPACE_ADMIN_RUNNING_TIMERS';
 end if;
 -- Ausgestellte Rechnungen und Stornos sind aufbewahrungspflichtige
 -- Geschäftsunterlagen (GoBD/§ 147 AO). Ein Nicht-Demo-Workspace mit solchen
 -- Belegen lässt sich nicht löschen; Demo-Workspaces tragen nur Beispieldaten.
 if not exists(select 1 from public.workspace_demos where workspace_id=p_workspace_id)
  and exists(select 1 from public.finance_invoices where workspace_id=p_workspace_id and status in ('issued','cancellation')) then
  raise exception 'WORKSPACE_ADMIN_GOBD_RECORDS';
 end if;
 insert into private.workspace_delete_context(workspace_id,actor,transaction_id)
 values(p_workspace_id,v_user,txid_current());
 -- Explicit dependency order. No trigger disabling, cascading auth deletion,
 -- session flag, dynamic SQL or retained copy of confidential business records.
 -- Seit dem ersten Stand hinzugekommene Tabellen: ohne sie scheitert das Löschen an den
 -- Fremdschlüsseln auf Mitgliedschaften, Projekte, Kunden und Rechnungen.
 delete from public.time_suggestions where workspace_id=p_workspace_id;
 delete from public.notifications where workspace_id=p_workspace_id;
 delete from public.absences where workspace_id=p_workspace_id;
 delete from public.vacation_balances where workspace_id=p_workspace_id;
 delete from public.finance_invoice_payments where workspace_id=p_workspace_id;
 delete from public.finance_offers where workspace_id=p_workspace_id;
 delete from public.finance_time_claims where workspace_id=p_workspace_id;
 delete from public.finance_payments where workspace_id=p_workspace_id;
 delete from public.finance_invoices where workspace_id=p_workspace_id;
 delete from public.finance_expenses where workspace_id=p_workspace_id;
 delete from public.finance_project_plans where workspace_id=p_workspace_id;
 delete from public.finance_staff_rates where workspace_id=p_workspace_id;
 delete from public.finance_billing_profiles where workspace_id=p_workspace_id;
 delete from public.finance_clients where workspace_id=p_workspace_id;
 delete from public.time_entries where workspace_id=p_workspace_id;
 delete from private.timer_receipts where workspace_id=p_workspace_id;
 delete from public.tasks where workspace_id=p_workspace_id;
 delete from public.projects where workspace_id=p_workspace_id;
 delete from public.invitations where workspace_id=p_workspace_id;
 delete from public.memberships where workspace_id=p_workspace_id;
 delete from private.demo_seed_context where workspace_id=p_workspace_id;
 delete from public.workspace_demos where workspace_id=p_workspace_id;
 delete from private.finance_number_counters where workspace_id=p_workspace_id;
 delete from private.finance_offer_counters where workspace_id=p_workspace_id;
 -- Ordinary audit triggers can run while the workspace still exists.
 delete from public.audit_log where workspace_id=p_workspace_id;
 delete from private.workspace_delete_context where workspace_id=p_workspace_id;
 delete from public.workspaces where id=p_workspace_id;
end $$;

-- Bestehende aktive Demos einmal auffrischen. Die Regeln für Abwesenheiten und Bewertungen
-- hängen an der angemeldeten Person; die Migration handelt hier ausdrücklich als Ersteller:in
-- der jeweiligen Demo und setzt die Kennung danach zurück.
do $migration$
declare d record; previous text:=current_setting('request.jwt.claim.sub',true);
begin
  for d in select workspace_id,created_by from public.workspace_demos where archived_at is null and experience_version>=5 order by workspace_id loop
    begin
      perform set_config('request.jwt.claim.sub',d.created_by::text,true);
      perform private.demo_refresh_workspace(d.workspace_id);
    exception when others then
      raise notice 'Demo % nicht aufgefrischt: %',d.workspace_id,sqlerrm;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);
end $migration$;
