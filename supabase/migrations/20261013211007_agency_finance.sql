-- Additive finance: all financial reads are manager-only. No financial columns
-- are added to member-readable projects/memberships. Amounts use minor units.
create table public.finance_clients (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 name text not null check(length(btrim(name)) between 1 and 160), billing_address text not null default '' check(length(billing_address)<=2000),
 contact_email text not null default '' check(contact_email='' or (length(contact_email)<=320 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 tax_id text not null default '' check(length(tax_id)<=120), language text not null default 'en' check(language in ('en','de','zh')),
 created_at timestamptz not null default now(), unique(workspace_id,id)
);
create table public.finance_billing_profiles (
 workspace_id uuid primary key references public.workspaces(id), legal_name text not null default '' check(length(legal_name)<=160),
 billing_address text not null default '' check(length(billing_address)<=2000), tax_id text not null default '' check(length(tax_id)<=120),
 payment_details text not null default '' check(length(payment_details)<=2000), invoice_prefix text not null default 'INV' check(invoice_prefix ~ '^[A-Z0-9][A-Z0-9-]{0,15}$'), footer text not null default '' check(length(footer)<=4000)
);
create table public.finance_staff_rates (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), user_id uuid not null,
 kind text not null default 'employee' check(kind in ('employee','freelancer')), effective_from date not null check(effective_from between date '2000-01-01' and date '2100-12-31'),
 cost_rate_minor bigint check(cost_rate_minor between 0 and 1000000000000), bill_rate_minor bigint check(bill_rate_minor between 0 and 1000000000000),
 created_at timestamptz not null default now(), foreign key(workspace_id,user_id) references public.memberships(workspace_id,user_id), unique(workspace_id,user_id,effective_from)
);
create table public.finance_project_plans (
 workspace_id uuid not null references public.workspaces(id), project_id uuid not null, client_id uuid,
 billing_mode text not null default 'hourly' check(billing_mode in ('hourly','fixed','internal')), default_bill_rate_minor bigint check(default_bill_rate_minor between 0 and 1000000000000),
 fixed_fee_minor bigint not null default 0 check(fixed_fee_minor between 0 and 1000000000000), planned_expenses_minor bigint not null default 0 check(planned_expenses_minor between 0 and 1000000000000),
 lines jsonb not null default '[]', created_at timestamptz not null default now(), primary key(workspace_id,project_id),
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id), foreign key(workspace_id,client_id) references public.finance_clients(workspace_id,id)
);
create index finance_plans_client on public.finance_project_plans(workspace_id,client_id);
create table public.finance_expenses (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), project_id uuid not null,
 expense_date date not null check(expense_date between date '2000-01-01' and date '2100-12-31'), description text not null check(length(btrim(description)) between 1 and 1000),
 amount_minor bigint not null check(amount_minor between 0 and 1000000000000), category text not null default 'other' check(category in ('external','other')),
 not_time_costed boolean not null check(not_time_costed), created_at timestamptz not null default now(), foreign key(workspace_id,project_id) references public.projects(workspace_id,id)
);
create index finance_expenses_project_date on public.finance_expenses(workspace_id,project_id,expense_date);
create index finance_expenses_workspace_date on public.finance_expenses(workspace_id,expense_date);
create table public.finance_invoices (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), client_id uuid not null, project_id uuid,
 status text not null default 'draft' check(status in ('draft','issued','cancellation')), number text,
 currency text not null check(currency ~ '^[A-Z]{3}$'), language text not null check(language in ('en','de','zh')),
 issue_date date not null check(issue_date between date '2000-01-01' and date '2100-12-31'), due_date date not null check(due_date between issue_date and date '2100-12-31'),
 service_from date not null check(service_from between date '2000-01-01' and date '2100-12-31'), service_to date not null check(service_to between service_from and date '2100-12-31'),
 notes text not null default '' check(length(notes)<=4000), payment_instructions text not null default '' check(length(payment_instructions)<=2000), lines jsonb not null default '[]',
 net_minor bigint not null default 0 check(abs(net_minor)<=9000000000000), tax_minor bigint not null default 0 check(abs(tax_minor)<=9000000000000), total_minor bigint not null default 0 check(abs(total_minor)<=9000000000000),
 issuer_snapshot jsonb, customer_snapshot jsonb, issued_at timestamptz, cancellation_of uuid, cancellation_reason text not null default '' check(length(cancellation_reason)<=2000),
 created_at timestamptz not null default now(), unique(workspace_id,id), unique(workspace_id,number), unique(cancellation_of),
 foreign key(workspace_id,client_id) references public.finance_clients(workspace_id,id), foreign key(workspace_id,project_id) references public.projects(workspace_id,id),
 foreign key(workspace_id,cancellation_of) references public.finance_invoices(workspace_id,id),
 check((status='draft' and number is null and issued_at is null and issuer_snapshot is null and customer_snapshot is null and cancellation_of is null)
 or(status='issued' and number is not null and issued_at is not null and issuer_snapshot is not null and customer_snapshot is not null and cancellation_of is null)
 or(status='cancellation' and number is not null and issued_at is not null and issuer_snapshot is not null and customer_snapshot is not null and cancellation_of is not null))
);
create index finance_invoices_workspace_created on public.finance_invoices(workspace_id,created_at,id);
create index finance_invoices_client on public.finance_invoices(workspace_id,client_id);
create index finance_invoices_project on public.finance_invoices(workspace_id,project_id);
create table public.finance_payments (
 workspace_id uuid not null references public.workspaces(id), invoice_id uuid primary key, paid boolean not null default false, updated_at timestamptz not null default now(),
 foreign key(workspace_id,invoice_id) references public.finance_invoices(workspace_id,id)
);
create index finance_payments_workspace on public.finance_payments(workspace_id,invoice_id);
alter table public.time_entries add constraint time_entries_workspace_id_id_key unique(workspace_id,id);
create table public.finance_time_claims (
 workspace_id uuid not null references public.workspaces(id), time_entry_id uuid primary key, invoice_id uuid not null,
 foreign key(workspace_id,time_entry_id) references public.time_entries(workspace_id,id), foreign key(workspace_id,invoice_id) references public.finance_invoices(workspace_id,id)
);
create index finance_time_claims_invoice on public.finance_time_claims(workspace_id,invoice_id);
create table private.finance_number_counters (workspace_id uuid primary key references public.workspaces(id), next_number bigint not null default 1 check(next_number>0));

create function private.finance_require_manager(p_workspace_id uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(private.current_role(p_workspace_id) in ('owner','manager'),false) then raise exception 'FINANCE_FORBIDDEN' using errcode='42501'; end if;
end $$;
-- Dedicated deployment hook: demo migration extends this to forbid real issue.
create function private.finance_assert_can_issue(p_workspace_id uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin perform private.finance_require_manager(p_workspace_id); end $$;
create function private.finance_check_keys(p_value jsonb,p_allowed text[]) returns void language plpgsql immutable set search_path='' as $$
begin
 if p_value is null or jsonb_typeof(p_value)<>'object' or exists(select 1 from jsonb_object_keys(p_value) k where not(k=any(p_allowed))) then raise exception 'FINANCE_VALIDATION'; end if;
end $$;
create function private.finance_guard_plan() returns trigger language plpgsql set search_path='' as $$
declare l jsonb; v numeric;
begin
 if tg_op='UPDATE' and (new.workspace_id<>old.workspace_id or new.project_id<>old.project_id or new.created_at<>old.created_at) then raise exception 'FINANCE_VALIDATION'; end if;
 if jsonb_typeof(new.lines)<>'array' or jsonb_array_length(new.lines)>100 then raise exception 'FINANCE_VALIDATION'; end if;
 for l in select value from jsonb_array_elements(new.lines) loop
  perform private.finance_check_keys(l,array['label','kind','user_id','planned_minutes','cost_rate_minor','bill_rate_minor']);
  if not(l ?& array['label','kind','user_id','planned_minutes','cost_rate_minor','bill_rate_minor']) or jsonb_typeof(l->'label') is distinct from 'string' or jsonb_typeof(l->'kind') is distinct from 'string' or jsonb_typeof(l->'planned_minutes') is distinct from 'number' or jsonb_typeof(l->'cost_rate_minor') not in ('number','null') or jsonb_typeof(l->'bill_rate_minor') not in ('number','null') or jsonb_typeof(l->'user_id') not in ('string','null') then raise exception 'FINANCE_VALIDATION'; end if;
  if coalesce(length(btrim(l->>'label')),0) not between 1 and 240 or coalesce(l->>'kind','') not in ('employee','freelancer') then raise exception 'FINANCE_VALIDATION'; end if;
  v:=(l->>'planned_minutes')::numeric; if v is null or v<>trunc(v) or v not between 0 and 52560000 then raise exception 'FINANCE_VALIDATION'; end if;
  foreach v in array array[(l->>'cost_rate_minor')::numeric,(l->>'bill_rate_minor')::numeric] loop if v is not null and (v<>trunc(v) or v not between 0 and 1000000000000) then raise exception 'FINANCE_VALIDATION'; end if; end loop;
  if l->>'user_id' is not null and not exists(select 1 from public.memberships where workspace_id=new.workspace_id and user_id=(l->>'user_id')::uuid) then raise exception 'FINANCE_VALIDATION'; end if;
 end loop;
 return new;
end $$;
create trigger finance_plan_guard before insert or update on public.finance_project_plans for each row execute function private.finance_guard_plan();
create function private.finance_guard_document() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'FINANCE_CONFLICT'; end if;
 if tg_op='UPDATE' and (old.status<>'draft' or new.id<>old.id or new.workspace_id<>old.workspace_id or new.created_at<>old.created_at) then raise exception 'FINANCE_CONFLICT'; end if;
 if current_user in ('authenticated','anon') then raise exception 'FINANCE_FORBIDDEN' using errcode='42501'; end if;
 return new;
end $$;
create trigger finance_document_guard before insert or update or delete on public.finance_invoices for each row execute function private.finance_guard_document();
create trigger finance_client_identity before update on public.finance_clients for each row execute function private.guard_identity();
create trigger finance_rate_identity before update on public.finance_staff_rates for each row execute function private.guard_identity();
create trigger finance_expense_identity before update on public.finance_expenses for each row execute function private.guard_identity();

-- All public finance tables are readable only by managers; restricted tables have no write grants.
do $$ declare t text; begin
 foreach t in array array['finance_clients','finance_billing_profiles','finance_staff_rates','finance_project_plans','finance_expenses','finance_invoices','finance_payments','finance_time_claims'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy finance_read on public.%I for select to authenticated using(private.current_role(workspace_id) in (''owner'',''manager''))',t);
 end loop;
 foreach t in array array['finance_clients','finance_staff_rates','finance_project_plans','finance_expenses'] loop
  execute format('grant insert,update on public.%I to authenticated',t);
  execute format('create policy finance_insert on public.%I for insert to authenticated with check(private.current_role(workspace_id) in (''owner'',''manager''))',t);
  execute format('create policy finance_update on public.%I for update to authenticated using(private.current_role(workspace_id) in (''owner'',''manager'')) with check(private.current_role(workspace_id) in (''owner'',''manager''))',t);
 end loop;
end $$;
grant delete on public.finance_expenses to authenticated;
create policy finance_expense_delete on public.finance_expenses for delete to authenticated using(private.current_role(workspace_id) in ('owner','manager'));
grant insert,update on public.finance_billing_profiles to authenticated;
create policy finance_profile_insert on public.finance_billing_profiles for insert to authenticated with check(private.current_role(workspace_id)='owner');
create policy finance_profile_update on public.finance_billing_profiles for update to authenticated using(private.current_role(workspace_id)='owner') with check(private.current_role(workspace_id)='owner');
alter table private.finance_number_counters enable row level security;
revoke all on private.finance_number_counters from public,anon,authenticated;

create function private.finance_build_lines(p_workspace_id uuid,p_project_id uuid,p_lines jsonb,p_issuing boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare l jsonb; out_lines jsonb:='[]'; e public.time_entries; rate bigint; qty numeric; price numeric; tax numeric; net bigint; tax_amount bigint; ids uuid[]:='{}'; tid uuid;
begin
 perform private.finance_require_manager(p_workspace_id);
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>100 or (p_issuing and jsonb_array_length(p_lines)=0) then raise exception 'FINANCE_VALIDATION'; end if;
 for l in select value from jsonb_array_elements(p_lines) loop
  perform private.finance_check_keys(l,array['description','quantity','unit_price_minor','tax_basis_points','zero_tax_reason','time_entry_id']);
  if jsonb_typeof(l->'description') is distinct from 'string' or jsonb_typeof(l->'quantity') is distinct from 'number' or jsonb_typeof(l->'unit_price_minor') is distinct from 'number' or jsonb_typeof(l->'tax_basis_points') is distinct from 'number' or jsonb_typeof(l->'zero_tax_reason') is distinct from 'string' or (l ? 'time_entry_id' and jsonb_typeof(l->'time_entry_id') not in ('string','null')) then raise exception 'FINANCE_VALIDATION'; end if;
  if coalesce(length(btrim(l->>'description')),0) not between 1 and 1000 or coalesce(length(l->>'zero_tax_reason'),0)>1000 then raise exception 'FINANCE_VALIDATION'; end if;
  qty:=(l->>'quantity')::numeric; price:=(l->>'unit_price_minor')::numeric; tax:=(l->>'tax_basis_points')::numeric;
  if qty is null or qty<=0 or qty>1000000 or qty<>round(qty,4) or price is null or price<>trunc(price) or price not between 0 and 1000000000000 or tax is null or tax<>trunc(tax) or tax not between 0 and 10000 then raise exception 'FINANCE_VALIDATION'; end if;
  if p_issuing and tax=0 and coalesce(length(btrim(l->>'zero_tax_reason')),0)<3 then raise exception 'FINANCE_VALIDATION'; end if;
  tid:=(l->>'time_entry_id')::uuid;
  if tid is not null then
   if tid=any(ids) then raise exception 'FINANCE_CONFLICT'; end if; ids:=array_append(ids,tid);
   select * into e from public.time_entries where workspace_id=p_workspace_id and id=tid and project_id=p_project_id and status='approved' and billable;
   if not found then raise exception 'FINANCE_VALIDATION'; end if;
   if exists(select 1 from public.finance_time_claims where time_entry_id=tid) then raise exception 'FINANCE_CONFLICT'; end if;
   select bill_rate_minor into rate from public.finance_staff_rates where workspace_id=p_workspace_id and user_id=e.user_id and effective_from<=e.work_date order by effective_from desc limit 1;
   if rate is null then select default_bill_rate_minor into rate from public.finance_project_plans where workspace_id=p_workspace_id and project_id=e.project_id and billing_mode='hourly'; end if;
   if rate is null then raise exception 'FINANCE_CONFIGURATION'; end if;
   qty:=round(e.minutes::numeric/60,4); price:=rate; net:=round(e.minutes::numeric*rate/60);
  else net:=round(qty*price); end if;
  tax_amount:=round(net::numeric*tax/10000);
  if abs(net)+abs(tax_amount)>9000000000000 then raise exception 'FINANCE_VALIDATION'; end if;
  l:=jsonb_build_object('description',btrim(l->>'description'),'quantity',qty,'unit_price_minor',price,'tax_basis_points',tax,'zero_tax_reason',coalesce(l->>'zero_tax_reason',''),'time_entry_id',tid,'net_minor',net,'tax_minor',tax_amount,'total_minor',net+tax_amount);
  if tid is not null then l:=l||jsonb_build_object('minutes',e.minutes); end if;
  out_lines:=out_lines||jsonb_build_array(l);
 end loop;
 return out_lines;
end $$;
create function private.finance_invoice_json(p_workspace_id uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
 perform private.finance_require_manager(p_workspace_id);
 select to_jsonb(i)||jsonb_build_object('paid',coalesce((select paid from public.finance_payments where invoice_id=i.id),false),'cancellation_id',(select id from public.finance_invoices where cancellation_of=i.id)) into v from public.finance_invoices i where i.workspace_id=p_workspace_id and i.id=p_id;
 if v is null then raise exception 'FINANCE_NOT_FOUND'; end if; return v;
end $$;
create function private.finance_save_draft(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid:=(p_input->>'workspace_id')::uuid; v_id uuid:=coalesce((p_input->>'id')::uuid,gen_random_uuid()); old_doc public.finance_invoices; v_lines jsonb; v_currency text;
begin
 perform private.finance_require_manager(w);
 perform private.finance_check_keys(p_input,array['id','workspace_id','client_id','project_id','language','issue_date','due_date','service_from','service_to','notes','payment_instructions','lines']);
 select currency into v_currency from public.workspaces where id=w for update;
 perform private.finance_require_manager(w);
 select * into old_doc from public.finance_invoices where id=v_id for update;
 if found and (old_doc.workspace_id<>w or old_doc.status<>'draft') then raise exception 'FINANCE_CONFLICT'; end if;
 if not exists(select 1 from public.finance_clients where workspace_id=w and id=(p_input->>'client_id')::uuid) or (p_input->>'project_id' is not null and not exists(select 1 from public.projects where workspace_id=w and id=(p_input->>'project_id')::uuid)) then raise exception 'FINANCE_VALIDATION'; end if;
 v_lines:=private.finance_build_lines(w,(p_input->>'project_id')::uuid,p_input->'lines',false);
 if exists(select 1 from jsonb_array_elements(v_lines) l join public.time_entries e on e.id=(l->>'time_entry_id')::uuid where e.work_date not between (p_input->>'service_from')::date and (p_input->>'service_to')::date) then raise exception 'FINANCE_VALIDATION'; end if;
 insert into public.finance_invoices(id,workspace_id,client_id,project_id,currency,language,issue_date,due_date,service_from,service_to,notes,payment_instructions,lines,net_minor,tax_minor,total_minor)
 values(v_id,w,(p_input->>'client_id')::uuid,(p_input->>'project_id')::uuid,v_currency,p_input->>'language',(p_input->>'issue_date')::date,(p_input->>'due_date')::date,(p_input->>'service_from')::date,(p_input->>'service_to')::date,coalesce(p_input->>'notes',''),coalesce(p_input->>'payment_instructions',''),v_lines,
 coalesce((select sum((l->>'net_minor')::bigint) from jsonb_array_elements(v_lines) l),0),coalesce((select sum((l->>'tax_minor')::bigint) from jsonb_array_elements(v_lines) l),0),coalesce((select sum((l->>'total_minor')::bigint) from jsonb_array_elements(v_lines) l),0))
 on conflict(id) do update set client_id=excluded.client_id,project_id=excluded.project_id,currency=excluded.currency,language=excluded.language,issue_date=excluded.issue_date,due_date=excluded.due_date,service_from=excluded.service_from,service_to=excluded.service_to,notes=excluded.notes,payment_instructions=excluded.payment_instructions,lines=excluded.lines,net_minor=excluded.net_minor,tax_minor=excluded.tax_minor,total_minor=excluded.total_minor;
 return private.finance_invoice_json(w,v_id);
end $$;
create function private.finance_next_number(p_workspace_id uuid,p_prefix text) returns text language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
 perform private.finance_require_manager(p_workspace_id);
 insert into private.finance_number_counters(workspace_id,next_number) values(p_workspace_id,2) on conflict(workspace_id) do update set next_number=private.finance_number_counters.next_number+1 returning next_number-1 into n;
 return p_prefix||'-'||lpad(n::text,greatest(6,length(n::text)),'0');
end $$;
create function private.finance_issue_invoice(p_workspace_id uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.finance_invoices; profile public.finance_billing_profiles; customer public.finance_clients; raw_lines jsonb; calculated jsonb; v_number text; curr text;
begin
 perform private.finance_assert_can_issue(p_workspace_id);
 select currency into curr from public.workspaces where id=p_workspace_id for update;
 perform private.finance_assert_can_issue(p_workspace_id);
 select * into d from public.finance_invoices where workspace_id=p_workspace_id and id=p_id for update;
 if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
 if d.status='issued' then return private.finance_invoice_json(p_workspace_id,p_id); end if;
 if d.status<>'draft' then raise exception 'FINANCE_CONFLICT'; end if;
 select * into profile from public.finance_billing_profiles where workspace_id=p_workspace_id;
 select * into customer from public.finance_clients where workspace_id=p_workspace_id and id=d.client_id;
 if profile.workspace_id is null or length(btrim(profile.legal_name))=0 or length(btrim(profile.billing_address))=0 or length(btrim(profile.tax_id))=0 or length(btrim(customer.billing_address))=0 then raise exception 'FINANCE_CONFIGURATION'; end if;
 select coalesce(jsonb_agg(l-'net_minor'-'tax_minor'-'total_minor'-'minutes'),'[]') into raw_lines from jsonb_array_elements(d.lines) l;
 calculated:=private.finance_build_lines(p_workspace_id,d.project_id,raw_lines,true);
 v_number:=private.finance_next_number(p_workspace_id,profile.invoice_prefix);
 update public.finance_invoices set status='issued',number=v_number,currency=curr,lines=calculated,issuer_snapshot=to_jsonb(profile),customer_snapshot=to_jsonb(customer),issued_at=now(),
 net_minor=(select sum((l->>'net_minor')::bigint) from jsonb_array_elements(calculated) l),tax_minor=(select sum((l->>'tax_minor')::bigint) from jsonb_array_elements(calculated) l),total_minor=(select sum((l->>'total_minor')::bigint) from jsonb_array_elements(calculated) l) where id=p_id;
 insert into public.finance_time_claims(workspace_id,time_entry_id,invoice_id) select p_workspace_id,(l->>'time_entry_id')::uuid,p_id from jsonb_array_elements(calculated) l where l->>'time_entry_id' is not null;
 perform private.audit(p_workspace_id,'finance_issue','invoice',p_id,jsonb_build_object('number',v_number));
 return private.finance_invoice_json(p_workspace_id,p_id);
end $$;
create function private.finance_cancel_invoice(p_workspace_id uuid,p_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.finance_invoices; existing uuid; new_id uuid:=gen_random_uuid(); v_number text; negative_lines jsonb;
begin
 perform private.finance_assert_can_issue(p_workspace_id);
 perform 1 from public.workspaces where id=p_workspace_id for update;
 perform private.finance_assert_can_issue(p_workspace_id);
 select * into d from public.finance_invoices where workspace_id=p_workspace_id and id=p_id for update;
 if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
 if d.status<>'issued' then raise exception 'FINANCE_CONFLICT'; end if;
 select id into existing from public.finance_invoices where cancellation_of=p_id;
 if found then return private.finance_invoice_json(p_workspace_id,existing); end if;
 if p_reason is null or length(btrim(p_reason)) not between 3 and 2000 then raise exception 'FINANCE_VALIDATION'; end if;
 v_number:=private.finance_next_number(p_workspace_id,d.issuer_snapshot->>'invoice_prefix');
 select jsonb_agg(l||jsonb_build_object('quantity',-(l->>'quantity')::numeric,'net_minor',-(l->>'net_minor')::bigint,'tax_minor',-(l->>'tax_minor')::bigint,'total_minor',-(l->>'total_minor')::bigint)) into negative_lines from jsonb_array_elements(d.lines) l;
 insert into public.finance_invoices(id,workspace_id,client_id,project_id,status,number,currency,language,issue_date,due_date,service_from,service_to,notes,payment_instructions,lines,net_minor,tax_minor,total_minor,issuer_snapshot,customer_snapshot,issued_at,cancellation_of,cancellation_reason)
 values(new_id,p_workspace_id,d.client_id,d.project_id,'cancellation',v_number,d.currency,d.language,current_date,current_date,d.service_from,d.service_to,d.notes,d.payment_instructions,negative_lines,-d.net_minor,-d.tax_minor,-d.total_minor,d.issuer_snapshot,d.customer_snapshot,now(),p_id,btrim(p_reason));
 perform private.audit(p_workspace_id,'finance_cancel','invoice',new_id,jsonb_build_object('number',v_number,'original_id',p_id));
 return private.finance_invoice_json(p_workspace_id,new_id);
end $$;
create function private.finance_set_paid(p_workspace_id uuid,p_id uuid,p_paid boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.finance_require_manager(p_workspace_id);
 perform 1 from public.finance_invoices where workspace_id=p_workspace_id and id=p_id and status='issued' for update;
 if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
 if p_paid is null then raise exception 'FINANCE_VALIDATION'; end if;
 insert into public.finance_payments(workspace_id,invoice_id,paid) values(p_workspace_id,p_id,p_paid) on conflict(invoice_id) do update set paid=excluded.paid,updated_at=now();
 perform private.audit(p_workspace_id,'finance_paid','invoice',p_id,jsonb_build_object('paid',p_paid));
 return private.finance_invoice_json(p_workspace_id,p_id);
end $$;
create function private.finance_list_invoices(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.finance_require_manager(p_workspace_id);
 if (select count(*) from public.finance_invoices where workspace_id=p_workspace_id)>1000 then raise exception 'FINANCE_LIMIT'; end if;
 return coalesce((select jsonb_agg(private.finance_invoice_json(p_workspace_id,id) order by created_at desc,id) from public.finance_invoices where workspace_id=p_workspace_id),'[]');
end $$;
create function private.finance_draft_from_time(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid:=(p_input->>'workspace_id')::uuid; ls jsonb; date_from date:=(p_input->>'from')::date; date_to date:=(p_input->>'to')::date;
begin
 perform private.finance_require_manager(w);
 perform private.finance_check_keys(p_input,array['workspace_id','project_id','client_id','from','to','language','issue_date','due_date','tax_basis_points','zero_tax_reason']);
 if date_from is null or date_to is null or date_to<date_from then raise exception 'FINANCE_VALIDATION'; end if;
 select jsonb_agg(jsonb_build_object('description',e.work_date::text||' — '||left(coalesce(nullif(e.note,''),'Approved time'),980),'quantity',1,'unit_price_minor',0,'tax_basis_points',p_input->'tax_basis_points','zero_tax_reason',coalesce(p_input->>'zero_tax_reason',''),'time_entry_id',e.id) order by e.work_date,e.id) into ls
 from public.time_entries e where e.workspace_id=w and e.project_id=(p_input->>'project_id')::uuid and e.work_date between date_from and date_to and e.status='approved' and e.billable and not exists(select 1 from public.finance_time_claims c where c.time_entry_id=e.id);
 if ls is null then raise exception 'FINANCE_NOT_FOUND'; end if;
 return private.finance_save_draft((p_input-'from'-'to'-'tax_basis_points'-'zero_tax_reason')||jsonb_build_object('service_from',date_from,'service_to',date_to,'notes','','payment_instructions','','lines',ls));
end $$;
-- Only allow public invoker entry points; every private implementation rechecks auth.
create function public.finance_save_draft(p_input jsonb) returns jsonb language sql set search_path='' as $$select private.finance_save_draft(p_input)$$;
create function public.finance_draft_from_time(p_input jsonb) returns jsonb language sql set search_path='' as $$select private.finance_draft_from_time(p_input)$$;
create function public.finance_issue_invoice(p_workspace_id uuid,p_id uuid) returns jsonb language sql set search_path='' as $$select private.finance_issue_invoice(p_workspace_id,p_id)$$;
create function public.finance_cancel_invoice(p_workspace_id uuid,p_id uuid,p_reason text) returns jsonb language sql set search_path='' as $$select private.finance_cancel_invoice(p_workspace_id,p_id,p_reason)$$;
create function public.finance_set_paid(p_workspace_id uuid,p_id uuid,p_paid boolean) returns jsonb language sql set search_path='' as $$select private.finance_set_paid(p_workspace_id,p_id,p_paid)$$;
create function public.finance_get_invoice(p_workspace_id uuid,p_id uuid) returns jsonb language sql stable set search_path='' as $$select private.finance_invoice_json(p_workspace_id,p_id)$$;
create function public.finance_list_invoices(p_workspace_id uuid) returns jsonb language sql stable set search_path='' as $$select private.finance_list_invoices(p_workspace_id)$$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'finance_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  -- Private helpers called by RLS-trigger code or public invoker wrappers only.
  if f.nspname='public' or f.proname in ('finance_save_draft','finance_draft_from_time','finance_issue_invoice','finance_cancel_invoice','finance_set_paid','finance_invoice_json','finance_list_invoices','finance_check_keys') then execute format('grant execute on function %s to authenticated',f.sig); end if;
 end loop;
end $$;
