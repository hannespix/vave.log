-- M3-C: Jahres-Nummernkreis. Rechnungsnummern laufen je Workspace UND Jahr
-- (PREFIX-2026-0001); das Jahr kommt aus der Workspace-Zeitzone, nicht aus der
-- Server-UTC-Uhr. Bestehende Nummern (PREFIX-000001) bleiben unverändert: der
-- Altzähler lebt als Jahr 0 weiter, der neue Kreis ist durch das Jahr im
-- Format eindeutig von alten Nummern unterscheidbar (GoBD: Einmaligkeit).
-- Das DEMO-Präfix für Demo-Workspaces (Fassung aus full_demo_experience)
-- bleibt erhalten.
alter table private.finance_number_counters add column year integer not null default 0;
alter table private.finance_number_counters drop constraint finance_number_counters_pkey;
alter table private.finance_number_counters add primary key (workspace_id, year);

create or replace function private.finance_next_number(p_workspace_id uuid,p_prefix text) returns text
language plpgsql security definer set search_path='' as $$
declare n bigint; prefix text:=p_prefix; v_tz text; v_year integer;
begin
 perform private.finance_require_manager(p_workspace_id);
 if exists(select 1 from public.workspace_demos where workspace_id=p_workspace_id) then prefix:='DEMO'; end if;
 select timezone into v_tz from public.workspaces where id=p_workspace_id;
 v_year:=extract(year from (now() at time zone coalesce(v_tz,'UTC')))::integer;
 insert into private.finance_number_counters(workspace_id,year,next_number) values(p_workspace_id,v_year,2)
 on conflict(workspace_id,year) do update set next_number=private.finance_number_counters.next_number+1 returning next_number-1 into n;
 return prefix||'-'||v_year::text||'-'||lpad(n::text,greatest(4,length(n::text)),'0');
end $$;
