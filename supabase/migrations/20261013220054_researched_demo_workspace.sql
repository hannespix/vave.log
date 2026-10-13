-- Researched optional sample workspace. Public metadata is immutable to API roles;
-- all operational and financial activity is fictional. No identities are created.
create table public.workspace_demos (
 workspace_id uuid primary key references public.workspaces(id),
 created_by uuid not null references auth.users(id),
 request_id uuid not null,
 locale text not null check(locale in ('en','de','zh')),
 manifest_version text not null,
 manifest jsonb not null check(jsonb_typeof(manifest)='object' and manifest->>'version'=manifest_version),
 created_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(created_by,request_id)
);
alter table public.workspace_demos enable row level security;
revoke all on public.workspace_demos from public,anon,authenticated;
grant select on public.workspace_demos to authenticated;
create policy demo_read on public.workspace_demos for select to authenticated
 using(private.current_role(workspace_id) is not null);

-- Existing policies and role-checked RPCs automatically hide archived samples.
-- The definer lookup bypasses this table's read policy, preventing RLS recursion.
create or replace function private.current_role(p_workspace_id uuid) returns text
language sql stable security definer set search_path='' as $$
 select m.role from public.memberships m
 join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
 where m.workspace_id=p_workspace_id and m.user_id=(select auth.uid())
 and m.role in ('owner','manager','member')
 and not exists(select 1 from public.workspace_demos d where d.workspace_id=p_workspace_id and d.archived_at is not null)
$$;

-- Authoritative database manifest: callers can select a locale, never supply data.
create function private.demo_manifest() returns jsonb
language sql immutable set search_path='' as $function$
 select $manifest${
  "version": "vave-public-2026-10-13.1",
  "researched_at": "2026-10-13",
  "disclosure": {
    "en": "Public portfolio references. All operational and financial figures are fictional demo data.",
    "de": "Öffentliche Portfolio-Referenzen. Alle betrieblichen und finanziellen Angaben sind fiktive Demodaten.",
    "zh": "项目资料来自公开作品集。所有运营和财务数据均为虚构的演示数据。"
  },
  "studios": [
    {
      "id": "frankfurt",
      "name": "Frankfurt",
      "city": "Frankfurt am Main",
      "country": "Germany",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "shanghai",
      "name": "Shanghai",
      "city": "Shanghai",
      "country": "China",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "shenzhen",
      "name": "Shenzhen",
      "city": "Shenzhen",
      "country": "China",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "dubai",
      "name": "Dubai",
      "city": "Dubai",
      "country": "United Arab Emirates",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "imagination-shanghai",
      "name": "Imagination Shanghai",
      "city": "Shanghai",
      "country": "China",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "imagination-shenzhen",
      "name": "Imagination Shenzhen",
      "city": "Shenzhen",
      "country": "China",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "digital-singapore",
      "name": "Digital Singapore",
      "city": "Singapore",
      "country": "Singapore",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "digital-shanghai",
      "name": "Digital Shanghai",
      "city": "Shanghai",
      "country": "China",
      "source_url": "https://www.vave.studio/contact/"
    }
  ],
  "projects": [
    {
      "code": "MYM26",
      "name": "MY MUSEUM",
      "client": "Sinovac Life Sciences",
      "year": 2026,
      "location": "Beijing, China",
      "types": [
        "Art Installation",
        "Museum",
        "Visitor Center"
      ],
      "summary": "Immersive museum connecting life science, art and personal reflection.",
      "source_url": "https://www.vave.studio/project/my-museum/"
    },
    {
      "code": "ICOM25",
      "name": "WEAVING A VERSATILE FUTURE",
      "client": "Dubai Culture Arts Authority",
      "year": 2025,
      "location": "Dubai, UAE",
      "types": [
        "Event",
        "Fair"
      ],
      "summary": "Spatial design and interactive cultural experiences for ICOM Dubai 2025.",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/"
    },
    {
      "code": "LEAP25",
      "name": "stc at LEAP25",
      "client": "stc",
      "year": 2025,
      "location": "Riyadh, KSA",
      "types": [
        "Fair"
      ],
      "summary": "Technology exhibition arranged as a city of themed digital districts.",
      "source_url": "https://www.vave.studio/project/stc-at-leap25/"
    },
    {
      "code": "BAL25",
      "name": "Induction Field",
      "client": "Bailian Group",
      "year": 2025,
      "location": "Shanghai, China",
      "types": [
        "Fair",
        "Retail"
      ],
      "summary": "The bálancing exhibition booth connecting retail, art and technology at CIIE.",
      "source_url": "https://www.vave.studio/project/the-balancing/"
    },
    {
      "code": "DATA18",
      "name": "DATA IN MOTION",
      "client": "Accenture",
      "year": 2018,
      "location": "Kronberg, Germany",
      "types": [
        "Showroom",
        "Visitor Center"
      ],
      "summary": "A responsive media installation visualizing data at Accenture's campus.",
      "source_url": "https://www.vave.studio/project/data-in-motion/"
    },
    {
      "code": "META22",
      "name": "META CUBE EXPERIENCE",
      "client": "SAP",
      "year": 2022,
      "location": "Hanover, Germany",
      "types": [
        "Fair",
        "Interactive"
      ],
      "summary": "An interactive cube installation explaining industrial digital processes at Hannover Messe.",
      "source_url": "https://www.vave.studio/project/meta-cube-experience/"
    },
    {
      "code": "POR16",
      "name": "THE FUTURE OF PERFORMANCE",
      "client": "Porsche AG",
      "year": 2016,
      "location": "Berlin, Germany",
      "types": [
        "Exhibition",
        "Showroom"
      ],
      "summary": "Temporary Porsche brand exhibition at the Volkswagen Group's Drive forum.",
      "source_url": "https://www.vave.studio/project/the-future-of-performance/"
    },
    {
      "code": "DB23",
      "name": "ZUKUNFT NAHVERKEHR",
      "client": "DB Regio",
      "year": 2023,
      "location": "Berlin, Germany",
      "types": [
        "Event",
        "Exhibition"
      ],
      "summary": "An introductory exhibition journey about the future of regional mobility.",
      "source_url": "https://www.vave.studio/project/zukunft-nahverkehr-db/"
    }
  ],
  "people": [
    {
      "name": "Tobias Geisler",
      "role": "Co-Founder & CEO",
      "source_url": "https://www.vave.studio/fra/tobias-geisler-to-be-jury-chair-of-2026-adc-awards/"
    },
    {
      "name": "Haijie Hu",
      "role": "Co-Founder",
      "source_url": "https://www.vave.studio/sha/hu-haijie-attend-caas-dalu-forum-make-people-feel/"
    },
    {
      "name": "Christian Rösner",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/"
    },
    {
      "name": "Dustin Stupp",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/"
    },
    {
      "name": "Matthias Sütterlin",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/"
    },
    {
      "name": "Whan Lee",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/"
    }
  ],
  "phases": [
    {
      "en": "Research & Strategy",
      "de": "Recherche & Strategie",
      "zh": "研究与策略"
    },
    {
      "en": "Design & Planning",
      "de": "Design & Planung",
      "zh": "设计与规划"
    },
    {
      "en": "Production & Supervision",
      "de": "Produktion & Begleitung",
      "zh": "制作与监督"
    }
  ],
  "sources": [
    "https://www.vave.studio/",
    "https://www.vave.studio/contact/",
    "https://www.vave.studio/culture/",
    "https://www.vave.studio/approach/",
    "https://www.vave.studio/imprint/",
    "https://www.vave.studio/project/my-museum/",
    "https://www.vave.studio/project/weaving-a-versatile-future/",
    "https://www.vave.studio/project/stc-at-leap25/",
    "https://www.vave.studio/project/the-balancing/",
    "https://www.vave.studio/project/data-in-motion/",
    "https://www.vave.studio/project/meta-cube-experience/",
    "https://www.vave.studio/project/the-future-of-performance/",
    "https://www.vave.studio/project/zukunft-nahverkehr-db/",
    "https://www.vave.studio/fra/tobias-geisler-to-be-jury-chair-of-2026-adc-awards/",
    "https://www.vave.studio/sha/hu-haijie-attend-caas-dalu-forum-make-people-feel/",
    "https://www.vave.studio/imprint/"
  ]
}$manifest$::jsonb
$function$;

create function private.demo_create_workspace(p_name text,p_timezone text,p_locale text,p_request_id uuid)
returns public.workspaces language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=private.require_user(); v_workspace public.workspaces; v_existing public.workspace_demos;
 v_manifest jsonb:=private.demo_manifest(); v_project jsonb; v_phase jsonb; v_index integer:=0; v_phase_index integer;
 v_project_id uuid; v_client_id uuid; v_first_project uuid; v_first_client uuid;
 v_today date; v_week date; v_labels jsonb; v_estimates jsonb;
begin
 if coalesce(length(btrim(p_name)),0) not between 1 and 100 or p_locale is null or p_locale not in ('en','de','zh')
 or p_request_id is null or p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
  raise exception 'DEMO_VALIDATION';
 end if;
 -- User-scoped lock serializes retries before either a workspace or marker exists.
 perform private.lock_user(v_user);
 select * into v_existing from public.workspace_demos where created_by=v_user and request_id=p_request_id;
 if found then
  perform 1 from public.workspaces where id=v_existing.workspace_id for update;
  if v_existing.archived_at is not null then raise exception 'DEMO_CONFLICT: This sample was archived.'; end if;
  if private.current_role(v_existing.workspace_id) is distinct from 'owner' then raise exception 'DEMO_FORBIDDEN' using errcode='42501'; end if;
  select * into v_workspace from public.workspaces where id=v_existing.workspace_id;
  return v_workspace;
 end if;
 -- Existing provisioning validates the confirmed email and creates only the actor.
 select * into v_workspace from public.create_workspace(p_name,p_timezone,'EUR');
 insert into public.workspace_demos(workspace_id,created_by,request_id,locale,manifest_version,manifest)
 values(v_workspace.id,v_user,p_request_id,p_locale,v_manifest->>'version',v_manifest);
 v_today:=(now() at time zone p_timezone)::date;
 v_week:=date_trunc('week',now() at time zone p_timezone)::date;
 v_labels:=case p_locale
  when 'de' then jsonb_build_object('strategy','Demo: Strategie-Team','design','Demo: Design-Team','production','Demo: Externe Produktionsplanung','time','Fiktive Demozeit; keine tatsächliche Projektleistung','expense','Demo: Material und Prototyp-Miete','invoice','Demo: Konzeptphase (fiktiv)')
  when 'zh' then jsonb_build_object('strategy','演示：策略团队','design','演示：设计团队','production','演示：外部制作策划','time','虚构演示工时；并非真实项目工作','expense','演示：材料与原型租赁','invoice','演示：概念阶段（虚构）')
  else jsonb_build_object('strategy','Demo: Strategy team','design','Demo: Design team','production','Demo: External production planning','time','Fictional demo time; not actual project work','expense','Demo: Materials and prototype rental','invoice','Demo: Concept phase (fictional)') end;
 for v_project in select value from jsonb_array_elements(v_manifest->'projects') loop
  v_index:=v_index+1;
  insert into public.finance_clients(workspace_id,name,language)
  values(v_workspace.id,v_project->>'client',p_locale) returning id into v_client_id;
  insert into public.projects(workspace_id,code,name,client,budget_minutes,status,color)
  values(v_workspace.id,v_project->>'code',v_project->>'name',v_project->>'client',2280+v_index*180,'active',
   (array['#641dff','#3056d3','#087f8c','#aa3d82','#b8581b','#236f59','#555b75','#943eb5'])[v_index]) returning id into v_project_id;
  if v_first_project is null then v_first_project:=v_project_id; v_first_client:=v_client_id; end if;
  v_phase_index:=0;
  for v_phase in select value from jsonb_array_elements(v_manifest->'phases') loop
   insert into public.tasks(workspace_id,project_id,title,status,assignee_id,due_date,created_by)
   values(v_workspace.id,v_project_id,v_phase->>p_locale,case when v_phase_index=0 then 'doing' else 'todo' end,null,v_week+v_phase_index*2,v_user);
   v_phase_index:=v_phase_index+1;
  end loop;
  -- Existing entry guards stay active. Only the actual creator receives drafts.
  insert into public.time_entries(workspace_id,project_id,user_id,work_date,minutes,note,billable,status)
  values(v_workspace.id,v_project_id,v_user,v_week+(v_index-1)%5,30+v_index*15,v_labels->>'time',true,'draft');
  -- Generic role estimates have no account/person link; these are invented rates.
  v_estimates:=jsonb_build_array(
   jsonb_build_object('label',v_labels->>'strategy','kind','employee','user_id',null,'planned_minutes',600+v_index*60,'cost_rate_minor',5000,'bill_rate_minor',11000),
   jsonb_build_object('label',v_labels->>'design','kind','employee','user_id',null,'planned_minutes',1200+v_index*120,'cost_rate_minor',6500,'bill_rate_minor',12500),
   jsonb_build_object('label',v_labels->>'production','kind','freelancer','user_id',null,'planned_minutes',480,'cost_rate_minor',8000,'bill_rate_minor',14000));
  insert into public.finance_project_plans(workspace_id,project_id,client_id,billing_mode,default_bill_rate_minor,fixed_fee_minor,planned_expenses_minor,lines)
  values(v_workspace.id,v_project_id,v_client_id,case when v_index%2=1 then 'fixed' else 'hourly' end,12500,
   case when v_index%2=1 then 750000+v_index*50000 else 0 end,100000+v_index*5000,v_estimates);
  -- Material rental is not the labor represented by the planning lines.
  insert into public.finance_expenses(workspace_id,project_id,expense_date,description,amount_minor,category,not_time_costed)
  values(v_workspace.id,v_project_id,v_today,v_labels->>'expense',5000+v_index*1250,'other',true);
 end loop;
 -- No billing identity is invented. Manual demo lines never claim draft time.
 insert into public.finance_billing_profiles(workspace_id) values(v_workspace.id);
 perform public.finance_save_draft(jsonb_build_object(
  'workspace_id',v_workspace.id,'client_id',v_first_client,'project_id',v_first_project,'language',p_locale,
  'issue_date',v_today,'due_date',v_today+14,'service_from',v_week,'service_to',v_today,
  'notes',v_manifest->'disclosure'->>p_locale,'payment_instructions','',
  'lines',jsonb_build_array(jsonb_build_object('description',v_labels->>'invoice','quantity',1,'unit_price_minor',250000,'tax_basis_points',1900,'zero_tax_reason','','time_entry_id',null))));
 perform private.audit(v_workspace.id,'demo_create','workspace',v_workspace.id,jsonb_build_object('manifest_version',v_manifest->>'version','fictional_operations',true));
 return v_workspace;
end $$;

create function public.demo_create_workspace(p_name text,p_timezone text,p_locale text,p_request_id uuid)
returns public.workspaces language sql volatile security invoker set search_path='' as $$
 select * from private.demo_create_workspace(p_name,p_timezone,p_locale,p_request_id)
$$;

create function private.demo_archive_workspace(p_workspace_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=private.require_user(); v_workspace public.workspaces; v_demo public.workspace_demos;
begin
 -- Match the user -> workspace order used by role changes and time operations.
 perform private.lock_user(v_user);
 select * into v_workspace from public.workspaces where id=p_workspace_id for update;
 select * into v_demo from public.workspace_demos where workspace_id=p_workspace_id;
 perform private.require_user();
 -- Check raw ownership: current_role deliberately returns NULL after archival.
 if v_demo.workspace_id is null or v_demo.created_by is distinct from v_user or v_workspace.created_by is distinct from v_user
 or not exists(select 1 from public.memberships where workspace_id=p_workspace_id and user_id=v_user and role='owner') then
  raise exception 'DEMO_FORBIDDEN' using errcode='42501';
 end if;
 if v_demo.archived_at is not null then return; end if;
 if exists(select 1 from public.running_timers where workspace_id=p_workspace_id) then
  raise exception 'DEMO_CONFLICT: Stop or discard running timers before archiving.';
 end if;
 update public.workspace_demos set archived_at=now() where workspace_id=p_workspace_id;
 perform private.audit(p_workspace_id,'demo_archive','workspace',p_workspace_id,jsonb_build_object('manifest_version',v_demo.manifest_version));
end $$;

create function public.demo_archive_workspace(p_workspace_id uuid) returns void
language sql volatile security invoker set search_path='' as $$
 select private.demo_archive_workspace(p_workspace_id)
$$;

-- Prevent another member's concurrent timer start from becoming hidden when an
-- owner archives. Timer start already holds its user lock; key-share on the
-- workspace conflicts with archive's update lock. Recheck after that wait.
create function private.guard_demo_timer() returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.workspace_demos where workspace_id=new.workspace_id) then
  perform 1 from public.workspaces where id=new.workspace_id for key share;
  if private.current_role(new.workspace_id) is null then raise exception 'DEMO_FORBIDDEN' using errcode='42501'; end if;
 end if;
 return new;
end $$;
create trigger demo_timer_guard before insert on public.running_timers for each row execute function private.guard_demo_timer();

create or replace function private.finance_assert_can_issue(p_workspace_id uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.finance_require_manager(p_workspace_id);
 if exists(select 1 from public.workspace_demos where workspace_id=p_workspace_id) then
  raise exception 'FINANCE_CONFLICT: Demo workspaces cannot issue invoices.';
 end if;
end $$;

revoke all on function private.demo_manifest(),private.demo_create_workspace(text,text,text,uuid),private.demo_archive_workspace(uuid),private.guard_demo_timer(),public.demo_create_workspace(text,text,text,uuid),public.demo_archive_workspace(uuid) from public,anon,authenticated;
grant execute on function private.demo_create_workspace(text,text,text,uuid),private.demo_archive_workspace(uuid),public.demo_create_workspace(text,text,text,uuid),public.demo_archive_workspace(uuid) to authenticated;
