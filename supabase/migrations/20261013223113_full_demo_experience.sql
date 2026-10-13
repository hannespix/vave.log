-- Complete optional demo; operational records are fictional, never login users.
alter table public.workspace_demos add column experience_version integer not null default 1 check(experience_version in (1,2));
alter table public.memberships add column is_demo boolean not null default false,
 add column demo_title text not null default '' check(length(demo_title)<=240),
 add column demo_studio text not null default '' check(length(demo_studio)<=120),
 add column demo_origin text check(demo_origin in ('public','fictional')),
 add column auth_user_id uuid generated always as (case when is_demo then null else user_id end) stored,
 add constraint memberships_auth_user_id_fkey foreign key(auth_user_id) references auth.users(id),
 add constraint memberships_demo_identity_check check((is_demo and role<>'owner' and demo_origin is not null and email like '%@example.invalid') or (not is_demo and demo_origin is null));
-- Replace only the unconditional identity FK. Composite workspace FKs remain.
alter table public.memberships drop constraint memberships_user_id_fkey;
create index memberships_auth_user on public.memberships(auth_user_id);
create function private.guard_demo_membership() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.is_demo is distinct from old.is_demo or new.demo_origin is distinct from old.demo_origin) then raise exception 'DEMO_IDENTITY_IMMUTABLE'; end if;
 if new.is_demo and (new.role='owner' or not exists(select 1 from public.workspace_demos where workspace_id=new.workspace_id and archived_at is null)) then raise exception 'DEMO_IDENTITY_FORBIDDEN'; end if;
 return new;
end $$;
create trigger membership_demo_guard before insert or update on public.memberships for each row execute function private.guard_demo_membership();
create or replace function private.current_role(p_workspace_id uuid) returns text
language sql stable security definer set search_path='' as $$
 select m.role from public.memberships m join auth.users u on u.id=m.auth_user_id and u.email_confirmed_at is not null
 where m.workspace_id=p_workspace_id and m.user_id=(select auth.uid()) and not m.is_demo
 and m.role in ('owner','manager','member')
 and not exists(select 1 from public.workspace_demos d where d.workspace_id=p_workspace_id and d.archived_at is not null)
$$;

-- A transaction-bound capability exists only inside the authorized upgrader.
-- Unlike a caller-set GUC, clients cannot forge or retain it.
create table private.demo_seed_context(workspace_id uuid primary key references public.workspace_demos(workspace_id),actor uuid not null,transaction_id bigint not null);
alter table private.demo_seed_context enable row level security;
revoke all on private.demo_seed_context from public,anon,authenticated;
create function private.demo_can_seed_entry(p_workspace_id uuid,p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.demo_seed_context c join public.workspace_demos d using(workspace_id)
 join public.memberships m on m.workspace_id=c.workspace_id and m.user_id=p_user_id
 where c.workspace_id=p_workspace_id and c.actor=auth.uid() and c.transaction_id=txid_current()
 and d.created_by=c.actor and d.archived_at is null and d.experience_version=1
 and (m.is_demo or m.user_id=c.actor) and private.current_role(c.workspace_id)='owner')
$$;

create or replace function private.guard_entry() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op='DELETE' then
    if old.status<>'draft' or old.user_id is distinct from auth.uid() then raise exception 'Nur eigene Entwürfe können gelöscht werden.'; end if;
    perform private.lock_user(old.user_id);
    if private.current_role(old.workspace_id) is null then raise exception 'Keine Berechtigung für diesen Workspace.' using errcode='42501'; end if;
    return old;
  end if;
  if tg_op='INSERT' then
    if (new.user_id is distinct from auth.uid() or new.status<>'draft') and not (current_user not in ('anon','authenticated') and private.demo_can_seed_entry(new.workspace_id,new.user_id)) then raise exception 'Nur eigene Entwürfe können erstellt werden.'; end if;
    if current_user in ('anon','authenticated') and new.timer_id is not null then raise exception 'Timer-Zuordnung ist geschützt.'; end if;
  else
    if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id or new.timer_id is distinct from old.timer_id or new.created_at is distinct from old.created_at then
      raise exception 'Identität und Timer-Zuordnung sind unveränderlich.';
    end if;
    if new.status is distinct from old.status then
      if current_user in ('anon','authenticated') then raise exception 'Statuswechsel erfordern die Freigabe-Funktion.'; end if;
      if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'Ein Statuswechsel darf den Inhalt nicht verändern.'; end if;
      if old.status='draft' and new.status='submitted' and old.user_id=auth.uid() then null;
      elsif old.status='submitted' and new.status in ('draft','approved') and private.current_role(old.workspace_id) in ('owner','manager') then null;
      else raise exception 'Ungültiger Statuswechsel.'; end if;
    elsif old.status<>'draft' or old.user_id is distinct from auth.uid() then
      raise exception 'Nur eigene Entwürfe können geändert werden.';
    end if;
  end if;
  perform private.lock_user(new.user_id);
  -- Recheck after waiting: a concurrent owner may have disabled this actor.
  if private.current_role(new.workspace_id) is null then raise exception 'Keine Berechtigung für diesen Workspace.' using errcode='42501'; end if;
  if new.minutes + coalesce((select sum(minutes) from public.time_entries where user_id=new.user_id and workspace_id=new.workspace_id and work_date=new.work_date and id<>new.id),0)>1440 then
    raise exception 'Pro Tag und Workspace sind höchstens 1440 Minuten erlaubt.';
  end if;
  return new;
end $$;

create or replace function private.demo_manifest() returns jsonb language sql immutable set search_path='' as $function$
 select $manifest${
  "version": "vave-full-2026-10-14.2",
  "researched_at": "2026-10-14",
  "disclosure": {
    "en": "Public project credits are historical context, not a current employment roster. All demo roles, assignments, time and financial details are fictional. DEMO — DO NOT PAY.",
    "de": "Öffentliche Projekt-Credits sind historischer Kontext, keine aktuelle Personalliste. Alle Demorollen, Aufgaben, Zeiten und Finanzangaben sind fiktiv. DEMO — NICHT BEZAHLEN.",
    "zh": "公开项目署名仅为历史资料，并非当前员工名单。所有演示角色、任务、工时及财务资料均为虚构。DEMO — 演示文件，请勿付款。"
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
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Haijie Hu",
      "role": "Co-Founder",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Christian Rösner",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Dustin Stupp",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Matthias Sütterlin",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Whan Lee",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Ou Zhiwen",
      "role": "Shenzhen entity representative / strategy",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Yin Shuaibo",
      "role": "Imagination Shanghai entity representative / strategy",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Wang Ling",
      "role": "Imagination Shenzhen entity representative",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Irwan Kassim",
      "role": "Digital Singapore entity representative",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Sankalp Sharma",
      "role": "Dubai entity legal representative",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Charles Lo",
      "role": "VAVE DIGITAL Partner & General Manager",
      "source_url": "https://www.vave.studio/sha/hu-haijie-charles-lo-deliver-lectures-at-school-of-design-ecnu/",
      "origin": "public"
    },
    {
      "name": "Xiaorong Li",
      "role": "Website editorial",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Victoria Cocco",
      "role": "Website editorial",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Wang Zuting",
      "role": "Project management",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Xiong Li",
      "role": "Content planning",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Shao Minmei",
      "role": "Content planning",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Zhao Gun",
      "role": "Content planning",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Ge Yanhan",
      "role": "Content planning",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Li Ziyao",
      "role": "Concept design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Zhou Junlei",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Chen Zhuang",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Lin Zhiqi",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Guo Wenchao",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Ou Xiang",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Tang Jinlin",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Wang Youying",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Liu Luo",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Lin Shunkang",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Jerry Zhang",
      "role": "VAVE DIGITAL software development",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Tab Liu",
      "role": "VAVE DIGITAL software development",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Phil Püschel",
      "role": "Project management",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Wenqian Luo",
      "role": "Design direction",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Peter Mülling",
      "role": "Concept design",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Hussein Nabolsi",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Zi Yi Chua",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Katja Mikhalenka",
      "role": "Schematic design",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Soorim Kim",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Abdul Zakaria",
      "role": "Communication design / digital content management",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Vincent Kropp",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/stc-at-leap25/",
      "origin": "public"
    },
    {
      "name": "Giulia Arienzo",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/stc-at-leap25/",
      "origin": "public"
    },
    {
      "name": "Guifang Du",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/stc-at-leap25/",
      "origin": "public"
    },
    {
      "name": "Gavin Wong",
      "role": "Project management",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Zhao Boxuan",
      "role": "Schematic design",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Wu Yue",
      "role": "Schematic design",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Lydia Li",
      "role": "Schematic design",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Guo Shuyao",
      "role": "Schematic design",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Oly Wang",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Liu Shuo",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Elena Weber",
      "role": "Finance & Operations Lead",
      "studio": "Frankfurt",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Yun Qiao",
      "role": "Narrative Designer",
      "studio": "Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Mei Song",
      "role": "Spatial Designer",
      "studio": "Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Aisha Rahman",
      "role": "Senior Project Manager",
      "studio": "Dubai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Lina Wen",
      "role": "Exhibition Producer",
      "studio": "Imagination Shanghai",
      "kind": "freelancer",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Alex Ren",
      "role": "Technical Producer",
      "studio": "Imagination Shenzhen",
      "kind": "freelancer",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Maya Tan",
      "role": "Interaction Designer",
      "studio": "Digital Singapore",
      "kind": "freelancer",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Noah Li",
      "role": "Creative Technologist",
      "studio": "Digital Shanghai",
      "kind": "freelancer",
      "source_url": "",
      "origin": "fictional"
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
    "https://www.vave.studio/sha/hu-haijie-charles-lo-deliver-lectures-at-school-of-design-ecnu/"
  ],
  "fictional_projects": [
    {
      "code": "TIDE26",
      "name": "Tidal Futures Visitor Centre",
      "client": "Blue Current Foundation"
    },
    {
      "code": "MOVE26",
      "name": "Urban Motion Experience",
      "client": "Novara Mobility"
    },
    {
      "code": "THREAD26",
      "name": "Living Threads Pavilion",
      "client": "Loomline Culture Council"
    },
    {
      "code": "MAT27",
      "name": "Material Tomorrow Lab",
      "client": "Aster Materials"
    },
    {
      "code": "SIGNAL26",
      "name": "Signal Garden Installation",
      "client": "Lumina City Festival"
    }
  ]
}$manifest$::jsonb
$function$;

-- The marker is derived by the database. Draft JSON still rejects is_demo.
alter table public.finance_invoices add column is_demo boolean not null default false;
update public.finance_invoices i set is_demo=true from public.workspace_demos d where d.workspace_id=i.workspace_id;
create function private.demo_invoice_notice(p_language text) returns text language sql immutable set search_path='' as $$
 select case p_language when 'de' then 'DEMO — FIKTIV — NICHT BEZAHLEN' when 'zh' then 'DEMO — 虚构演示文件 — 请勿付款' else 'DEMO — FICTIONAL — DO NOT PAY' end
$$;
create function private.guard_demo_invoice() returns trigger language plpgsql set search_path='' as $$
declare notice text;
begin
 if tg_op='INSERT' then new.is_demo:=exists(select 1 from public.workspace_demos where workspace_id=new.workspace_id);
 elsif new.is_demo is distinct from old.is_demo then raise exception 'DEMO_INVOICE_IMMUTABLE'; end if;
 if new.is_demo then
  notice:=private.demo_invoice_notice(new.language);
  -- Always regenerate the payment warning, even if an owner edits the draft.
  new.payment_instructions:=notice;
  if position(notice in new.notes)=0 then new.notes:=notice||E'\n'||left(new.notes,4000-length(notice)-1); end if;
  if new.number is not null and new.number not like 'DEMO-%' then raise exception 'DEMO_INVOICE_NUMBER'; end if;
  if new.issuer_snapshot is not null then
   new.issuer_snapshot:=new.issuer_snapshot||jsonb_build_object('is_demo',true,'demo_notice',notice,'legal_name',left('DEMO — '||regexp_replace(new.issuer_snapshot->>'legal_name','^DEMO — ',''),160),'tax_id','DEMO-NOT-VALID','payment_details',notice,'footer',notice);
   new.customer_snapshot:=new.customer_snapshot||jsonb_build_object('is_demo',true,'demo_notice',notice,'name',left('DEMO — '||regexp_replace(new.customer_snapshot->>'name','^DEMO — ',''),160),'tax_id','DEMO-NOT-VALID','contact_email','billing@example.invalid');
  end if;
 end if;
 return new;
end $$;
create trigger finance_demo_guard before insert or update on public.finance_invoices for each row execute function private.guard_demo_invoice();
create or replace function private.finance_assert_can_issue(p_workspace_id uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin perform private.finance_require_manager(p_workspace_id); end $$;
create or replace function private.finance_next_number(p_workspace_id uuid,p_prefix text) returns text
language plpgsql security definer set search_path='' as $$
declare n bigint; prefix text:=p_prefix;
begin
 perform private.finance_require_manager(p_workspace_id);
 if exists(select 1 from public.workspace_demos where workspace_id=p_workspace_id) then prefix:='DEMO'; end if;
 insert into private.finance_number_counters(workspace_id,next_number) values(p_workspace_id,2)
 on conflict(workspace_id) do update set next_number=private.finance_number_counters.next_number+1 returning next_number-1 into n;
 return prefix||'-'||lpad(n::text,greatest(6,length(n::text)),'0');
end $$;

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
 insert into public.finance_time_claims(workspace_id,time_entry_id,invoice_id) select p_workspace_id,(l->>'time_entry_id')::uuid,p_id from jsonb_array_elements(calculated) l where l->>'time_entry_id' is not null;
 perform private.audit(p_workspace_id,'finance_issue','invoice',p_id,jsonb_build_object('number',v_number));
 return private.finance_invoice_json(p_workspace_id,p_id);
end $$;

-- Preserve proven provisioning and its request-ID locks, but remove direct access
-- to the old incomplete path. Public wrapper now resolves the enriched version.
alter function private.demo_create_workspace(text,text,text,uuid) rename to demo_create_workspace_base;
revoke all on function private.demo_create_workspace_base(text,text,text,uuid) from public,anon,authenticated;
create function private.demo_upgrade_workspace(p_workspace_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=private.require_user(); w public.workspaces; d public.workspace_demos; v_manifest jsonb:=private.demo_manifest();
 person jsonb; project jsonb; project_row record; v_person uuid; people uuid[]:='{}'; projects uuid[]:='{}'; clients uuid[]:='{}';
 i integer:=0; j integer; v_project uuid; v_client uuid; v_code text; v_kind text;
 today date; week date; day date; labels jsonb; notice text; doc jsonb; line jsonb;
begin
 perform private.lock_user(actor);
 select * into w from public.workspaces where id=p_workspace_id for update;
 select * into d from public.workspace_demos where workspace_id=p_workspace_id for update;
 perform private.require_user();
 if d.workspace_id is null or d.created_by is distinct from actor or w.created_by is distinct from actor
 or d.archived_at is not null or private.current_role(p_workspace_id) is distinct from 'owner' then raise exception 'DEMO_FORBIDDEN' using errcode='42501'; end if;
 if d.experience_version>=2 then return; end if;
 insert into private.demo_seed_context values(p_workspace_id,actor,txid_current());
 today:=(now() at time zone w.timezone)::date; week:=date_trunc('week',now() at time zone w.timezone)::date;
 notice:=private.demo_invoice_notice(d.locale);
 labels:=case d.locale
 when 'de' then jsonb_build_object('time','Fiktive Demozeit — keine echte Projektleistung','task','Demo: Konzept und Umsetzung','expense','Demo: Material, Reise und Prototypen (fiktiv)','company','VAVE Demo Studio — fiktives Unternehmen','address','Demostraße 10, 00000 Beispielstadt — fiktive Adresse','invoice','Demo: Gestaltungsleistung (fiktiv)','cancel','Demo: Fiktive Rechnungskorrektur','estimate','Demo: geplante Projektarbeit','studio','Demo-Zuordnung: ')
 when 'zh' then jsonb_build_object('time','虚构演示工时 — 并非真实项目工作','task','演示：概念与实施','expense','演示：材料、差旅与原型（虚构）','company','VAVE 演示工作室 — 虚构企业','address','虚构地址：示例市演示路10号，00000','invoice','演示：设计服务（虚构）','cancel','演示：虚构发票更正','estimate','演示：计划项目工作','studio','虚构演示分配：')
 else jsonb_build_object('time','Fictional demo time — not actual project work','task','Demo: Concept and delivery','expense','Demo: Materials, travel and prototypes (fictional)','company','VAVE Demo Studio — fictional company','address','10 Example Lane, 00000 Sample City — fictional address','invoice','Demo: Design services (fictional)','cancel','Demo: Fictional invoice correction','estimate','Demo: Planned project work','studio','Fictional demo assignment: ') end;
 -- Only pristine v1 reference clients receive fictional contact details.
 -- Any user-supplied address, tax ID or contact protects the whole record.
 update public.finance_clients c set billing_address=labels->>'address',contact_email='billing@example.invalid',tax_id='DEMO-NOT-VALID'
 where c.workspace_id=p_workspace_id and c.billing_address='' and c.contact_email='' and c.tax_id=''
 and exists(select 1 from jsonb_array_elements(v_manifest->'projects') p where p->>'client'=c.name);
 -- No invitation or auth.users write. Reserved invalid mailboxes cannot deliver.
 for person in select value from jsonb_array_elements(v_manifest->'people') loop
  i:=i+1; v_person:=gen_random_uuid(); people:=array_append(people,v_person);
  v_kind:=coalesce(person->>'kind',case when i%6=0 then 'freelancer' else 'employee' end);
  insert into public.memberships(workspace_id,user_id,role,display_name,email,is_demo,demo_title,demo_studio,demo_origin)
  values(p_workspace_id,v_person,case when i%9=0 then 'manager' else 'member' end,person->>'name','demo-'||i||'@example.invalid',true,person->>'role',case when person->>'studio' is null then '' else labels->>'studio'||(person->>'studio') end,person->>'origin');
  insert into public.finance_staff_rates(workspace_id,user_id,kind,effective_from,cost_rate_minor,bill_rate_minor)
  values(p_workspace_id,v_person,v_kind,week-70,4500+(i%7)*500,9500+(i%8)*750);
 end loop;
 -- Own demo rates are added only when the actor has never configured rates.
 if not exists(select 1 from public.finance_staff_rates where workspace_id=p_workspace_id and user_id=actor) then
  insert into public.finance_staff_rates(workspace_id,user_id,kind,effective_from,cost_rate_minor,bill_rate_minor) values(p_workspace_id,actor,'employee',week-70,6500,12500);
 end if;
 i:=0;
 for project in select value from jsonb_array_elements(v_manifest->'fictional_projects') loop
  i:=i+1; v_code:=project->>'code';
  if exists(select 1 from public.projects where workspace_id=p_workspace_id and code=v_code) then v_code:=left(v_code,14)||'-'||left(gen_random_uuid()::text,8); end if;
  insert into public.finance_clients(workspace_id,name,billing_address,contact_email,tax_id,language)
  values(p_workspace_id,project->>'client',labels->>'address','billing-'||i||'@example.invalid','DEMO-NOT-VALID',d.locale) returning id into v_client;
  clients:=array_append(clients,v_client);
  insert into public.projects(workspace_id,code,name,client,budget_minutes,status,color)
  values(p_workspace_id,v_code,project->>'name',project->>'client',case when i=2 then 480 else 15000+i*1000 end,
  case when i=4 then 'paused' when i=5 then 'archived' else 'active' end,(array['#087f8c','#aa3d82','#3056d3','#b8581b','#236f59'])[i]) returning id into v_project;
  projects:=array_append(projects,v_project);
  line:=jsonb_build_array(jsonb_build_object('label',labels->>'estimate','kind','employee','user_id',people[i],
   'planned_minutes',case when i=2 then 480 else 12000 end,'cost_rate_minor',4500+(i%7)*500,'bill_rate_minor',9500+(i%8)*750),
   jsonb_build_object('label',labels->>'estimate','kind','freelancer','user_id',people[54+(i%4)],'planned_minutes',600,'cost_rate_minor',7500,'bill_rate_minor',14000));
  insert into public.finance_project_plans(workspace_id,project_id,client_id,billing_mode,default_bill_rate_minor,fixed_fee_minor,planned_expenses_minor,lines)
  values(p_workspace_id,v_project,v_client,case when i=3 then 'internal' when i in (1,4) then 'fixed' else 'hourly' end,12500,case when i in (1,4) then 4500000 else 0 end,100000,line);
  for j in 0..3 loop
   insert into public.finance_expenses(workspace_id,project_id,expense_date,description,amount_minor,category,not_time_costed)
   values(p_workspace_id,v_project,week-j*7,labels->>'expense',12500+i*2500+j*500,case when j%2=0 then 'external' else 'other' end,true);
  end loop;
 end loop;
 -- Every public project is operationally populated without modifying v1 records.
 for project_row in select id from public.projects where workspace_id=p_workspace_id order by created_at,id loop
  for j in 0..2 loop
   i:=i+1;
   insert into public.tasks(workspace_id,project_id,title,status,assignee_id,due_date,created_by)
   values(p_workspace_id,project_row.id,(v_manifest->'phases'->j->>d.locale), (array['done','doing','todo'])[j+1],people[1+(i%array_length(people,1))],week-2+j*4,actor);
  end loop;
 end loop;
 -- Six recent weeks per persona, with all review states in the current week.
 for i in 1..array_length(people,1) loop
  for j in 0..5 loop
   select id into v_project from public.projects where workspace_id=p_workspace_id order by code offset ((i+j)%13) limit 1;
   insert into public.time_entries(workspace_id,project_id,user_id,work_date,minutes,note,billable,status)
   values(p_workspace_id,v_project,people[i],least(today,week-j*7+(i%5)),120+(i%5)*45,labels->>'time',i%5<>0,(array['draft','submitted','approved'])[1+((i+j)%3)]);
  end loop;
 end loop;
 -- Useful owner overview, including their ordinary interactive timer workflow.
 for j in 0..2 loop
  day:=least(today,week+j);
  if coalesce((select sum(minutes) from public.time_entries where workspace_id=p_workspace_id and user_id=actor and work_date=day),0)<=1410 then
   insert into public.time_entries(workspace_id,project_id,user_id,work_date,minutes,note,billable,status)
   values(p_workspace_id,projects[1],actor,day,30,labels->>'time',j<>2,(array['draft','submitted','approved'])[j+1]);
  end if;
  insert into public.tasks(workspace_id,project_id,title,status,assignee_id,due_date,created_by)
  values(p_workspace_id,projects[j+1],labels->>'task',(array['todo','doing','done'])[j+1],actor,week+j+1,actor);
 end loop;
 -- Fill only a pristine profile. Existing user configuration is never overwritten.
 insert into public.finance_billing_profiles(workspace_id,legal_name,billing_address,tax_id,payment_details,invoice_prefix,footer)
 values(p_workspace_id,labels->>'company',labels->>'address','DEMO-NOT-VALID',notice,'DEMO',notice)
 on conflict(workspace_id) do update set legal_name=excluded.legal_name,billing_address=excluded.billing_address,tax_id=excluded.tax_id,payment_details=excluded.payment_details,invoice_prefix=excluded.invoice_prefix,footer=excluded.footer
 where public.finance_billing_profiles.legal_name='' and public.finance_billing_profiles.billing_address='' and public.finance_billing_profiles.tax_id='' and public.finance_billing_profiles.payment_details='' and public.finance_billing_profiles.invoice_prefix='INV' and public.finance_billing_profiles.footer='';
 -- Rich invoice states use the normal draft/issue/payment/cancellation functions.
 -- Demo-only snapshot fallbacks preserve partially configured user profiles.
 for i in 1..5 loop
  doc:=public.finance_save_draft(jsonb_build_object('workspace_id',p_workspace_id,'client_id',clients[i],'project_id',projects[i],'language',d.locale,
   'issue_date',today-case when i=4 then 45 else 7 end,'due_date',today+case when i=4 then -15 else 14 end,'service_from',week-42,'service_to',today,
   'notes',v_manifest->'disclosure'->>d.locale,'payment_instructions',notice,
   'lines',jsonb_build_array(jsonb_build_object('description',labels->>'invoice','quantity',1,'unit_price_minor',150000+i*50000,'tax_basis_points',1900,'zero_tax_reason','','time_entry_id',null))));
  if i>1 then
   doc:=public.finance_issue_invoice(p_workspace_id,(doc->>'id')::uuid);
   if i=3 then perform public.finance_set_paid(p_workspace_id,(doc->>'id')::uuid,true); end if;
   if i=5 then perform public.finance_cancel_invoice(p_workspace_id,(doc->>'id')::uuid,labels->>'cancel'); end if;
  end if;
 end loop;
 delete from private.demo_seed_context where workspace_id=p_workspace_id;
 update public.workspace_demos set experience_version=2,manifest=v_manifest,manifest_version=v_manifest->>'version' where workspace_id=p_workspace_id;
 perform private.audit(p_workspace_id,'demo_upgrade','workspace',p_workspace_id,jsonb_build_object('experience_version',2,'fictional_operations',true));
end $$;
create function public.demo_upgrade_workspace(p_workspace_id uuid) returns void language sql volatile security invoker set search_path='' as $$
 select private.demo_upgrade_workspace(p_workspace_id)
$$;
create function private.demo_create_workspace(p_name text,p_timezone text,p_locale text,p_request_id uuid) returns public.workspaces
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); existed boolean; w public.workspaces;
begin
 perform private.lock_user(actor);
 select exists(select 1 from public.workspace_demos where created_by=actor and request_id=p_request_id) into existed;
 select * into w from private.demo_create_workspace_base(p_name,p_timezone,p_locale,p_request_id);
 if not existed then
  -- The legacy seed used weekday slots; newly created history stops at today.
  -- Existing demo retries and their user-entered dates are never changed.
  update public.time_entries set work_date=(now() at time zone w.timezone)::date
   where workspace_id=w.id and work_date>(now() at time zone w.timezone)::date;
  perform private.demo_upgrade_workspace(w.id);
 end if;
 return w;
end $$;
revoke all on function private.guard_demo_membership(),private.demo_can_seed_entry(uuid,uuid),private.demo_invoice_notice(text),private.guard_demo_invoice(),private.demo_upgrade_workspace(uuid),public.demo_upgrade_workspace(uuid),private.demo_create_workspace(text,text,text,uuid) from public,anon,authenticated;
-- Guard helpers need invoker execution; only the internal table can grant capability.
grant execute on function private.demo_can_seed_entry(uuid,uuid),private.demo_invoice_notice(text),private.demo_upgrade_workspace(uuid),public.demo_upgrade_workspace(uuid),private.demo_create_workspace(text,text,text,uuid) to authenticated;
