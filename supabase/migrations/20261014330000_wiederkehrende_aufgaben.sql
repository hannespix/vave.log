-- M6-C: Wiederkehrende Aufgaben. Routinearbeit (Reporting, Wartung, Posts)
-- kehrt in festen Abständen wieder; bisher musste jemand die Aufgabe jedes
-- Mal neu anlegen. Ohne Cron rollt der Statuswechsel selbst: Wer eine
-- Aufgabe mit Wiederholung auf "Erledigt" setzt, legt im selben Schreibvorgang
-- die nächste Instanz an. Die erledigte Aufgabe verliert ihre Wiederholung,
-- damit ein Hin- und Herschalten des Status keine Duplikate erzeugt - die
-- Wiederholung reist auf der neuen Instanz weiter.
alter table public.tasks add column repeat text not null default '' check (repeat in ('','weekly','biweekly','monthly'));

-- BEFORE-Trigger ohne security definer: der Insert läuft als die ausführende
-- Person und erfüllt die bestehende Insert-Policy (Mitglied, created_by =
-- auth.uid()). Systempfade ohne auth.uid() schließen nur ab, ohne zu rollen.
create function private.roll_repeating_task() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status='done' and old.status<>'done' and new.repeat<>'' and auth.uid() is not null then
    insert into public.tasks(workspace_id,project_id,title,status,assignee_id,due_date,estimated_minutes,is_milestone,repeat,created_by)
    values(new.workspace_id,new.project_id,new.title,'todo',new.assignee_id,
      case when new.due_date is null then null else least(new.due_date + case new.repeat when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days' else interval '1 month' end, timestamp '2100-12-31')::date end,
      new.estimated_minutes,false,new.repeat,auth.uid());
    new.repeat := '';
  end if;
  return new;
end $$;
create trigger task_repeat before update on public.tasks for each row execute function private.roll_repeating_task();
