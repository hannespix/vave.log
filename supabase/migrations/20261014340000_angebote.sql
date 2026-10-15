-- M6-E: Angebote. Ein Angebot entsteht als Entwurf mit freien Positionen
-- (ohne Zeit-Claims - abgerechnet wird erst die Rechnung), wird mit Nummer
-- und eingefrorenen Absender-/Kunden-Snapshots versendet (eigener Kreis
-- AN-JJJJ-0001, getrennt vom Rechnungskreis) und endet angenommen oder
-- abgelehnt. Ein angenommenes Angebot laesst sich in genau ein Projekt
-- ueberfuehren: neues Projekt plus Festpreis-Plan ueber die Angebotssumme.
create table public.finance_offers (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 client_id uuid not null, project_id uuid,
 status text not null default 'draft' check(status in ('draft','sent','accepted','declined')),
 number text, currency text not null check(currency ~ '^[A-Z]{3}$'), language text not null check(language in ('en','de','zh')),
 title text not null check(length(btrim(title)) between 1 and 240),
 valid_until date check(valid_until is null or valid_until between date '2000-01-01' and date '2100-12-31'),
 notes text not null default '' check(length(notes)<=4000), lines jsonb not null default '[]',
 net_minor bigint not null default 0 check(abs(net_minor)<=9000000000000), tax_minor bigint not null default 0 check(abs(tax_minor)<=9000000000000), total_minor bigint not null default 0 check(abs(total_minor)<=9000000000000),
 issuer_snapshot jsonb, customer_snapshot jsonb, sent_at timestamptz, decided_at timestamptz,
 created_at timestamptz not null default now(), unique(workspace_id,id), unique(workspace_id,number),
 foreign key(workspace_id,client_id) references public.finance_clients(workspace_id,id),
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id),
 check((status='draft' and number is null and sent_at is null and issuer_snapshot is null and customer_snapshot is null and decided_at is null and project_id is null)
 or(status='sent' and number is not null and sent_at is not null and issuer_snapshot is not null and customer_snapshot is not null and decided_at is null and project_id is null)
 or(status in ('accepted','declined') and number is not null and sent_at is not null and issuer_snapshot is not null and customer_snapshot is not null and decided_at is not null))
);
create index finance_offers_workspace on public.finance_offers(workspace_id,created_at);
alter table public.finance_offers enable row level security;
revoke all on public.finance_offers from public,anon,authenticated;
grant select on public.finance_offers to authenticated;
create policy finance_offers_read on public.finance_offers for select to authenticated using(private.current_role(workspace_id) in ('owner','manager'));
-- Schreiben nur ueber die Definer-Funktionen (kein insert/update/delete-Grant).

-- Eigener Nummernkreis je Workspace und Jahr (Jahr aus der Workspace-Zeitzone,
-- wie der Rechnungskreis); Demo-Workspaces bekommen ein DEMO-Praefix.
create table private.finance_offer_counters (workspace_id uuid not null references public.workspaces(id), year integer not null, next_number bigint not null default 1 check(next_number>0), primary key(workspace_id,year));
alter table private.finance_offer_counters enable row level security;
revoke all on private.finance_offer_counters from public,anon,authenticated;

create function private.finance_next_offer_number(p_workspace_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare n bigint; prefix text:='AN'; v_tz text; v_year integer;
begin
 perform private.finance_require_manager(p_workspace_id);
 if exists(select 1 from public.workspace_demos where workspace_id=p_workspace_id) then prefix:='DEMO-AN'; end if;
 select timezone into v_tz from public.workspaces where id=p_workspace_id;
 v_year:=extract(year from (now() at time zone coalesce(v_tz,'UTC')))::integer;
 insert into private.finance_offer_counters(workspace_id,year,next_number) values(p_workspace_id,v_year,2)
 on conflict(workspace_id,year) do update set next_number=private.finance_offer_counters.next_number+1 returning next_number-1 into n;
 return prefix||'-'||v_year::text||'-'||lpad(n::text,greatest(4,length(n::text)),'0');
end $$;

-- Freie Positionen: dieselben Regeln wie Rechnungszeilen, nur ohne die
-- Zeit-Zweige (keine time_entry-Claims an Angeboten).
create function private.finance_build_offer_lines(p_lines jsonb,p_issuing boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l jsonb; out_lines jsonb:='[]'; qty numeric; price numeric; tax numeric; net bigint; tax_amount bigint;
begin
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>100 or (p_issuing and jsonb_array_length(p_lines)=0) then raise exception 'FINANCE_VALIDATION'; end if;
 for l in select value from jsonb_array_elements(p_lines) loop
  perform private.finance_check_keys(l,array['description','quantity','unit_price_minor','tax_basis_points','zero_tax_reason']);
  if jsonb_typeof(l->'description') is distinct from 'string' or jsonb_typeof(l->'quantity') is distinct from 'number' or jsonb_typeof(l->'unit_price_minor') is distinct from 'number' or jsonb_typeof(l->'tax_basis_points') is distinct from 'number' or jsonb_typeof(l->'zero_tax_reason') is distinct from 'string' then raise exception 'FINANCE_VALIDATION'; end if;
  if coalesce(length(btrim(l->>'description')),0) not between 1 and 1000 or coalesce(length(l->>'zero_tax_reason'),0)>1000 then raise exception 'FINANCE_VALIDATION'; end if;
  qty:=(l->>'quantity')::numeric; price:=(l->>'unit_price_minor')::numeric; tax:=(l->>'tax_basis_points')::numeric;
  if qty is null or qty<=0 or qty>1000000 or qty<>round(qty,4) or price is null or price<>trunc(price) or price not between 0 and 1000000000000 or tax is null or tax<>trunc(tax) or tax not between 0 and 10000 then raise exception 'FINANCE_VALIDATION'; end if;
  if p_issuing and tax=0 and coalesce(length(btrim(l->>'zero_tax_reason')),0)<3 then raise exception 'FINANCE_VALIDATION'; end if;
  net:=round(qty*price); tax_amount:=round(net::numeric*tax/10000);
  if abs(net)+abs(tax_amount)>9000000000000 then raise exception 'FINANCE_VALIDATION'; end if;
  out_lines:=out_lines||jsonb_build_object('description',btrim(l->>'description'),'quantity',qty,'unit_price_minor',price,'tax_basis_points',tax,'zero_tax_reason',coalesce(l->>'zero_tax_reason',''),'net_minor',net,'tax_minor',tax_amount,'total_minor',net+tax_amount);
 end loop;
 return out_lines;
end $$;

create function private.finance_offer_json(p_workspace_id uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.finance_require_manager(p_workspace_id);
 select to_jsonb(o)||jsonb_build_object('client_name',c.name) into result
 from public.finance_offers o join public.finance_clients c on c.workspace_id=o.workspace_id and c.id=o.client_id
 where o.workspace_id=p_workspace_id and o.id=p_id;
 if result is null then raise exception 'FINANCE_NOT_FOUND'; end if;
 return result;
end $$;

create function private.finance_list_offers(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.finance_require_manager(p_workspace_id);
 return coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('client_name',c.name) order by o.created_at desc,o.id)
  from public.finance_offers o join public.finance_clients c on c.workspace_id=o.workspace_id and c.id=o.client_id
  where o.workspace_id=p_workspace_id),'[]');
end $$;

create function private.finance_save_offer(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w uuid:=(p_input->>'workspace_id')::uuid; v_id uuid:=coalesce((p_input->>'id')::uuid,gen_random_uuid()); old_doc public.finance_offers; v_lines jsonb; v_currency text;
begin
 perform private.finance_require_manager(w);
 perform private.finance_check_keys(p_input,array['id','workspace_id','client_id','title','language','valid_until','notes','lines']);
 select currency into v_currency from public.workspaces where id=w for update;
 perform private.finance_require_manager(w);
 select * into old_doc from public.finance_offers where id=v_id for update;
 if found and (old_doc.workspace_id<>w or old_doc.status<>'draft') then raise exception 'FINANCE_CONFLICT'; end if;
 if not exists(select 1 from public.finance_clients where workspace_id=w and id=(p_input->>'client_id')::uuid) then raise exception 'FINANCE_VALIDATION'; end if;
 v_lines:=private.finance_build_offer_lines(p_input->'lines',false);
 insert into public.finance_offers(id,workspace_id,client_id,currency,language,title,valid_until,notes,lines,net_minor,tax_minor,total_minor)
 values(v_id,w,(p_input->>'client_id')::uuid,v_currency,p_input->>'language',btrim(coalesce(p_input->>'title','')),(p_input->>'valid_until')::date,coalesce(p_input->>'notes',''),v_lines,
 coalesce((select sum((l->>'net_minor')::bigint) from jsonb_array_elements(v_lines) l),0),coalesce((select sum((l->>'tax_minor')::bigint) from jsonb_array_elements(v_lines) l),0),coalesce((select sum((l->>'total_minor')::bigint) from jsonb_array_elements(v_lines) l),0))
 on conflict(id) do update set client_id=excluded.client_id,currency=excluded.currency,language=excluded.language,title=excluded.title,valid_until=excluded.valid_until,notes=excluded.notes,lines=excluded.lines,net_minor=excluded.net_minor,tax_minor=excluded.tax_minor,total_minor=excluded.total_minor;
 return private.finance_offer_json(w,v_id);
end $$;

create function private.finance_send_offer(p_workspace_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.finance_offers; profile public.finance_billing_profiles; customer public.finance_clients; raw_lines jsonb; calculated jsonb; v_number text;
begin
 perform private.finance_require_manager(p_workspace_id);
 perform 1 from public.workspaces where id=p_workspace_id for update;
 perform private.finance_require_manager(p_workspace_id);
 select * into d from public.finance_offers where workspace_id=p_workspace_id and id=p_id for update;
 if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
 if d.status='sent' then return private.finance_offer_json(p_workspace_id,p_id); end if;
 if d.status<>'draft' then raise exception 'FINANCE_CONFLICT'; end if;
 select * into profile from public.finance_billing_profiles where workspace_id=p_workspace_id;
 select * into customer from public.finance_clients where workspace_id=p_workspace_id and id=d.client_id;
 if profile.workspace_id is null or length(btrim(profile.legal_name))=0 or length(btrim(profile.billing_address))=0 or length(btrim(customer.billing_address))=0 then raise exception 'FINANCE_CONFIGURATION'; end if;
 select coalesce(jsonb_agg(l-'net_minor'-'tax_minor'-'total_minor'),'[]') into raw_lines from jsonb_array_elements(d.lines) l;
 calculated:=private.finance_build_offer_lines(raw_lines,true);
 v_number:=private.finance_next_offer_number(p_workspace_id);
 update public.finance_offers set status='sent',number=v_number,lines=calculated,issuer_snapshot=to_jsonb(profile),customer_snapshot=to_jsonb(customer),sent_at=now(),
 net_minor=(select sum((l->>'net_minor')::bigint) from jsonb_array_elements(calculated) l),tax_minor=(select sum((l->>'tax_minor')::bigint) from jsonb_array_elements(calculated) l),total_minor=(select sum((l->>'total_minor')::bigint) from jsonb_array_elements(calculated) l) where id=p_id;
 perform private.audit(p_workspace_id,'finance_offer_send','offer',p_id,jsonb_build_object('number',v_number));
 return private.finance_offer_json(p_workspace_id,p_id);
end $$;

create function private.finance_decide_offer(p_workspace_id uuid,p_id uuid,p_accepted boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.finance_offers;
begin
 perform private.finance_require_manager(p_workspace_id);
 if p_accepted is null then raise exception 'FINANCE_VALIDATION'; end if;
 select * into d from public.finance_offers where workspace_id=p_workspace_id and id=p_id for update;
 if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
 if d.status=(case when p_accepted then 'accepted' else 'declined' end) then return private.finance_offer_json(p_workspace_id,p_id); end if;
 if d.status<>'sent' then raise exception 'FINANCE_CONFLICT'; end if;
 update public.finance_offers set status=case when p_accepted then 'accepted' else 'declined' end,decided_at=now() where id=p_id;
 perform private.audit(p_workspace_id,'finance_offer_decide','offer',p_id,jsonb_build_object('accepted',p_accepted));
 return private.finance_offer_json(p_workspace_id,p_id);
end $$;

-- Ein angenommenes Angebot wird genau einmal zum Projekt: neues Projekt mit
-- dem gewuenschten Code plus Festpreis-Plan ueber die Angebotssumme (netto).
create function private.finance_offer_project(p_workspace_id uuid,p_id uuid,p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.finance_offers; v_project uuid;
begin
 perform private.finance_require_manager(p_workspace_id);
 select * into d from public.finance_offers where workspace_id=p_workspace_id and id=p_id for update;
 if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
 if d.project_id is not null then return private.finance_offer_json(p_workspace_id,p_id); end if;
 if d.status<>'accepted' then raise exception 'FINANCE_CONFLICT'; end if;
 if p_code is null or length(btrim(p_code)) not between 1 and 24 then raise exception 'FINANCE_VALIDATION'; end if;
 if exists(select 1 from public.projects where workspace_id=p_workspace_id and code=btrim(p_code)) then raise exception 'FINANCE_CONFLICT'; end if;
 insert into public.projects(workspace_id,code,name,client) values(p_workspace_id,btrim(p_code),left(d.title,160),left(coalesce(d.customer_snapshot->>'name',''),160)) returning id into v_project;
 insert into public.finance_project_plans(workspace_id,project_id,client_id,billing_mode,fixed_fee_minor) values(p_workspace_id,v_project,d.client_id,'fixed',least(greatest(d.net_minor,0),1000000000000));
 update public.finance_offers set project_id=v_project where id=p_id;
 perform private.audit(p_workspace_id,'finance_offer_project','offer',p_id,jsonb_build_object('project_id',v_project));
 return private.finance_offer_json(p_workspace_id,p_id);
end $$;

create function private.finance_delete_offer(p_workspace_id uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare d public.finance_offers;
begin
 perform private.finance_require_manager(p_workspace_id);
 select * into d from public.finance_offers where workspace_id=p_workspace_id and id=p_id for update;
 if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
 if d.status not in ('draft','declined') then raise exception 'FINANCE_CONFLICT'; end if;
 delete from public.finance_offers where id=p_id;
 perform private.audit(p_workspace_id,'finance_offer_delete','offer',p_id);
end $$;

-- Invoker-Wrapper + Grants auf beide Ebenen (Muster der Bestands-RPCs).
create function public.finance_save_offer(p_input jsonb) returns jsonb language sql set search_path='' as $$select private.finance_save_offer(p_input)$$;
create function public.finance_send_offer(p_workspace_id uuid,p_id uuid) returns jsonb language sql set search_path='' as $$select private.finance_send_offer(p_workspace_id,p_id)$$;
create function public.finance_decide_offer(p_workspace_id uuid,p_id uuid,p_accepted boolean) returns jsonb language sql set search_path='' as $$select private.finance_decide_offer(p_workspace_id,p_id,p_accepted)$$;
create function public.finance_offer_project(p_workspace_id uuid,p_id uuid,p_code text) returns jsonb language sql set search_path='' as $$select private.finance_offer_project(p_workspace_id,p_id,p_code)$$;
create function public.finance_delete_offer(p_workspace_id uuid,p_id uuid) returns void language sql set search_path='' as $$select private.finance_delete_offer(p_workspace_id,p_id)$$;
create function public.finance_list_offers(p_workspace_id uuid) returns jsonb language sql stable set search_path='' as $$select private.finance_list_offers(p_workspace_id)$$;
do $$
declare fn text;
begin
 foreach fn in array array[
  'public.finance_save_offer(jsonb)','private.finance_save_offer(jsonb)',
  'public.finance_send_offer(uuid,uuid)','private.finance_send_offer(uuid,uuid)',
  'public.finance_decide_offer(uuid,uuid,boolean)','private.finance_decide_offer(uuid,uuid,boolean)',
  'public.finance_offer_project(uuid,uuid,text)','private.finance_offer_project(uuid,uuid,text)',
  'public.finance_delete_offer(uuid,uuid)','private.finance_delete_offer(uuid,uuid)',
  'public.finance_list_offers(uuid)','private.finance_list_offers(uuid)',
  'private.finance_offer_json(uuid,uuid)','private.finance_next_offer_number(uuid)','private.finance_build_offer_lines(jsonb,boolean)'
 ] loop
  execute format('revoke all on function %s from public,anon',fn);
  execute format('grant execute on function %s to authenticated',fn);
 end loop;
end $$;
