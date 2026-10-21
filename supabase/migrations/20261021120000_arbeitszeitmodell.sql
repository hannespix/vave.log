-- M9: Arbeitszeitmodell je Wochentag und Zeitkonto. Teilzeit, 4-Tage-Woche und
-- Gleitzeit brauchen ein Soll je Tag statt „Kapazität/5“. Das Modell steht als
-- Liste von sieben Minutenwerten (Mo..So) an der Mitgliedschaft; die
-- Wochenkapazität bleibt als Summe erhalten (Berichte und ältere Stände lesen
-- sie weiter). Das Zeitkonto zählt ab einem Stichtag mit Startsaldo.
-- Sieben ganze Minutenwerte 0..1440 (Check-Constraints dürfen keine Unterabfragen enthalten, daher eine Funktion).
create function private.valid_schedule(s jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(s)='array' and jsonb_array_length(s)=7 and not exists (
  select 1 from jsonb_array_elements(s) e where jsonb_typeof(e)<>'number' or (e::text)::numeric<0 or (e::text)::numeric>1440 or (e::text)::numeric<>floor((e::text)::numeric))
$$;
revoke all on function private.valid_schedule(jsonb) from public,anon,authenticated;
grant execute on function private.valid_schedule(jsonb) to authenticated;

alter table public.memberships
  add column work_schedule jsonb check (work_schedule is null or private.valid_schedule(work_schedule)),
  add column balance_start_on date check (balance_start_on is null or balance_start_on between date '2000-01-01' and date '2100-12-31'),
  add column balance_start_minutes integer not null default 0 check (balance_start_minutes between -600000 and 600000);

create function public.set_work_schedule(p_workspace_id uuid,p_user_id uuid,p_schedule jsonb,p_balance_start_on date,p_balance_start_minutes integer) returns public.memberships
language plpgsql security definer set search_path = '' as $$
declare v_row public.memberships; v_total integer;
begin
  perform private.require_user();
  if p_schedule is not null then
    if jsonb_typeof(p_schedule)<>'array' or jsonb_array_length(p_schedule)<>7 then raise exception 'Das Arbeitszeitmodell braucht sieben Tageswerte (Montag bis Sonntag).'; end if;
    select sum((e::text)::numeric)::integer into v_total from jsonb_array_elements(p_schedule) e;
    if v_total<0 or v_total>6000 then raise exception 'Die Wochenkapazität liegt zwischen 0 und 100 Stunden.'; end if;
  end if;
  if p_balance_start_minutes is not null and (p_balance_start_minutes<-600000 or p_balance_start_minutes>600000) then raise exception 'Der Startsaldo liegt zwischen -10.000 und 10.000 Stunden.'; end if;
  perform private.require_role(p_workspace_id,array['owner','manager']);
  perform private.lock_user(p_user_id);
  perform private.require_role(p_workspace_id,array['owner','manager']);
  update public.memberships set work_schedule=p_schedule, weekly_capacity_minutes=coalesce(v_total,weekly_capacity_minutes), balance_start_on=p_balance_start_on, balance_start_minutes=coalesce(p_balance_start_minutes,0)
    where workspace_id=p_workspace_id and user_id=p_user_id returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Person nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'work_schedule','membership',p_user_id,jsonb_build_object('work_schedule',p_schedule,'balance_start_on',p_balance_start_on,'balance_start_minutes',coalesce(p_balance_start_minutes,0)));
  return v_row;
end $$;
revoke all on function public.set_work_schedule(uuid,uuid,jsonb,date,integer) from public,anon,authenticated;
grant execute on function public.set_work_schedule(uuid,uuid,jsonb,date,integer) to authenticated;
