-- M13: Stärkenprofile. Aufgaben und Projekte bekommen Tags (Kategorie der
-- Arbeit), Aufgaben einen Lebenszyklus (erster Start, Erledigung, Zahl der
-- Wiedereröffnungen – vom Trigger gepflegt, nie vom Client) und eine optionale
-- Abschlussbewertung 1–5 durch die Leitung. Daraus rechnet die Oberfläche
-- Geschwindigkeit, Termintreue, Durchlaufzeit und Qualität je Person und
-- Kategorie – als Gesprächsgrundlage, nicht als Ranking.
create function private.valid_tags(t text[]) returns boolean language sql immutable set search_path='' as $$
 select t is null or (cardinality(t)<=10 and not exists (select 1 from unnest(t) x where length(btrim(x))<1 or length(x)>30 or x<>lower(btrim(x))))
$$;
revoke all on function private.valid_tags(text[]) from public,anon,authenticated;
grant execute on function private.valid_tags(text[]) to authenticated;

alter table public.projects add column tags text[] not null default '{}' check (private.valid_tags(tags));
alter table public.tasks
  add column tags text[] not null default '{}' check (private.valid_tags(tags)),
  add column rating smallint check (rating is null or rating between 1 and 5),
  add column started_at timestamptz,
  add column done_at timestamptz,
  add column reopened_count integer not null default 0 check (reopened_count>=0);

-- Lebenszyklus: Zeitstempel und Zähler setzt nur der Trigger; Bewertung nur die Leitung.
create function private.task_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    new.started_at := case when new.status in ('doing','done') then now() else null end;
    new.done_at := case when new.status='done' then now() else null end;
    new.reopened_count := 0;
    if new.rating is not null and private.current_role(new.workspace_id) not in ('owner','manager') then raise exception 'Die Bewertung vergibt nur die Leitung.' using errcode='42501'; end if;
    return new;
  end if;
  new.started_at := old.started_at; new.done_at := old.done_at; new.reopened_count := old.reopened_count;
  if new.status is distinct from old.status then
    if new.status in ('doing','done') and new.started_at is null then new.started_at := now(); end if;
    if new.status='done' then new.done_at := now();
    elsif old.status='done' then new.done_at := null; new.reopened_count := old.reopened_count+1; end if;
  end if;
  if new.rating is distinct from old.rating and private.current_role(new.workspace_id) not in ('owner','manager') then raise exception 'Die Bewertung vergibt nur die Leitung.' using errcode='42501'; end if;
  return new;
end $$;
revoke all on function private.task_lifecycle() from public,anon,authenticated;
create trigger task_lifecycle before insert or update on public.tasks for each row execute function private.task_lifecycle();

-- Bestand: erledigte Aufgaben ohne Zeitstempel gelten als erledigt, Durchlaufzeit bleibt unbekannt.
update public.tasks set done_at=created_at, started_at=created_at where status='done' and done_at is null;
update public.tasks set started_at=created_at where status='doing' and started_at is null;
