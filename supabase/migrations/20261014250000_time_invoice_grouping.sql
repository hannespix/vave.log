-- M3-H: Zeilenverdichtung für Zeitrechnungen. Bisher erzeugte der Entwurf aus
-- Zeiten je Zeiteintrag eine Zeile — ein Monat Agenturarbeit lief ins
-- 100-Zeilen-Limit, und die Rechnung las sich wie ein Stundenprotokoll.
-- Eine Zeile kann jetzt MEHRERE Zeiteinträge tragen (time_entry_ids):
-- alle Einträge einer Zeile müssen denselben wirksamen Stundensatz haben,
-- damit Menge × Einzelpreis dem Netto entspricht (§ 14 UStG); der Betrag wird
-- einmal über die Minutensumme gerundet. Der Doppelabrechnungsschutz bleibt
-- je Eintrag (finance_time_claims). finance_draft_from_time verdichtet auf
-- Wunsch je (Person, Satz) über den neuen Schlüssel group_lines
-- ('entry' = bisheriges Verhalten und Standard, 'person' = verdichtet).

create or replace function private.finance_build_lines(p_workspace_id uuid,p_project_id uuid,p_lines jsonb,p_issuing boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare l jsonb; out_lines jsonb:='[]'; e public.time_entries; rate bigint; qty numeric; price numeric; tax numeric; net bigint; tax_amount bigint; ids uuid[]:='{}'; tid uuid; gid uuid; group_ids jsonb; group_rate bigint; group_minutes bigint;
begin
 perform private.finance_require_manager(p_workspace_id);
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>100 or (p_issuing and jsonb_array_length(p_lines)=0) then raise exception 'FINANCE_VALIDATION'; end if;
 for l in select value from jsonb_array_elements(p_lines) loop
  perform private.finance_check_keys(l,array['description','quantity','unit_price_minor','tax_basis_points','zero_tax_reason','time_entry_id','time_entry_ids']);
  if jsonb_typeof(l->'description') is distinct from 'string' or jsonb_typeof(l->'quantity') is distinct from 'number' or jsonb_typeof(l->'unit_price_minor') is distinct from 'number' or jsonb_typeof(l->'tax_basis_points') is distinct from 'number' or jsonb_typeof(l->'zero_tax_reason') is distinct from 'string' or (l ? 'time_entry_id' and jsonb_typeof(l->'time_entry_id') not in ('string','null')) or (l ? 'time_entry_ids' and jsonb_typeof(l->'time_entry_ids') not in ('array','null')) then raise exception 'FINANCE_VALIDATION'; end if;
  if coalesce(length(btrim(l->>'description')),0) not between 1 and 1000 or coalesce(length(l->>'zero_tax_reason'),0)>1000 then raise exception 'FINANCE_VALIDATION'; end if;
  qty:=(l->>'quantity')::numeric; price:=(l->>'unit_price_minor')::numeric; tax:=(l->>'tax_basis_points')::numeric;
  if qty is null or qty<=0 or qty>1000000 or qty<>round(qty,4) or price is null or price<>trunc(price) or price not between 0 and 1000000000000 or tax is null or tax<>trunc(tax) or tax not between 0 and 10000 then raise exception 'FINANCE_VALIDATION'; end if;
  if p_issuing and tax=0 and coalesce(length(btrim(l->>'zero_tax_reason')),0)<3 then raise exception 'FINANCE_VALIDATION'; end if;
  tid:=(l->>'time_entry_id')::uuid;
  group_ids:=case when jsonb_typeof(l->'time_entry_ids')='array' then l->'time_entry_ids' end;
  if tid is not null and group_ids is not null then raise exception 'FINANCE_VALIDATION'; end if;
  if tid is not null then
   if tid=any(ids) then raise exception 'FINANCE_CONFLICT'; end if; ids:=array_append(ids,tid);
   select * into e from public.time_entries where workspace_id=p_workspace_id and id=tid and project_id=p_project_id and status='approved' and billable;
   if not found then raise exception 'FINANCE_VALIDATION'; end if;
   if exists(select 1 from public.finance_time_claims where time_entry_id=tid) then raise exception 'FINANCE_CONFLICT'; end if;
   select bill_rate_minor into rate from public.finance_staff_rates where workspace_id=p_workspace_id and user_id=e.user_id and effective_from<=e.work_date order by effective_from desc limit 1;
   if rate is null then select default_bill_rate_minor into rate from public.finance_project_plans where workspace_id=p_workspace_id and project_id=e.project_id and billing_mode='hourly'; end if;
   if rate is null then raise exception 'FINANCE_CONFIGURATION'; end if;
   qty:=round(e.minutes::numeric/60,4); price:=rate; net:=round(e.minutes::numeric*rate/60);
  elsif group_ids is not null then
   if jsonb_array_length(group_ids) not between 1 and 1000 then raise exception 'FINANCE_VALIDATION'; end if;
   group_rate:=null; group_minutes:=0;
   for gid in select value::uuid from jsonb_array_elements_text(group_ids) loop
    if gid=any(ids) then raise exception 'FINANCE_CONFLICT'; end if; ids:=array_append(ids,gid);
    select * into e from public.time_entries where workspace_id=p_workspace_id and id=gid and project_id=p_project_id and status='approved' and billable;
    if not found then raise exception 'FINANCE_VALIDATION'; end if;
    if exists(select 1 from public.finance_time_claims where time_entry_id=gid) then raise exception 'FINANCE_CONFLICT'; end if;
    select bill_rate_minor into rate from public.finance_staff_rates where workspace_id=p_workspace_id and user_id=e.user_id and effective_from<=e.work_date order by effective_from desc limit 1;
    if rate is null then select default_bill_rate_minor into rate from public.finance_project_plans where workspace_id=p_workspace_id and project_id=e.project_id and billing_mode='hourly'; end if;
    if rate is null then raise exception 'FINANCE_CONFIGURATION'; end if;
    if group_rate is null then group_rate:=rate; elsif group_rate<>rate then raise exception 'FINANCE_VALIDATION'; end if;
    group_minutes:=group_minutes+e.minutes;
   end loop;
   qty:=round(group_minutes::numeric/60,4); price:=group_rate; net:=round(group_minutes::numeric*group_rate/60);
  else net:=round(qty*price); end if;
  tax_amount:=round(net::numeric*tax/10000);
  if abs(net)+abs(tax_amount)>9000000000000 then raise exception 'FINANCE_VALIDATION'; end if;
  l:=jsonb_build_object('description',btrim(l->>'description'),'quantity',qty,'unit_price_minor',price,'tax_basis_points',tax,'zero_tax_reason',coalesce(l->>'zero_tax_reason',''),'time_entry_id',tid,'net_minor',net,'tax_minor',tax_amount,'total_minor',net+tax_amount);
  if tid is not null then l:=l||jsonb_build_object('minutes',e.minutes); end if;
  if group_ids is not null then l:=l||jsonb_build_object('time_entry_ids',group_ids,'minutes',group_minutes); end if;
  out_lines:=out_lines||jsonb_build_array(l);
 end loop;
 return out_lines;
end $$;

-- Wie bisher, nur der Zeitraum-Check kennt auch verdichtete Zeilen.
create or replace function private.finance_save_draft(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if exists(select 1 from jsonb_array_elements(v_lines) l
  cross join lateral (
   select (l->>'time_entry_id')::uuid as tid where l->>'time_entry_id' is not null
   union all
   select value::uuid from jsonb_array_elements_text(case when jsonb_typeof(l->'time_entry_ids')='array' then l->'time_entry_ids' else '[]'::jsonb end)
  ) t
  join public.time_entries e on e.id=t.tid
  where e.work_date not between (p_input->>'service_from')::date and (p_input->>'service_to')::date) then raise exception 'FINANCE_VALIDATION'; end if;
 insert into public.finance_invoices(id,workspace_id,client_id,project_id,currency,language,issue_date,due_date,service_from,service_to,notes,payment_instructions,lines,net_minor,tax_minor,total_minor)
 values(v_id,w,(p_input->>'client_id')::uuid,(p_input->>'project_id')::uuid,v_currency,p_input->>'language',(p_input->>'issue_date')::date,(p_input->>'due_date')::date,(p_input->>'service_from')::date,(p_input->>'service_to')::date,coalesce(p_input->>'notes',''),coalesce(p_input->>'payment_instructions',''),v_lines,
 coalesce((select sum((l->>'net_minor')::bigint) from jsonb_array_elements(v_lines) l),0),coalesce((select sum((l->>'tax_minor')::bigint) from jsonb_array_elements(v_lines) l),0),coalesce((select sum((l->>'total_minor')::bigint) from jsonb_array_elements(v_lines) l),0))
 on conflict(id) do update set client_id=excluded.client_id,project_id=excluded.project_id,currency=excluded.currency,language=excluded.language,issue_date=excluded.issue_date,due_date=excluded.due_date,service_from=excluded.service_from,service_to=excluded.service_to,notes=excluded.notes,payment_instructions=excluded.payment_instructions,lines=excluded.lines,net_minor=excluded.net_minor,tax_minor=excluded.tax_minor,total_minor=excluded.total_minor;
 return private.finance_invoice_json(w,v_id);
end $$;

-- Fassung aus full_demo_experience (Demo-Fallbacks) + Claims auch aus time_entry_ids.
create or replace function private.finance_issue_invoice(p_workspace_id uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
 -- Demo workspaces can use all native invoice flows without real billing details.
 -- Missing fictional values exist only in the snapshot; user configuration stays intact.
 if d.is_demo then
  profile.workspace_id:=p_workspace_id;
  profile.legal_name:=coalesce(nullif(profile.legal_name,''),'DEMO Studio');
  profile.billing_address:=coalesce(nullif(profile.billing_address,''),case d.language when 'de' then 'Fiktive Demoadresse' when 'zh' then '虚构演示地址' else 'Fictional demo address' end);
  profile.tax_id:='DEMO-NOT-VALID'; profile.payment_details:=private.demo_invoice_notice(d.language);profile.invoice_prefix:='DEMO';
  profile.footer:=private.demo_invoice_notice(d.language);
  customer.billing_address:=coalesce(nullif(customer.billing_address,''),profile.billing_address);
 end if;
 if profile.workspace_id is null or length(btrim(profile.legal_name))=0 or length(btrim(profile.billing_address))=0 or length(btrim(profile.tax_id))=0 or length(btrim(customer.billing_address))=0 then raise exception 'FINANCE_CONFIGURATION'; end if;
 select coalesce(jsonb_agg(l-'net_minor'-'tax_minor'-'total_minor'-'minutes'),'[]') into raw_lines from jsonb_array_elements(d.lines) l;
 calculated:=private.finance_build_lines(p_workspace_id,d.project_id,raw_lines,true);
 v_number:=private.finance_next_number(p_workspace_id,profile.invoice_prefix);
 update public.finance_invoices set status='issued',number=v_number,currency=curr,lines=calculated,issuer_snapshot=to_jsonb(profile),customer_snapshot=to_jsonb(customer),issued_at=now(),
 net_minor=(select sum((l->>'net_minor')::bigint) from jsonb_array_elements(calculated) l),tax_minor=(select sum((l->>'tax_minor')::bigint) from jsonb_array_elements(calculated) l),total_minor=(select sum((l->>'total_minor')::bigint) from jsonb_array_elements(calculated) l) where id=p_id;
 insert into public.finance_time_claims(workspace_id,time_entry_id,invoice_id)
 select p_workspace_id,t.tid,p_id from jsonb_array_elements(calculated) l
 cross join lateral (
  select (l->>'time_entry_id')::uuid as tid where l->>'time_entry_id' is not null
  union all
  select value::uuid from jsonb_array_elements_text(case when jsonb_typeof(l->'time_entry_ids')='array' then l->'time_entry_ids' else '[]'::jsonb end)
 ) t;
 perform private.audit(p_workspace_id,'finance_issue','invoice',p_id,jsonb_build_object('number',v_number));
 return private.finance_invoice_json(p_workspace_id,p_id);
end $$;

create or replace function private.finance_draft_from_time(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid:=(p_input->>'workspace_id')::uuid; ls jsonb; date_from date:=(p_input->>'from')::date; date_to date:=(p_input->>'to')::date; v_group text:=coalesce(p_input->>'group_lines','entry');
begin
 perform private.finance_require_manager(w);
 perform private.finance_check_keys(p_input,array['workspace_id','project_id','client_id','from','to','language','issue_date','due_date','tax_basis_points','zero_tax_reason','group_lines']);
 if date_from is null or date_to is null or date_to<date_from or v_group not in ('entry','person') then raise exception 'FINANCE_VALIDATION'; end if;
 if v_group='person' then
  -- Eine Zeile je (Person, wirksamer Satz); ein Satz NULL fällt in build_lines
  -- auf FINANCE_CONFIGURATION, genau wie beim Weg je Eintrag.
  with eligible as (
   select e.id,e.user_id,e.work_date,e.minutes,
    coalesce((select r.bill_rate_minor from public.finance_staff_rates r where r.workspace_id=w and r.user_id=e.user_id and r.effective_from<=e.work_date order by r.effective_from desc limit 1),
             (select p.default_bill_rate_minor from public.finance_project_plans p where p.workspace_id=w and p.project_id=e.project_id and p.billing_mode='hourly')) as rate
   from public.time_entries e
   where e.workspace_id=w and e.project_id=(p_input->>'project_id')::uuid and e.work_date between date_from and date_to and e.status='approved' and e.billable
    and not exists(select 1 from public.finance_time_claims c where c.time_entry_id=e.id)
  ), grouped as (
   select user_id,rate,min(work_date) as d1,max(work_date) as d2,jsonb_agg(id order by work_date,id) as tids
   from eligible group by user_id,rate
  )
  select jsonb_agg(jsonb_build_object(
    'description',left(coalesce(nullif(m.display_name,''),m.email,'Team')||' — '||case p_input->>'language' when 'de' then 'Freigegebene Zeit' when 'zh' then '已批准工时' else 'Approved time' end||', '||g.d1::text||' – '||g.d2::text,980),
    'quantity',1,'unit_price_minor',0,'tax_basis_points',p_input->'tax_basis_points','zero_tax_reason',coalesce(p_input->>'zero_tax_reason',''),'time_entry_ids',g.tids)
   order by coalesce(nullif(m.display_name,''),m.email,''),g.rate) into ls
  from grouped g left join public.memberships m on m.workspace_id=w and m.user_id=g.user_id;
 else
  select jsonb_agg(jsonb_build_object('description',e.work_date::text||' — '||left(coalesce(nullif(e.note,''),case p_input->>'language' when 'de' then 'Freigegebene Zeit' when 'zh' then '已批准工时' else 'Approved time' end),980),'quantity',1,'unit_price_minor',0,'tax_basis_points',p_input->'tax_basis_points','zero_tax_reason',coalesce(p_input->>'zero_tax_reason',''),'time_entry_id',e.id) order by e.work_date,e.id) into ls
  from public.time_entries e where e.workspace_id=w and e.project_id=(p_input->>'project_id')::uuid and e.work_date between date_from and date_to and e.status='approved' and e.billable and not exists(select 1 from public.finance_time_claims c where c.time_entry_id=e.id);
 end if;
 if ls is null then raise exception 'FINANCE_NOT_FOUND'; end if;
 return private.finance_save_draft((p_input-'from'-'to'-'tax_basis_points'-'zero_tax_reason'-'group_lines')||jsonb_build_object('service_from',date_from,'service_to',date_to,'notes','','payment_instructions','','lines',ls));
end $$;
